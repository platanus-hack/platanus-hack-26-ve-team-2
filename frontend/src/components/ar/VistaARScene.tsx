import {
  Viro3DObject,
  ViroAmbientLight,
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
import { useEffect, useRef } from "react";

import { arSession, useArSession, type Vec3 } from "@/hooks/useArSession";

// El piso está al menos así de abajo del teléfono
const MIN_FLOOR_DROP = 0.6;
// Un plano cuenta como piso si está a esta distancia (m) del plano horizontal más bajo
const FLOOR_TOLERANCE = 0.15;
// Ignoramos planos diminutos, que suelen ser ruido
const MIN_PLANE_AREA = 0.2;

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
  const objects = useArSession((s) => s.objects);
  // El anfitrión (primer objeto dinámico) saluda al aparecer y cuando lo tocan
  const hostId = objects.find((o) => o.kind === "dynamic")?.id;
  const tracking = useArSession((s) => s.tracking);
  const lastUpdate = useRef(0);
  const planes = useRef(new Map<string, number>());

  useEffect(() => {
    arSceneNavigator
      ?.isDepthOcclusionSupported?.()
      .then(({ supported }) => arSession.set({ occlusion: supported ? "supported" : "unsupported" }))
      .catch(() => arSession.set({ occlusion: "unsupported" }));
  }, [arSceneNavigator]);

  // El piso es el plano horizontal más bajo: así nunca colocamos al personaje sobre una mesa
  function onPlane(anchor: ViroAnchor) {
    if (anchor.type !== "plane" || !anchor.alignment?.startsWith("Horizontal")) return;
    if ((anchor.width ?? 0) * (anchor.height ?? 0) < MIN_PLANE_AREA) return;
    planes.current.set(anchor.anchorId, anchor.position[1]);
    const lowest = Math.min(...planes.current.values());
    const current = arSession.get().floorY;
    if (current === null || Math.abs(current - lowest) > 0.01) arSession.set({ floorY: lowest });
  }

  function onPlaneRemoved(anchor?: ViroAnchor) {
    if (!anchor) return;
    planes.current.delete(anchor.anchorId);
    arSession.set({ floorY: planes.current.size ? Math.min(...planes.current.values()) : null });
  }

  function onTrackingUpdated(trackingState: unknown, reason?: unknown) {
    if (__DEV__) console.log("[AR] tracking", { state: trackingState, reason });
    arSession.set({ tracking: trackingState === ViroTrackingStateConstants.TRACKING_NORMAL });
  }

  // Se dispara cada frame con el hit test del centro de la pantalla
  function onCameraARHitTest({ hitTestResults, cameraOrientation }: ViroCameraARHitTest) {
    if (arSession.get().placement) return;
    const now = Date.now();
    if (now - lastUpdate.current < 120) return;
    lastUpdate.current = now;

    const camera = cameraOrientation.position as Vec3;
    const { floorY } = arSession.get();
    // Solo planos reales medidos por ARCore (no estimados): la distancia, y por tanto la escala, es correcta
    const hit =
      floorY === null
        ? undefined
        : hitTestResults.find((r) => {
            const y = r.transform.position[1];
            return (
              r.type === "ExistingPlaneUsingExtent" &&
              Math.abs(y - floorY) < FLOOR_TOLERANCE &&
              camera[1] - y > MIN_FLOOR_DROP
            );
          });
    arSession.set({ floor: hit ? { point: hit.transform.position as Vec3, camera } : null });
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
          {objects.map((obj) => {
            const isHost = obj.id === hostId;
            const loop = obj.kind === "dynamic" && obj.animation;
            return (
              <Viro3DObject
                key={obj.id}
                source={obj.model}
                type="GLB"
                position={obj.transform.position}
                rotation={obj.transform.rotation}
                scale={obj.transform.scale}
                animation={
                  isHost
                    ? {
                        name: animation.name,
                        run: animation.run,
                        loop: animation.name === "reposo",
                        onFinish: () => animation.name === "saludo" && arSession.rest(),
                      }
                    : loop
                      ? { name: loop, run: true, loop: true }
                      : undefined
                }
                onClick={isHost ? () => arSession.wave() : undefined}
                onLoadStart={() => __DEV__ && console.log("[AR] cargando modelo", obj.id, obj.model)}
                onLoadEnd={() => {
                  if (__DEV__) console.log("[AR] modelo cargado", obj.id);
                  if (!isHost) return;
                  arSession.set({ modelStatus: "ready" });
                  arSession.wave();
                }}
                onError={(event) => {
                  console.warn("[AR] error cargando modelo", obj.id, event?.nativeEvent ?? event);
                  if (isHost) arSession.set({ modelStatus: "error" });
                }}
              />
            );
          })}
          {/* Sombra sobre el piso real para que el personaje no se vea flotando */}
          <ViroQuad rotation={[-90, 0, 0]} width={3} height={3} arShadowReceiver />
        </ViroNode>
      )}
    </ViroARScene>
  );
}
