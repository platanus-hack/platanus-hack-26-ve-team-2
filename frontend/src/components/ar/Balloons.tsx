import { Viro3DObject, ViroAnimations, ViroNode } from "@reactvision/react-viro";

import cashea from "@/assets/models/globo-cashea.glb";
import yummy from "@/assets/models/globo-yummy.glb";

// Los globos salen de scripts/battle/build_balloons.py (logos en assets/images/sponsors)
const MODELS = [yummy, cashea];
const COUNT = 12;

/** Número pseudoaleatorio fijo por globo: la lluvia se ve igual cada vez y no cambia entre renders. */
function rand(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

// Caen desde ~5 m sobre la escena (fuera de la vista) y quedan flotando entre 0,9 y 2,4 m, repartidos
// alrededor del lugar de la pelea y hacia el usuario (+Z)
const BALLOONS = Array.from({ length: COUNT }, (_, i) => ({
  model: MODELS[i % MODELS.length],
  x: -1.8 + rand(i + 1) * 4.4,
  z: -2.2 + rand(i + 31) * 3.2,
  fromY: 4.5 + rand(i + 61) * 1.5,
  toY: 0.9 + rand(i + 91) * 1.5,
  yaw: rand(i + 121) * 360,
  duration: 3800 + rand(i + 151) * 2200,
  delay: rand(i + 181) * 1800,
  spin: rand(i + 211) > 0.5 ? "globo_giro_der" : "globo_giro_izq",
}));

ViroAnimations.registerAnimations({
  ...Object.fromEntries(
    BALLOONS.map((b, i) => [
      `globo_caida_${i}`,
      { properties: { positionY: b.toY }, duration: b.duration, delay: b.delay, easing: "EaseOut" },
    ]),
  ),
  globo_giro_der: { properties: { rotateY: "+=360" }, duration: 9000, easing: "Linear" },
  globo_giro_izq: { properties: { rotateY: "-=360" }, duration: 11000, easing: "Linear" },
});

/** Lluvia de globos con los logos de los sponsors, en el marco de la escena (metros, +Z hacia el usuario). */
export function Balloons() {
  return (
    <>
      {BALLOONS.map((b, i) => (
        <ViroNode
          key={i}
          position={[b.x, b.fromY, b.z]}
          animation={{ name: `globo_caida_${i}`, run: true, loop: false }}
        >
          <ViroNode
            rotation={[0, b.yaw, 0]}
            animation={{ name: b.spin, run: true, loop: true }}
          >
            <Viro3DObject source={b.model} type="GLB" />
          </ViroNode>
        </ViroNode>
      ))}
    </>
  );
}
