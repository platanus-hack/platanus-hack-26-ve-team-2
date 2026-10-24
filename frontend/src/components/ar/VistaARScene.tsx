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
} from "@reactvision/react-viro";
import { useEffect, useRef, useState } from "react";

import { arSession, type ArSessionState, useArSession, type Vec3 } from "@/hooks/useArSession";
import type { SceneObject } from "@/types/simulation";

// El piso está al menos así de abajo del teléfono
const MIN_FLOOR_DROP = 0.6;
// Un plano cuenta como piso si está a esta distancia (m) del plano horizontal más bajo
const FLOOR_TOLERANCE = 0.15;
// Ignoramos planos diminutos, que suelen ser ruido
const MIN_PLANE_AREA = 0.2;
// En algunos Android ARCore alterna NORMAL/UNAVAILABLE varias veces por segundo: solo damos el
// rastreo por perdido si sigue así este tiempo, si no el personaje nunca llega a colocarse
const TRACKING_LOST_GRACE_MS = 1000;
// Si ARCore todavía no confirmó un plano de piso, aceptamos estos hits (menos precisos) para que
// el usuario igual pueda colocar al personaje tocando el botón
// Cuando el rastreo de ARCore diverge devuelve hits a decenas de metros: no son el piso
const MAX_HIT_DISTANCE = 4;
// La mayoría de los frames no traen hit: mantenemos el último punto un rato para que el
// anillo (y el botón) no parpadeen
const FLOOR_HOLD_MS = 1500;
const FALLBACK_HIT_TYPES = new Set(["ExistingPlane", "EstimatedHorizontalPlane", "FeaturePoint", "DepthPoint"]);
// El anillo va donde el rayo del centro de la pantalla corta el plano del piso: inclinar el teléfono
// lo acerca o lo aleja. Lo limitamos a este rango horizontal (m) para que no quede bajo los pies ni
// en el horizonte cuando se apunta recto o por encima de él
const MIN_PLACE_DISTANCE = 0.8;
const MAX_PLACE_DISTANCE = 6;

ViroMaterials.createMaterials({
  reticle: { lightingModel: "Constant", diffuseColor: "#E66F3DDD", cullMode: "None" },
});

// Anillo para marcar en el piso dónde aparecerá el personaje
const RING = (() => {
  const outer: [number, number][] = [];
  const inner: [number, number][] = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    outer.push([Math.cos(a) * 0.3, Math.sin(a) * 0.3]);
    inner.push([Math.cos(a) * 0.24, Math.sin(a) * 0.24]);
  }
  return { outer, holes: [inner] };
})();

// Viro inyecta arSceneNavigator en la escena
type SceneProps = {
  arSceneNavigator?: { isDepthOcclusionSupported?: () => Promise<{ supported: boolean }> };
};

export function VistaARScene({ arSceneNavigator }: SceneProps = {}) {
  const placement = useArSession((s) => s.placement);
  const floor = useArSession((s) => s.floor);
  const animation = useArSession((s) => s.animation);
  const mouth = useArSession((s) => s.mouth);
  const objects = useArSession((s) => s.objects);
  // El anfitrión (primer objeto dinámico) saluda al aparecer y cuando lo tocan
  const hostId = objects.find((o) => o.kind === "dynamic")?.id;
  const tracking = useArSession((s) => s.tracking);
  const lastUpdate = useRef(0);
  const lastHitLog = useRef(0);
  const lastFloorAt = useRef(0);
  const planes = useRef(new Map<string, { y: number; area: number }>());
  // Altura del último plano real que tocó el centro de la pantalla: es el piso que el usuario está viendo
  const aimLevel = useRef<number | null>(null);
  const trackingLostTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (trackingLostTimer.current) clearTimeout(trackingLostTimer.current);
  }, []);

  useEffect(() => {
    arSceneNavigator
      ?.isDepthOcclusionSupported?.()
      .then(({ supported }) => arSession.set({ occlusion: supported ? "supported" : "unsupported" }))
      .catch(() => arSession.set({ occlusion: "unsupported" }));
  }, [arSceneNavigator]);

  // El piso es el plano horizontal más grande. No usamos el más bajo: ARCore a veces detecta planos
  // fantasma decenas de cm bajo el piso real y el anillo quedaba enterrado (y oculto por la oclusión)
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
    const belowCamera = (y: number) => camera[1] - y > MIN_FLOOR_DROP;
    const near = ([x, y, z]: number[]) =>
      Math.hypot(x - camera[0], y - camera[1], z - camera[2]) < MAX_HIT_DISTANCE;
    const hits = hitTestResults.filter((r) => near(r.transform.position));
    // Si el centro de la pantalla toca un plano real del piso, el anillo va justo ahí (distancia exacta)
    const planeHit = hits.find((r) => r.type.startsWith("ExistingPlane") && belowCamera(r.transform.position[1]));
    if (planeHit) aimLevel.current = planeHit.transform.position[1];
    // Si no (apuntando más lejos o al horizonte), basta conocer la altura del piso: el último plano
    // apuntado, el plano de piso detectado o, sin planos todavía, un hit menos preciso
    const aimed = aimLevel.current !== null && belowCamera(aimLevel.current) ? aimLevel.current : null;
    const floorLevel =
      aimed ??
      (floorY !== null && belowCamera(floorY)
        ? floorY
        : hits.find((r) => FALLBACK_HIT_TYPES.has(r.type) && belowCamera(r.transform.position[1]))?.transform
            .position[1]);
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

  return (
    <ViroARScene
      anchorDetectionTypes={["PlanesHorizontal"]}
      onTrackingUpdated={onTrackingUpdated}
      onCameraARHitTest={onCameraARHitTest}
      onAnchorFound={onPlane}
      onAnchorUpdated={onPlane}
      onAnchorRemoved={onPlaneRemoved}
    >
      <ViroAmbientLight color="#ffffff" intensity={350} />

      {!placement && floor && (
        <ViroPolygon
          position={floor.point}
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
            position={[0.6, 4, 1.2]}
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
          {objects.map((obj) => (
            <SceneModel key={obj.id} obj={obj} isHost={obj.id === hostId} hostAnimation={animation} mouth={mouth} />
          ))}
          {/* Sombra sobre el piso real para que el personaje no se vea flotando */}
          <ViroQuad rotation={[-90, 0, 0]} width={3} height={3} arShadowReceiver />
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
