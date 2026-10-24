import {
  Viro3DObject,
  ViroAmbientLight,
  ViroAnimations,
  ViroARScene,
  ViroMaterials,
  ViroNode,
  ViroPolygon,
  ViroQuad,
  ViroSpotLight,
  ViroTrackingStateConstants,
  type ViroAnchor,
  type ViroCameraARHitTest,
  type ViroCameraTransform,
} from "@reactvision/react-viro";
import { useEffect, useRef, useState } from "react";
import { Dimensions, PixelRatio } from "react-native";

import { arSession, type ArSessionState, useArSession, type Vec3 } from "@/hooks/useArSession";
import type { DynamicSceneObject, SceneObject } from "@/types/simulation";

// El piso está al menos así de abajo del teléfono
const MIN_FLOOR_DROP = 0.6;
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
const DEG = Math.PI / 180;

ViroMaterials.createMaterials({
  reticle: { lightingModel: "Constant", diffuseColor: "#E66F3DEE", cullMode: "None" },
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

/** Pose del anfitrión sobre el piso, relativa al nodo de colocación; la mueve el bucle de seguimiento. */
type HostPose = { placementId: number; x: number; z: number; yaw: number; turning: boolean; walking: boolean };

function initialPose(placementId: number, host: SceneObject): HostPose {
  const [x, , z] = host.transform.position;
  return { placementId, x, z, yaw: host.transform.rotation[1], turning: false, walking: false };
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
  const mouth = useArSession((s) => s.mouth);
  const objects = useArSession((s) => s.objects);
  // El anfitrión (primer objeto dinámico) saluda al aparecer y cuando lo tocan
  const host = objects.find((o): o is DynamicSceneObject => o.kind === "dynamic");
  const hostId = host?.id;
  // Si llega caminando, su entrada ya define dónde queda: ese no sigue al usuario
  const movableHost = host && !host.entrance ? host : undefined;
  const tracking = useArSession((s) => s.tracking);
  const lastUpdate = useRef(0);
  const lastHitLog = useRef(0);
  const lastFloorAt = useRef(0);
  const planes = useRef(new Map<string, { y: number; area: number }>());
  // Altura del último plano real que tocó el centro de la pantalla: es el piso que el usuario está viendo
  const aimLevel = useRef<number | null>(null);
  // Altura del piso según los hit tests de la parte baja de la pantalla
  const probeLevel = useRef<number | null>(null);
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
    if (__DEV__) console.log("[AR] plano", JSON.stringify(anchor));
    if (anchor.type !== "plane" || !anchor.alignment?.startsWith("Horizontal")) return;
    const area = (anchor.width ?? 0) * (anchor.height ?? 0);
    if (area < MIN_PLANE_AREA) return;
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
      camera[1] - y > MIN_FLOOR_DROP &&
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
        // La mediana descarta un punto suelto (una silla, un zócalo)
        levels.sort((a, b) => a - b);
        probeLevel.current = levels[Math.floor(levels.length / 2)];
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
    const belowCamera = (y: number) => camera[1] - y > MIN_FLOOR_DROP;
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
      arSession.set({ floor: { point, camera } });
    } else if (now - lastFloorAt.current > FLOOR_HOLD_MS) {
      arSession.set({ floor: null });
    }
  }

  function applyPose({ x, z, yaw }: HostPose) {
    hostNode.current?.setNativeProps({ position: [x, 0, z], rotation: [0, yaw, 0] });
    shadow.current?.setNativeProps({ position: [x, 0, z] });
    spotLight.current?.setNativeProps({ position: [x + LIGHT_OFFSET[0], LIGHT_OFFSET[1], z + LIGHT_OFFSET[2]] });
  }

  // Cada frame: el anfitrión se gira para mirar al usuario y, si el modo seguir está activo, camina
  // hacia él cuando se aleja. La pose va directo al nodo nativo (setNativeProps) para no
  // re-renderizar React en cada frame
  function onCameraTransformUpdate({ position }: ViroCameraTransform) {
    const now = Date.now();
    const dt = Math.min(0.1, (now - lastFrameAt.current) / 1000);
    lastFrameAt.current = now;
    const { placement, tracking, follow, objects } = arSession.get();
    const current = objects.find((o) => o.kind === "dynamic");
    // Sin rastreo la pose de la cámara no es confiable
    if (!placement || !tracking || !current || current.entrance) return;
    if (hostPose.current?.placementId !== placement.id) hostPose.current = initialPose(placement.id, current);
    const pose = hostPose.current;

    // Cámara en el marco del nodo de colocación (trasladado a `point` y girado `yaw` en Y)
    const t = placement.yaw * DEG;
    const wx = position[0] - placement.point[0];
    const wz = position[2] - placement.point[2];
    const dx = wx * Math.cos(t) - wz * Math.sin(t) - pose.x;
    const dz = wx * Math.sin(t) + wz * Math.cos(t) - pose.z;
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
    const diff = wrapDegrees(Math.atan2(dx, dz) / DEG - pose.yaw);
    if (Math.abs(diff) > TURN_START) pose.turning = true;
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
  const shadowAt: Vec3 = pose ? [pose.x, 0, pose.z] : [0, 0, 0];

  return (
    <ViroARScene
      ref={scene}
      anchorDetectionTypes={["PlanesHorizontal"]}
      onTrackingUpdated={onTrackingUpdated}
      onCameraARHitTest={onCameraARHitTest}
      onAnchorFound={onPlane}
      onAnchorUpdated={onPlane}
      onAnchorRemoved={onPlaneRemoved}
      onCameraTransformUpdate={onCameraTransformUpdate}
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
            position={[shadowAt[0] + LIGHT_OFFSET[0], LIGHT_OFFSET[1], shadowAt[2] + LIGHT_OFFSET[2]]}
            direction={[-0.15, -1, -0.3]}
            innerAngle={10}
            outerAngle={30}
            attenuationStartDistance={5}
            attenuationEndDistance={8}
            intensity={500}
            castsShadow
            shadowOpacity={0.45}
            shadowMapSize={2048}
            shadowNearZ={2}
            shadowFarZ={7}
          />
          {objects.map((obj) =>
            pose && movableHost && obj.id === movableHost.id ? (
              // El nodo lleva la pose que mueve el seguimiento; el modelo queda en su origen
              <ViroNode key={obj.id} ref={hostNode} position={[pose.x, 0, pose.z]} rotation={[0, pose.yaw, 0]}>
                <SceneModel obj={atOrigin(movableHost)} isHost hostAnimation={animation} mouth={mouth} />
              </ViroNode>
            ) : (
              <SceneModel key={obj.id} obj={obj} isHost={obj.id === hostId} hostAnimation={animation} mouth={mouth} />
            ),
          )}
          {/* Sombra sobre el piso real para que el personaje no se vea flotando */}
          <ViroQuad ref={shadow} position={shadowAt} rotation={[-90, 0, 0]} width={3} height={3} arShadowReceiver />
        </ViroNode>
      )}
    </ViroARScene>
  );
}

