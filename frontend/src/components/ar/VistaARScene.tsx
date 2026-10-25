import {
  Viro3DObject,
  ViroAmbientLight,
  ViroAnimations,
  ViroARScene,
  ViroDirectionalLight,
  ViroMaterials,
  ViroNode,
  ViroParticleEmitter,
  ViroPolygon,
  ViroQuad,
  ViroSpatialSound,
  ViroSphere,
  ViroSpotLight,
  ViroTrackingStateConstants,
  type ViroAnchor,
  type ViroCameraARHitTest,
  type ViroCameraTransform,
} from "@reactvision/react-viro";
import { type ComponentProps, useEffect, useRef, useState } from "react";
import { Dimensions, PixelRatio } from "react-native";

import smoke from "@/assets/images/effects/humo.png";
import { Balloons } from "@/components/ar/Balloons";
import {
  arSession,
  type ArSessionState,
  type FieldShot,
  type HostCommand,
  useArSession,
  type Vec3,
} from "@/hooks/useArSession";
import type { DynamicSceneObject, SceneObject } from "@/types/simulation";

// El piso está entre MIN y MAX_FLOOR_DROP (m) bajo el teléfono, de pie o sentado. Más cerca suele ser
// un escritorio o una silla (el personaje quedaba gigante y flotando); más lejos, un plano fantasma
// de ARCore (quedaba enano y hundido)
const MIN_FLOOR_DROP = 0.85;
const MAX_FLOOR_DROP = 2.1;
const isFloorDrop = (drop: number) => drop > MIN_FLOOR_DROP && drop < MAX_FLOOR_DROP;
// Un plano cuenta como piso si está a esta distancia (m) del plano horizontal más bajo
const FLOOR_TOLERANCE = 0.15;
// Ignoramos planos diminutos, que suelen ser ruido. Bajo: los primeros planos que da ARCore son chicos
// y esperar a que crezcan retrasaba mucho la detección (igual gana el más grande)
const MIN_PLANE_AREA = 0.06;
// En algunos Android ARCore alterna NORMAL/UNAVAILABLE varias veces por segundo: solo damos el
// rastreo por perdido si sigue así este tiempo, si no el personaje nunca llega a colocarse
const TRACKING_LOST_GRACE_MS = 1000;
// Si ARCore todavía no confirmó un plano de piso, aceptamos estos hits (menos precisos) para que
// el usuario igual pueda colocar al personaje tocando el botón
// Cuando el rastreo de ARCore diverge devuelve hits a decenas de metros: no son el piso
const MAX_HIT_DISTANCE = 4;
// Para conocer solo la altura del piso aceptamos hits más lejanos: mirando al frente con poca
// inclinación el centro de la pantalla corta el piso a 4–6 m
const MAX_LEVEL_HIT_DISTANCE = 8;
// Mirando al frente el centro de la pantalla ve el piso lejos y con poca textura: además probamos
// puntos de la parte baja (fracción del ancho/alto), donde el piso está a 1–2 m, para medir su altura.
// No tan abajo: ahí suele quedar el dedo que sostiene el teléfono tapando la cámara
const PROBE_POINTS: [number, number][] = [
  [0.5, 0.62],
  [0.3, 0.72],
  [0.7, 0.72],
];
const PROBE_INTERVAL_MS = 300;
// Sin planos medidos los hits de respaldo varían hasta ±0,5 m entre lecturas: la altura del piso es la
// mediana de las lecturas de este último lapso (ms), no la de una sola
const PROBE_WINDOW_MS = 4000;
// La mayoría de los frames no traen hit: mantenemos el último punto un rato para que el
// anillo (y el botón) no parpadeen
const FLOOR_HOLD_MS = 1500;
const FALLBACK_HIT_TYPES = new Set(["EstimatedHorizontalPlane", "FeaturePoint", "DepthPoint"]);
const isFallbackHit = (type: string) => type.startsWith("ExistingPlane") || FALLBACK_HIT_TYPES.has(type);
// El anillo va donde el rayo del centro de la pantalla corta el plano del piso: inclinar el teléfono
// lo acerca o lo aleja. Lo limitamos a este rango horizontal (m) para que no quede bajo los pies ni
// en el horizonte cuando se apunta recto o por encima de él
const MIN_PLACE_DISTANCE = 0.8;
const MAX_PLACE_DISTANCE = 6;
// Solo el anillo flota apenas sobre el piso (el personaje no), para que no parpadee contra él
const RETICLE_LIFT = 0.04;
// Movimientos del anillo menores a esto (m) no se publican: no se notan y re-renderizan la escena y la UI
const MIN_FLOOR_MOVE = 0.01;
// El anfitrión camina hacia el usuario si se aleja más de FOLLOW_START (m) y se detiene al quedar a
// FOLLOW_STOP; la diferencia evita que arranque y frene a cada paso
const FOLLOW_START = 2.2;
const FOLLOW_STOP = 1.3;
// m/s, al ritmo de los pasos de la animación "caminar"
const WALK_SPEED = 1.1;
// Se gira hacia el usuario cuando quedó a más de TURN_START grados y para al quedar a TURN_STOP:
// así no tiembla con el pulso del teléfono
const TURN_START = 15;
const TURN_STOP = 2;
// grados/s
const TURN_SPEED = 120;
// Más cerca que esto la dirección al usuario es inestable: no se gira
const MIN_LOOK_DISTANCE = 0.3;
// Foco y sombra van sobre el anfitrión (en el marco de la colocación) y lo acompañan al caminar
const LIGHT_OFFSET: Vec3 = [0.6, 4, 1.2];
// Modo "mover": metros que avanza por cada px que se desliza el dedo, por metro de distancia a la
// cámara (así se siente igual cerca que lejos). Alejar/acercar rinde más: el piso se ve en escorzo
const MOVE_GAIN = 1 / 500;
const MOVE_GAIN_FORWARD = 1.6;
// Ningún evento del dedo lo mueve más que esto (m): un salto del gesto no lo manda lejos
const MAX_MOVE_STEP = 0.12;
// Más cerca o más lejos que esto (m) de la cámara no se lo puede llevar
const MIN_EDIT_DISTANCE = 0.6;
const MAX_EDIT_DISTANCE = 5;
// grados/s al girar hacia una orientación elegida (de frente, de lado…)
const EDIT_TURN_SPEED = 240;
// Al tocar el piso, preferimos los hits más confiables
const TAP_HIT_PRIORITY = ["ExistingPlane", "DepthPoint", "EstimatedHorizontalPlane", "FeaturePoint"];
const DEG = Math.PI / 180;
// Coreografía de campo (las trincheras): su centro queda a esta distancia (m) delante del usuario, así
// la línea de fuego pasa frente a él y ve un bando a cada lado
const FIELD_DISTANCE = 3;
// Por debajo de esto la dirección horizontal de la cámara es inestable (mira recto al piso o al cielo)
const MIN_FIELD_AIM = 0.2;
// Sombra del campo: cubre los dos parapetos (a ±7,6 m) y algo más
const FIELD_SHADOW: [number, number] = [22, 8];
// Lo que dura el fogonazo de un disparo
const FLASH_MS = 90;
// Una sola bocanada de humo al disparar. El nativo de Viro (Android e iOS) espera una lista de ráfagas,
// aunque sus tipos de TypeScript digan un objeto: con el objeto suelto la app se cae
type SmokeBurst = NonNullable<NonNullable<ComponentProps<typeof ViroParticleEmitter>["spawnBehavior"]>["emissionBurst"]>;
const SMOKE_BURST = [{ time: 0, min: 12, max: 16, cycles: 1 }] as unknown as SmokeBurst;