type SceneModelProps = {
  obj: SceneObject;
  isHost: boolean;
  hostAnimation: ArSessionState["animation"];
  /** Peso de la shape key "boca_abierta" del anfitrión (lipsync) */
  mouth: number;
};

function SceneModel({ obj, isHost, hostAnimation, mouth }: SceneModelProps) {
  const entrance = obj.kind === "dynamic" ? obj.entrance : undefined;
  const [loaded, setLoaded] = useState(false);
  const model = useRef<Viro3DObject>(null);
  const [arrived, setArrived] = useState(!entrance);
  const walking = !!entrance && loaded && !arrived;
  const [x, y, z] = obj.transform.position;
  const entranceName = entrance && registerEntrance(obj.id, [x, y, z], entrance.durationMs);

  const loop = obj.kind === "dynamic" && obj.animation;
  const modelAnimation = isHost
    ? // Saluda (al aparecer y al tocarlo) y gesticula al hablar; sin animación de reposo se queda en la pose final
      hostAnimation
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
        scale={obj.transform.scale}
        animation={modelAnimation}
        // Shape key que abre la boca (scripts/add-mouth.py)
        morphTargets={isHost ? [{ target: "boca_abierta", weight: mouth }] : undefined}
        onClick={isHost ? () => arSession.wave() : undefined}
        onLoadStart={() => __DEV__ && console.log("[AR] cargando modelo", obj.id, obj.model)}
        onLoadEnd={() => {
          if (__DEV__) console.log("[AR] modelo cargado", obj.id);
          // Empieza a caminar recién cuando el modelo está listo, si no llegaría ya a mitad de camino
          setLoaded(true);
          if (!isHost) return;
          // Para el lipsync: el modelo tiene que traer la shape key "boca_abierta"
          if (__DEV__)
            model.current
              ?.getMorphTargets()
              .then((targets: unknown) => console.log("[AR] shape keys", obj.id, JSON.stringify(targets)))
              .catch((e: unknown) => console.warn("[AR] no se pudieron leer las shape keys", e));
          arSession.set({ modelStatus: "ready" });
          arSession.wave();
        }}
        onError={(event) => {
          console.warn("[AR] error cargando modelo", obj.id, event?.nativeEvent ?? event);
          if (isHost) arSession.set({ modelStatus: "error" });
        }}
      />
    </ViroNode>
  );
}

/** El mismo objeto sin posición en el piso ni giro en Y: los pone el nodo que lo contiene. */
function atOrigin(obj: DynamicSceneObject): DynamicSceneObject {
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