ViroMaterials.createMaterials({
  reticle: { lightingModel: "Constant", diffuseColor: "#E66F3DEE", cullMode: "None" },
  fogonazo: { lightingModel: "Constant", diffuseColor: "#FFC46B" },
});

// Anillo para marcar en el piso dónde aparecerá el personaje
const RING = (() => {
  const outer: [number, number][] = [];
  const inner: [number, number][] = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    outer.push([Math.cos(a) * 0.3, Math.sin(a) * 0.3]);
    inner.push([Math.cos(a) * 0.22, Math.sin(a) * 0.22]);
  }
  return { outer, holes: [inner] };
})();

type HitResult = { type: string; transform: { position: number[] } };

/**
 * Pose del anfitrión sobre el piso, relativa al nodo de colocación; la mueven el seguimiento y el modo
 * "mover". `y` corrige la altura del piso donde se lo llevó tocando la pantalla (0 = el de la colocación)
 */
type HostPose = { placementId: number; x: number; y: number; z: number; yaw: number; turning: boolean; walking: boolean };

function initialPose(placementId: number, host: SceneObject): HostPose {
  const [x, , z] = host.transform.position;
  return { placementId, x, y: 0, z, yaw: host.transform.rotation[1], turning: false, walking: false };
}

/** Punto del mundo (x, z) en el marco del nodo de colocación (trasladado a `point` y girado `yaw` en Y). */
function toPlacementFrame(placement: { point: Vec3; yaw: number }, x: number, z: number): [number, number] {
  const t = placement.yaw * DEG;
  const wx = x - placement.point[0];
  const wz = z - placement.point[2];
  return [wx * Math.cos(t) - wz * Math.sin(t), wx * Math.sin(t) + wz * Math.cos(t)];
}

/** Ángulo equivalente en (-180, 180] */
function wrapDegrees(a: number): number {
  const r = ((a % 360) + 360) % 360;
  return r > 180 ? r - 360 : r;
}

export function VistaARScene() {
  const placement = useArSession((s) => s.placement);
  const floor = useArSession((s) => s.floor);
  const animation = useArSession((s) => s.animation);
  const objects = useArSession((s) => s.objects);
  // Tamaño de los modelos: corrección automática de la colocación por el ajuste manual
  const sizeScale = useArSession((s) => s.sizeScale);
  const size = (placement?.autoScale ?? 1) * sizeScale;
  const battle = useArSession((s) => s.battle);
  const preload = useArSession((s) => s.preload);
  const choreography = useArSession((s) => s.choreography);
  const field = useArSession((s) => s.field);
  const firing = useArSession((s) => s.firing);
  // El anfitrión (primer objeto dinámico) saluda al aparecer y cuando lo tocan
  const host = objects.find((o): o is DynamicSceneObject => o.kind === "dynamic");
  const hostId = host?.id;
  // Coreografía de campo: todo salvo el anfitrión va en el marco del campo; el anfitrión sigue libre
  const fieldLayout = choreography?.layout === "field";
  const inField = (obj: SceneObject) => fieldLayout && obj.id !== hostId;
  // La coreografía en escenario (la batalla) maneja también al anfitrión
  const stageBattle = battle !== "off" && !fieldLayout;
  // Si llega caminando, su entrada ya define dónde queda: ese no sigue al usuario. En la batalla
  // tampoco: la coreografía decide dónde está cada uno
  const movableHost = host && !host.entrance && !stageBattle ? host : undefined;
  const tracking = useArSession((s) => s.tracking);
  const lastUpdate = useRef(0);
  const lastHitLog = useRef(0);
  const lastFloorAt = useRef(0);
  const planes = useRef(new Map<string, { y: number; area: number }>());
  // Altura del último plano real que tocó el centro de la pantalla: es el piso que el usuario está viendo
  const aimLevel = useRef<number | null>(null);
  // Altura del piso según los hit tests de la parte baja de la pantalla
  const probeLevel = useRef<number | null>(null);
  const probeSamples = useRef<{ y: number; at: number }[]>([]);
  const lastProbe = useRef(0);
  const probing = useRef(false);
  const scene = useRef<ViroARScene>(null);
  const trackingLostTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hostPose = useRef<HostPose | null>(null);
  // Copia de la pose cada vez que se queda quieto: es la que va en las props de React
  const [settledPose, setSettledPose] = useState<HostPose | null>(null);
  const hostMoving = useRef(false);
  const lastFrameAt = useRef(0);
  const hostNode = useRef<ViroNode>(null);
  const spotLight = useRef<ViroSpotLight>(null);
  const shadow = useRef<ViroQuad>(null);
  // Anillo bajo el anfitrión mientras está en modo "mover"
  const editRing = useRef<ViroPolygon>(null);
  const editing = useArSession((s) => s.editing);
  // Última pose de la cámara (posición y dirección) para traducir el dedo a movimiento en el piso
  const lastCamera = useRef<{ position: Vec3; forward: Vec3 } | null>(null);
  // Orientación (yaw) a la que se está girando por una orden del modo "mover"
  const targetYaw = useRef<number | null>(null);
  const wasEditing = useRef(false);

  useEffect(() => () => {
    if (trackingLostTimer.current) clearTimeout(trackingLostTimer.current);
  }, []);

  // El piso es el plano horizontal más grande. No usamos el más bajo: ARCore a veces detecta planos
  // fantasma decenas de cm bajo el piso real y el anillo quedaba enterrado
  function largestPlaneY(): number | null {
    let best: { y: number; area: number } | null = null;
    for (const p of planes.current.values()) if (!best || p.area > best.area) best = p;
    return best?.y ?? null;
  }

  function onPlane(anchor: ViroAnchor) {
    if (anchor.type !== "plane" || !anchor.alignment?.startsWith("Horizontal")) return;
    const area = (anchor.width ?? 0) * (anchor.height ?? 0);
    if (area < MIN_PLANE_AREA) return;
    if (__DEV__ && !planes.current.has(anchor.anchorId)) console.log("[AR] plano", anchor.anchorId, anchor.position[1], area.toFixed(2));
    planes.current.set(anchor.anchorId, { y: anchor.position[1], area });
    const floorY = largestPlaneY();
    const current = arSession.get().floorY;
    if (floorY !== null && (current === null || Math.abs(current - floorY) > 0.01)) arSession.set({ floorY });
  }

  function onPlaneRemoved(anchor?: ViroAnchor) {
    if (!anchor) return;
    planes.current.delete(anchor.anchorId);
    arSession.set({ floorY: largestPlaneY() });
  }

  function onTrackingUpdated(trackingState: unknown, reason?: unknown) {
    if (__DEV__) console.log("[AR] tracking", { state: trackingState, reason });
    if (trackingState === ViroTrackingStateConstants.TRACKING_NORMAL) {
      if (trackingLostTimer.current) clearTimeout(trackingLostTimer.current);
      trackingLostTimer.current = null;
      arSession.set({ tracking: true });
      return;
    }
    if (trackingLostTimer.current) return;
    trackingLostTimer.current = setTimeout(() => {
      trackingLostTimer.current = null;
      arSession.set({ tracking: false });
    }, TRACKING_LOST_GRACE_MS);
  }

  /** Punto donde la vista corta el piso (a altura `floorLevel`), acotado a [MIN, MAX]_PLACE_DISTANCE. */
  function aimPoint(camera: Vec3, forward: number[], floorLevel: number, hit?: Vec3): Vec3 | null {
    let dx = forward[0];
    let dz = forward[2];
    // Mirando casi recto al piso el forward horizontal es inestable: usamos la dirección al hit
    if (Math.hypot(dx, dz) < 0.2 && hit) {
      dx = hit[0] - camera[0];
      dz = hit[2] - camera[2];
    }
    const len = Math.hypot(dx, dz);
    if (len < 1e-3) return null;
    // Distancia horizontal hasta el piso por el rayo de la cámara; mirando al horizonte o más arriba, el máximo
    const drop = camera[1] - floorLevel;
    const distance =
      forward[1] < -1e-3 ? (drop / -forward[1]) * Math.hypot(forward[0], forward[2]) : MAX_PLACE_DISTANCE;
    const d = Math.min(MAX_PLACE_DISTANCE, Math.max(MIN_PLACE_DISTANCE, distance));
    return [camera[0] + (dx / len) * d, floorLevel, camera[2] + (dz / len) * d];
  }

  /** Altura del piso más confiable entre hits: primero planos reales, si no puntos de respaldo. */
  function levelFromHits(results: HitResult[], camera: Vec3): number | undefined {
    const usable = results.filter(({ transform: { position: [x, y, z] } }) =>
      isFloorDrop(camera[1] - y) &&
      Math.hypot(x - camera[0], y - camera[1], z - camera[2]) < MAX_LEVEL_HIT_DISTANCE,
    );
    return (
      usable.find((r) => r.type.startsWith("ExistingPlane")) ?? usable.find((r) => isFallbackHit(r.type))
    )?.transform.position[1];
  }

  // Hit tests en la parte baja de la pantalla (asíncronos, sin solaparse) para medir la altura del piso
  function probeFloor(camera: Vec3, now: number) {
    if (probing.current || !scene.current || now - lastProbe.current < PROBE_INTERVAL_MS) return;
    lastProbe.current = now;
    probing.current = true;
    const { width, height } = Dimensions.get("window");
    const ratio = PixelRatio.get();
    // Viro espera píxeles físicos (enteros en Android)
    Promise.all(
      PROBE_POINTS.map(([fx, fy]) =>
        scene
          .current!.performARHitTestWithPoint(Math.round(fx * width * ratio), Math.round(fy * height * ratio))
          .catch((e: unknown) => {
            if (__DEV__) console.warn("[AR] probe falló", e);
            return [];
          }),
      ),
    )
      .then((all: HitResult[][]) => {
        const levels = all.map((r) => levelFromHits(r ?? [], camera)).filter((l) => l !== undefined);
        if (!levels.length) return;
        // La mediana de las lecturas recientes descarta puntos sueltos (una silla, un zócalo, ruido)
        const at = Date.now();
        const samples = probeSamples.current.filter((p) => at - p.at < PROBE_WINDOW_MS);
        for (const y of levels) samples.push({ y, at });
        probeSamples.current = samples;
        const sorted = samples.map((p) => p.y).sort((a, b) => a - b);
        probeLevel.current = sorted[Math.floor(sorted.length / 2)];
        if (__DEV__) console.log("[AR] probe", JSON.stringify({ levels, camera }));
      })
      .finally(() => {
        probing.current = false;
      });
  }

  // Se dispara cada frame con el hit test del centro de la pantalla
  function onCameraARHitTest({ hitTestResults, cameraOrientation }: ViroCameraARHitTest) {
    if (arSession.get().placement) return;
    const now = Date.now();
    if (now - lastUpdate.current < 120) return;
    lastUpdate.current = now;

    const camera = cameraOrientation.position as Vec3;
    const { floorY } = arSession.get();
    if (__DEV__ && now - lastHitLog.current > 1000) {
      lastHitLog.current = now;
      console.log(
        "[AR] hit",
        JSON.stringify({ camera, floorY, hits: hitTestResults.map((r) => [r.type, r.transform?.position]) }),
      );
    }
    probeFloor(camera, now);
    const belowCamera = (y: number) => isFloorDrop(camera[1] - y);
    const near = ([x, y, z]: number[]) =>
      Math.hypot(x - camera[0], y - camera[1], z - camera[2]) < MAX_HIT_DISTANCE;
    const hits = hitTestResults.filter((r) => near(r.transform.position));
    // Si el centro de la pantalla toca un plano real del piso, el anillo va justo ahí (distancia exacta)
    const planeHit = hits.find((r) => r.type.startsWith("ExistingPlane") && belowCamera(r.transform.position[1]));
    if (planeHit) aimLevel.current = planeHit.transform.position[1];
    // Si no (apuntando más lejos o al horizonte), basta conocer la altura del piso: el último plano
    // apuntado, el plano de piso detectado, la altura medida en la parte baja de la pantalla o, si no,
    // un hit (más lejano o menos preciso) del centro
    const level = (y: number | null) => (y !== null && belowCamera(y) ? y : undefined);
    const floorLevel =
      level(aimLevel.current) ??
      level(floorY) ??
      level(probeLevel.current) ??
      levelFromHits(hitTestResults, camera);
    const hit = hits.find((r) => floorLevel !== undefined && Math.abs(r.transform.position[1] - floorLevel) < FLOOR_TOLERANCE);
    const point = planeHit
      ? (planeHit.transform.position as Vec3)
      : floorLevel === undefined
        ? null
        : aimPoint(camera, cameraOrientation.forward, floorLevel, hit?.transform.position as Vec3 | undefined);
    if (point) {
      lastFloorAt.current = now;
      const prev = arSession.get().floor;
      const moved = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > MIN_FLOOR_MOVE;
      if (!prev || moved(prev.point, point) || moved(prev.camera, camera)) arSession.set({ floor: { point, camera } });
    } else if (now - lastFloorAt.current > FLOOR_HOLD_MS) {
      arSession.set({ floor: null });
    }
  }

  function applyPose({ x, y, z, yaw }: HostPose) {
    hostNode.current?.setNativeProps({ position: [x, y, z], rotation: [0, yaw, 0] });
    shadow.current?.setNativeProps({ position: [x, y, z] });
    // setNativeProps está tipado con todas las props del polígono, pero acepta solo las que cambian
    editRing.current?.setNativeProps({ position: [x, y + RETICLE_LIFT, z] } as ComponentProps<typeof ViroPolygon>);
    spotLight.current?.setNativeProps({ position: [x + LIGHT_OFFSET[0], y + LIGHT_OFFSET[1], z + LIGHT_OFFSET[2]] });
  }

  /** Pose actual del anfitrión movible (la crea en la primera consulta de cada colocación). */
  function currentPose(): HostPose | null {
    const { placement, tracking, objects } = arSession.get();
    const current = objects.find((o) => o.kind === "dynamic");
    if (!placement || !tracking || !current || current.entrance) return null;
    if (hostPose.current?.placementId !== placement.id) hostPose.current = initialPose(placement.id, current);
    return hostPose.current;
  }

  // Modo "mover": el dedo lo desliza por el piso en la dirección en que se lo ve (derecha/izquierda
  // en pantalla = derecha/izquierda real; arriba = alejarlo); los botones lo orientan
  function onHostCommand(command: HostCommand) {
    if (command.type === "place") {
      placeAtScreen(command.x, command.y);
      return;
    }
    const { placement } = arSession.get();
    const pose = currentPose();
    const camera = lastCamera.current;
    if (!placement || !pose || !camera) return;
    const [cx, cz] = toPlacementFrame(placement, camera.position[0], camera.position[2]);
    // Yaw con el que mira al usuario (el modelo mira hacia +Z)
    const towardUser = Math.atan2(cx - pose.x, cz - pose.z) / DEG;

    if (command.type === "rotate") {
      targetYaw.current = null;
      pose.yaw = wrapDegrees(pose.yaw + command.degrees);
      applyPose(pose);
      return;
    }
    if (command.type === "face") {
      const offset =
        command.side === "front"
          ? 0
          : command.side === "back"
            ? 180
            : // De lado: el perfil más cercano al actual; si ya está de lado, el otro
              wrapDegrees(pose.yaw - towardUser) > 45 && wrapDegrees(pose.yaw - towardUser) < 135
              ? -90
              : 90;
      targetYaw.current = wrapDegrees(towardUser + offset);
      return;
    }

    // Ejes en el marco de colocación: adelante = hacia donde mira la cámara, sobre el piso
    const [fx, fz] = toPlacementFrame(placement, placement.point[0] + camera.forward[0], placement.point[2] + camera.forward[2]);
    const flen = Math.hypot(fx, fz);
    if (flen < 1e-3) return;
    const ax = fx / flen;
    const az = fz / flen;
    const distance = Math.hypot(pose.x - cx, pose.z - cz);
    const gain = Math.min(Math.max(distance, 1), MAX_EDIT_DISTANCE) * MOVE_GAIN;
    // Derecha de la cámara sobre el piso: el adelante girado -90° (Y hacia arriba)
    let mx = -az * command.right * gain + ax * command.up * gain * MOVE_GAIN_FORWARD;
    let mz = ax * command.right * gain + az * command.up * gain * MOVE_GAIN_FORWARD;
    const step = Math.hypot(mx, mz);
    if (step > MAX_MOVE_STEP) {
      mx *= MAX_MOVE_STEP / step;
      mz *= MAX_MOVE_STEP / step;
    }
    // No más cerca ni más lejos de la cámara que el rango permitido
    let nx = pose.x + mx - cx;
    let nz = pose.z + mz - cz;
    const d = Math.hypot(nx, nz);
    if (d < 1e-3) return;
    const clamped = Math.min(MAX_EDIT_DISTANCE, Math.max(MIN_EDIT_DISTANCE, d));
    nx = (nx / d) * clamped;
    nz = (nz / d) * clamped;
    pose.x = cx + nx;
    pose.z = cz + nz;
    applyPose(pose);
  }

  // Toque en modo "mover": lo lleva al punto del piso tocado. Si ahí hay un hit real del piso, también
  // toma su altura: si la colocación quedó con el piso mal medido, así los pies quedan en el piso de
  // verdad y el tamaño se ve bien (con el piso muy abajo quedaba lejos y se veía enano)
  async function placeAtScreen(screenX: number, screenY: number) {
    const ratio = PixelRatio.get();
    let results: HitResult[] = [];
    try {
      // Viro espera píxeles físicos (enteros en Android)
      results = (await scene.current?.performARHitTestWithPoint(Math.round(screenX * ratio), Math.round(screenY * ratio))) ?? [];
    } catch (e) {
      if (__DEV__) console.warn("[AR] hit test del toque falló", e);
    }
    const { placement, faceUser } = arSession.get();
    const pose = currentPose();
    const camera = lastCamera.current;
    if (!placement || !pose || !camera) return;
    const [cx, cy, cz] = camera.position;
    // Altura del piso donde está ahora
    const currentFloorY = placement.point[1] + pose.y;

    // Un hit a una altura creíble de piso bajo el teléfono (el más confiable); si no hay, cualquier
    // hit marca la dirección del toque y el punto es donde ese rayo corta el piso actual
    const floorHits = results.filter(
      (r) => isFloorDrop(cy - r.transform.position[1]) && Math.hypot(r.transform.position[0] - cx, r.transform.position[2] - cz) < MAX_LEVEL_HIT_DISTANCE,
    );
    const rank = (type: string) => {
      const i = TAP_HIT_PRIORITY.findIndex((p) => type.startsWith(p));
      return i < 0 ? TAP_HIT_PRIORITY.length : i;
    };
    const floorHit = floorHits.sort((a, b) => rank(a.type) - rank(b.type))[0];
    let target: Vec3 | null = null;
    if (floorHit) {
      target = floorHit.transform.position as Vec3;
    } else {
      for (const r of results) {
        const [hx, hy, hz] = r.transform.position;
        const dy = hy - cy;
        if (dy > -1e-3) continue;
        const t = (currentFloorY - cy) / dy;
        if (t > 0) {
          target = [cx + (hx - cx) * t, currentFloorY, cz + (hz - cz) * t];
          break;
        }
      }
    }
    if (__DEV__) console.log("[AR] mover a", JSON.stringify({ target, hits: results.map((r) => [r.type, r.transform.position]) }));
    if (!target) {
      arSession.set({ moveNotice: "No encontré el piso ahí: apunta un poco más abajo y vuelve a tocar" });
      return;
    }

    // Dentro del rango permitido desde la cámara
    let dx = target[0] - cx;
    let dz = target[2] - cz;
    const d = Math.hypot(dx, dz);
    if (d < 1e-3) return;
    const clamped = Math.min(MAX_EDIT_DISTANCE, Math.max(MIN_EDIT_DISTANCE, d));
    dx = (dx / d) * clamped;
    dz = (dz / d) * clamped;
    [pose.x, pose.z] = toPlacementFrame(placement, cx + dx, cz + dz);
    pose.y = target[1] - placement.point[1];
    applyPose(pose);
    arSession.set({ moveNotice: clamped < d ? "Lo dejé lo más lejos posible en esa dirección" : null });
    // Si nadie lo orientó a mano, queda mirando al usuario desde su nuevo lugar
    if (faceUser) {
      const [ux, uz] = toPlacementFrame(placement, cx, cz);
      targetYaw.current = Math.atan2(ux - pose.x, uz - pose.z) / DEG;
    }
  }

  function onHostTap() {
    // En modo "mover" los toques son para ubicarlo, no para que salude
    if (!arSession.get().editing) arSession.wave();
  }

  /** Marco del campo: FIELD_DISTANCE delante del usuario, con +Z hacia él (un bando a cada lado) */
  function placeField(placement: { point: Vec3; yaw: number }, camera: Vec3, forward: Vec3) {
    const [cx, cz] = toPlacementFrame(placement, camera[0], camera[2]);
    const [fx, fz] = toPlacementFrame(placement, placement.point[0] + forward[0], placement.point[2] + forward[2]);
    const len = Math.hypot(fx, fz);
    if (len < MIN_FIELD_AIM) return;
    const dx = fx / len;
    const dz = fz / len;
    if (__DEV__) console.log("[AR] campo", JSON.stringify({ camera: [cx, cz], forward: [dx, dz] }));
    arSession.setField({ x: cx + dx * FIELD_DISTANCE, z: cz + dz * FIELD_DISTANCE, yaw: Math.atan2(-dx, -dz) / DEG });
  }

  // Las órdenes del modo "mover" llegan desde la UI
  useEffect(() => {
    arSession.onHostControl(onHostCommand);
    return () => arSession.onHostControl(null);
  });

  // Cada frame: el anfitrión se gira para mirar al usuario y, si el modo seguir está activo, camina
  // hacia él cuando se aleja. La pose va directo al nodo nativo (setNativeProps) para no
  // re-renderizar React en cada frame
  function onCameraTransformUpdate({ position, forward }: ViroCameraTransform) {
    const now = Date.now();
    const dt = Math.min(0.1, (now - lastFrameAt.current) / 1000);
    lastFrameAt.current = now;
    const { placement, follow, faceUser, editing, choreography, battle, field, tracking } = arSession.get();
    lastCamera.current = { position: position as Vec3, forward: forward as Vec3 };
    if (placement && tracking && choreography?.layout === "field" && battle === "waiting" && !field) {
      placeField(placement, position as Vec3, forward as Vec3);
    }
    // Sin rastreo la pose de la cámara no es confiable
    const pose = currentPose();
    if (!placement || !pose) return;

    // En modo "mover" no camina ni se gira solo: solo termina de girar hacia la orientación elegida
    if (editing) {
      if (pose.walking) {
        pose.walking = false;
        arSession.walk(false);
      }
      pose.turning = false;
      wasEditing.current = true;
      if (targetYaw.current !== null) {
        const diff = wrapDegrees(targetYaw.current - pose.yaw);
        const turn = Math.sign(diff) * Math.min(Math.abs(diff), EDIT_TURN_SPEED * dt);
        pose.yaw = wrapDegrees(pose.yaw + turn);
        if (Math.abs(diff - turn) < 0.5) targetYaw.current = null;
        applyPose(pose);
      }
      return;
    }
    targetYaw.current = null;
    // Al salir del modo "mover" las props toman la pose elegida, para que un render no lo devuelva
    if (wasEditing.current) {
      wasEditing.current = false;
      setSettledPose({ ...pose });
    }

    // Cámara en el marco del nodo de colocación
    const [cx, cz] = toPlacementFrame(placement, position[0], position[2]);
    const dx = cx - pose.x;
    const dz = cz - pose.z;
    const distance = Math.hypot(dx, dz);
    if (distance < MIN_LOOK_DISTANCE) return;

    // También camina mientras habla: entonces solo mueve la boca, sin gesticular
    const walking = follow && distance > (pose.walking ? FOLLOW_STOP : FOLLOW_START);
    if (walking !== pose.walking) {
      pose.walking = walking;
      if (__DEV__) console.log("[AR] follow", JSON.stringify({ walking, distance: distance.toFixed(2) }));
      arSession.walk(walking);
    }

    let moved = false;
    if (walking) {
      const step = Math.min(WALK_SPEED * dt, distance - FOLLOW_STOP);
      pose.x += (dx / distance) * step;
      pose.z += (dz / distance) * step;
      moved = true;
    }

    // El modelo mira hacia +Z: yaw = atan2(dx, dz). Caminando siempre se orienta hacia donde avanza
    // Si lo orientaron a mano se queda mirando hacia donde lo dejaron
    const diff = wrapDegrees(Math.atan2(dx, dz) / DEG - pose.yaw);
    if (!faceUser) pose.turning = false;
    else if (Math.abs(diff) > TURN_START) pose.turning = true;
    else if (Math.abs(diff) < TURN_STOP) pose.turning = false;
    if (pose.turning || walking) {
      const turn = Math.sign(diff) * Math.min(Math.abs(diff), TURN_SPEED * dt);
      pose.yaw = wrapDegrees(pose.yaw + turn);
      moved ||= turn !== 0;
    }
    if (moved) applyPose(pose);
    else if (hostMoving.current) setSettledPose({ ...pose });
    hostMoving.current = moved;
  }

  // Mientras se mueve las props no cambian (React no pisa lo que puso setNativeProps); al quedarse
  // quieto se actualizan con la pose final para que un nuevo render no lo devuelva a donde se colocó
  const pose =
    placement && movableHost
      ? settledPose?.placementId === placement.id
        ? settledPose
        : initialPose(placement.id, movableHost)
      : null;
  // La batalla se arma donde quedó el anfitrión, mirando hacia donde miraba (hacia el usuario):
  // la animación empieza con Bolívar de frente y Monteverde llega por su izquierda
  const battleAnchor =
    placement && host && stageBattle
      ? settledPose?.placementId === placement.id
        ? settledPose
        : initialPose(placement.id, host)
      : null;
  // Escenario: un nodo en la pose del anfitrión. Lleva al anfitrión, a los personajes precargados
  // (ocultos) y, en la batalla, a todos. Cambiar de simulación no cambia el árbol: Viro no desmonta
  // ni vuelve a cargar ningún modelo
  const stage = pose ?? battleAnchor;
  const onStage = (obj: SceneObject) => !!stage && !inField(obj) && (stageBattle || obj.id === movableHost?.id);
  const preloaded = preload.filter((p) => !objects.some((o) => o.id === p.id));
  const shadowAt: Vec3 = stage ? [stage.x, stage.y, stage.z] : [0, 0, 0];

  return (
    <ViroARScene
      ref={scene}
      anchorDetectionTypes={["PlanesHorizontal"]}
      onTrackingUpdated={onTrackingUpdated}
      // Los eventos por frame solo se suscriben mientras se usan: cada uno cruza al hilo de JS.
      // El hit test sirve para elegir dónde colocarlo; el transform, para que el anfitrión mire/siga
      onCameraARHitTest={placement ? undefined : onCameraARHitTest}
      onAnchorFound={onPlane}
      onAnchorUpdated={onPlane}
      onAnchorRemoved={onPlaneRemoved}
      onCameraTransformUpdate={placement && movableHost ? onCameraTransformUpdate : undefined}
    >
      <ViroAmbientLight color="#ffffff" intensity={350} />

      {!placement && floor && (
        <ViroPolygon
          position={[floor.point[0], floor.point[1] + RETICLE_LIFT, floor.point[2]]}
          rotation={[-90, 0, 0]}
          vertices={RING.outer}
          holes={RING.holes}
          materials={["reticle"]}
        />
      )}

      {/* Se monta solo al colocarlo (key nueva por colocación): así Viro crea el anchor de ARCore
          en ese punto y el personaje se queda pegado al piso aunque el tracking se reajuste */}
      {placement && (
        // Sin rastreo la pose es vieja y el personaje "flotaría": lo ocultamos hasta que ARCore se recupere
        <ViroNode
          key={placement.id}
          position={placement.point}
          rotation={[0, placement.yaw, 0]}
          visible={tracking}
        >
          <ViroSpotLight
            ref={spotLight}
            position={[shadowAt[0] + LIGHT_OFFSET[0], shadowAt[1] + LIGHT_OFFSET[1], shadowAt[2] + LIGHT_OFFSET[2]]}
            direction={[-0.15, -1, -0.3]}
            innerAngle={10}
            outerAngle={30}
            attenuationStartDistance={5}
            attenuationEndDistance={8}
            intensity={500}
            castsShadow
            shadowOpacity={0.45}
            shadowMapSize={1024}
            shadowNearZ={2}
            shadowFarZ={7}
          />
          {stage && (
            // El nodo lleva la pose que mueven el seguimiento y el modo "mover" (a la altura del piso donde
            // quedó, ver HostPose); los modelos quedan en su origen. Una sola lista con keys estables: un
            // personaje que pasa de precargado a activo conserva su instancia
            <ViroNode ref={hostNode} position={[stage.x, stage.y, stage.z]} rotation={[0, stage.yaw, 0]}>
              {[
                ...objects.filter(onStage).map((obj) => (
                  <SceneModel
                    key={obj.id}
                    obj={atOrigin(obj)}
                    isHost={obj.id === hostId}
                    hostAnimation={animation}
                    onTap={onHostTap}
                    size={size}
                    // En el campo el anfitrión no es parte de la coreografía
                    battle={stageBattle ? battle : "off"}
                    battleAnimation={choreography?.animation}
                  />
                )),
                ...preloaded.map((obj) => (
                  <SceneModel
                    key={obj.id}
                    obj={atOrigin(obj)}
                    isHost={false}
                    hostAnimation={animation}
                    onTap={onHostTap}
                    size={size}
                    preloadOnly
                  />
                )),
                ...(stageBattle && battle === "finished" ? [<Balloons key="globos" />] : []),
              ]}
            </ViroNode>
          )}
          {field && fieldLayout && (
            // Campo de la coreografía: cada objeto en su posición real del marco del campo
            <ViroNode position={[field.x, 0, field.z]} rotation={[0, field.yaw, 0]}>
              {/* El foco del anfitrión no alcanza: una luz direccional con sombra para todo el campo */}
              <ViroDirectionalLight
                direction={[0.35, -1, -0.25]}
                intensity={400}
                castsShadow
                shadowOpacity={0.4}
                shadowOrthographicSize={30}
                shadowMapSize={2048}
                shadowNearZ={1}
                shadowFarZ={30}
              />
              {objects.filter(inField).map((obj) => (
                <SceneModel
                  key={obj.id}
                  obj={obj}
                  isHost={false}
                  hostAnimation={animation}
                  onTap={onHostTap}
                  size={size}
                  battle={battle}
                  battleAnimation={(obj.kind === "dynamic" && obj.choreographyAnimation) || choreography?.animation}
                />
              ))}
              {firing.map((shot) => (
                <FieldShotEffect key={shot.id} shot={shot} source={choreography?.sounds[shot.sound]} />
              ))}
              {battle === "finished" && <Balloons />}
              <ViroQuad rotation={[-90, 0, 0]} width={FIELD_SHADOW[0]} height={FIELD_SHADOW[1]} arShadowReceiver />
            </ViroNode>
          )}
          {objects
            .filter((obj) => !onStage(obj) && !inField(obj))
            .map((obj) => (
              <SceneModel
                key={obj.id}
                obj={obj}
                isHost={obj.id === hostId}
                hostAnimation={animation}
                onTap={onHostTap}
                size={size}
              />
            ))}
          {editing && pose && (
            <ViroPolygon
              ref={editRing}
              position={[pose.x, pose.y + RETICLE_LIFT, pose.z]}
              rotation={[-90, 0, 0]}
              vertices={RING.outer}
              holes={RING.holes}
              materials={["reticle"]}
              ignoreEventHandling
            />
          )}
          {/* Sombra sobre el piso real para que el personaje no se vea flotando (en la batalla cubre la pelea) */}
          <ViroQuad
            ref={shadow}
            position={shadowAt}
            rotation={[-90, 0, 0]}
            width={stageBattle ? 6 : 3}
            height={stageBattle ? 6 : 3}
            arShadowReceiver
          />
        </ViroNode>
      )}
    </ViroARScene>
  );
}

type SceneModelProps = {
  obj: SceneObject;
  isHost: boolean;
  hostAnimation: ArSessionState["animation"];
  /** Toque sobre el anfitrión: saluda */
  onTap: () => void;
  /** Factor de tamaño sobre la escala del modelo */
  size: number;
  battle?: ArSessionState["battle"];
  /** Animación de la coreografía que reproducen los que no son el anfitrión */
  battleAnimation?: string;
  /** Personaje de otra simulación: se carga oculto para que aparezca al instante al cambiar */
  preloadOnly?: boolean;
};

function SceneModel({
  obj,
  isHost,
  hostAnimation,
  onTap,
  size,
  battle = "off",
  battleAnimation,
  preloadOnly = false,
}: SceneModelProps) {
  const entrance = obj.kind === "dynamic" ? obj.entrance : undefined;
  const [loaded, setLoaded] = useState(false);
  const model = useRef<Viro3DObject>(null);
  const [arrived, setArrived] = useState(!entrance);
  const walking = !!entrance && loaded && !arrived;
  const [x, y, z] = obj.transform.position;
  const entranceName = entrance && registerEntrance(obj.id, [x, y, z], entrance.durationMs);

  // Lipsync: la boca (shape key "boca_abierta", scripts/add-mouth.py) va directo al nodo nativo, sin
  // re-renderizar. Por eso morphTargets no va en las props: un render la volvería a cerrar
  useEffect(() => {
    if (!isHost || !loaded) return;
    // setNativeProps está tipado con todas las props del modelo, pero acepta solo las que cambian
    const setMouth = (weight: number) =>
      model.current?.setNativeProps({ morphTargets: [{ target: "boca_abierta", weight }] } as ComponentProps<typeof Viro3DObject>);
    arSession.onMouth(setMouth);
    return () => arSession.onMouth(null);
  }, [isHost, loaded]);

  const loop = obj.kind === "dynamic" && obj.animation;
  const inBattle = battle !== "off";
  const modelAnimation = preloadOnly
    ? undefined
    : isHost
    ? // Saluda (al aparecer y al tocarlo) y gesticula al hablar; sin animación de reposo se queda en la pose final.
      // En la batalla arranca con `playBattle`
      hostAnimation
    : inBattle && battleAnimation
      ? // Arranca junto con el anfitrión; al terminar se queda en la pose final
        { name: battleAnimation, run: battle === "playing" || battle === "finished", loop: false }
      : walking && entrance?.walkAnimation
      ? { name: entrance.walkAnimation, run: true, loop: true }
      : loop
        ? { name: loop, run: true, loop: true }
        : undefined;

  return (
    // El nodo lleva la posición sobre el piso (y la recorre al llegar caminando); el modelo, la altura y el giro
    <ViroNode
      position={entrance && !arrived ? [entrance.from[0], 0, entrance.from[2]] : [x, 0, z]}
      animation={entranceName ? { name: entranceName, run: walking, loop: false, onFinish: () => setArrived(true) } : undefined}
    >
      <Viro3DObject
        ref={model}
        source={obj.model}
        type="GLB"
        position={[0, y, 0]}
        rotation={obj.transform.rotation}
        scale={[obj.transform.scale[0] * size, obj.transform.scale[1] * size, obj.transform.scale[2] * size]}
        animation={modelAnimation}
        // Antes de arrancar la batalla los demás no se ven (estarían en pose de reposo encima del
        // anfitrión), y al terminar el anfitrión ya se fue corriendo
        visible={
          !preloadOnly && (obj.kind === "static" || !inBattle || (isHost ? battle !== "finished" : battle !== "waiting"))
        }
        onClick={isHost && !inBattle ? onTap : undefined}
        onLoadStart={() => __DEV__ && console.log("[AR] cargando modelo", obj.id, obj.model)}
        onLoadEnd={() => {
          if (__DEV__) console.log("[AR] modelo cargado", obj.id);
          // Empieza a caminar recién cuando el modelo está listo, si no llegaría ya a mitad de camino
          setLoaded(true);
          arSession.markLoaded(obj.id);
          if (!isHost) return;
          // Para el lipsync: el modelo tiene que traer la shape key "boca_abierta"
          if (__DEV__)
            model.current
              ?.getMorphTargets()
              .then((targets: unknown) => console.log("[AR] shape keys", obj.id, JSON.stringify(targets)))
              .catch((e: unknown) => console.warn("[AR] no se pudieron leer las shape keys", e));
          arSession.set({ modelStatus: "ready" });
          if (arSession.get().battle === "off") arSession.wave();
        }}
        onError={(event) => {
          console.warn("[AR] error cargando modelo", obj.id, event?.nativeEvent ?? event);
          if (isHost) arSession.set({ modelStatus: "error" });
        }}
      />
    </ViroNode>
  );
}

/**
 * Un disparo en el campo: suena desde la boca del fusil (sonido espacial: se oye de qué lado viene),
 * con un fogonazo breve y una bocanada de humo que sale hacia el otro bando. Gritos y caídas solo suenan.
 */
function FieldShotEffect({ shot, source }: { shot: FieldShot; source?: number }) {
  const [flash, setFlash] = useState(shot.effect === "humo");
  useEffect(() => {
    const timer = setTimeout(() => setFlash(false), FLASH_MS);
    return () => clearTimeout(timer);
  }, []);
  // Los patriotas están en -X y disparan hacia +X; los realistas al revés
  const dir = shot.at[0] > 0 ? -1 : 1;
  return (
    <ViroNode position={shot.at}>
      {source !== undefined && (
        <ViroSpatialSound source={source} position={[0, 0, 0]} rolloffModel="Logarithmic" minDistance={2} maxDistance={40} />
      )}
      {flash && <ViroSphere radius={0.09} position={[dir * 0.1, 0, 0]} materials={["fogonazo"]} />}
      {shot.effect === "humo" && (
        <ViroParticleEmitter
          duration={300}
          run
          loop={false}
          image={{ source: smoke, height: 0.4, width: 0.4, bloomThreshold: 1 }}
          spawnBehavior={{
            emissionRatePerSecond: [0, 0],
            emissionBurst: SMOKE_BURST,
            particleLifetime: [1800, 2600],
            maxParticles: 24,
            spawnVolume: { shape: "sphere", params: [0.12] },
          }}
          particleAppearance={{
            opacity: { initialRange: [0.55, 0.75], factor: "Time", interpolation: [{ interval: [0, 2600], endValue: 0 }] },
            scale: {
              initialRange: [
                [0.5, 0.5, 0.5],
                [0.8, 0.8, 0.8],
              ],
              factor: "Time",
              interpolation: [{ interval: [0, 2600], endValue: [2.2, 2.2, 2.2] }],
            },
          }}
          particlePhysics={{
            velocity: {
              initialRange: [
                [dir * 0.4, 0.15, -0.15],
                [dir * 1.0, 0.45, 0.15],
              ],
            },
          }}
        />
      )}
    </ViroNode>
  );
}

/** El mismo objeto sin posición en el piso ni giro en Y: los pone el nodo que lo contiene. */
function atOrigin<T extends SceneObject>(obj: T): T {
  const [rx, , rz] = obj.transform.rotation;
  return {
    ...obj,
    transform: { ...obj.transform, position: [0, obj.transform.position[1], 0], rotation: [rx, 0, rz] },
  };
}

const registeredEntrances = new Set<string>();

/** Animación de Viro que lleva el nodo en línea recta hasta su posición final. */
function registerEntrance(id: string, [x, , z]: Vec3, duration: number): string {
  const name = `entrada_${id}_${x}_${z}_${duration}`;
  if (!registeredEntrances.has(name)) {
    ViroAnimations.registerAnimations({ [name]: { properties: { positionX: x, positionZ: z }, duration, easing: "Linear" } });
    registeredEntrances.add(name);
  }
  return name;
}
