import { Viro3DObject, ViroAnimations, ViroNode } from "@reactvision/react-viro";
import { useState } from "react";

import cashea from "@/assets/models/globo-cashea.glb";
import yummy from "@/assets/models/globo-yummy.glb";

import { mountable } from "./loadQueue";

// Los globos salen de scripts/battle/build_balloons.py (logos en assets/images/sponsors)
const MODELS = [yummy, cashea];
const COUNT = 32;
// Altura del centro del globo cuando su base toca el piso (el globo mide ~57 cm de alto)
const GROUND_Y = 0.29;
// Desinflarse al tocar el piso
const POP_MS = 260;

/** Número pseudoaleatorio fijo por globo: la lluvia se ve igual cada vez y no cambia entre renders. */
function rand(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Un globo inflado con aire cae casi enseguida a su velocidad terminal (el roce con el aire iguala
 * a su peso): baja a velocidad constante, con una leve deriva lateral. Por eso la caída es lineal y
 * dura altura / velocidad terminal.
 */
const BALLOONS = Array.from({ length: COUNT }, (_, i) => {
  const fromY = 4.5 + rand(i + 61) * 1.5;
  const terminal = 0.9 + rand(i + 91) * 0.5; // m/s
  // Repartidos alrededor de la pelea y hacia el usuario (+Z), sin caerle encima (z < 1,4)
  const x = -2.6 + rand(i + 1) * 6.0;
  const z = -3.0 + rand(i + 31) * 4.4;
  return {
    i,
    model: MODELS[i % MODELS.length],
    x,
    z,
    fromY,
    toX: x + (rand(i + 241) - 0.5) * 0.6,
    toZ: z + (rand(i + 271) - 0.5) * 0.6,
    yaw: rand(i + 121) * 360,
    duration: ((fromY - GROUND_Y) / terminal) * 1000,
    // Escalonados: una lluvia que dura unos segundos, no todos a la vez
    delay: rand(i + 181) * 4000,
    spin: rand(i + 211) > 0.5 ? "globo_giro_der" : "globo_giro_izq",
  };
});

ViroAnimations.registerAnimations({
  ...Object.fromEntries(
    BALLOONS.flatMap((b, i) => [
      [
        `globo_caida_${i}`,
        {
          properties: { positionX: b.toX, positionY: GROUND_Y, positionZ: b.toZ },
          duration: b.duration,
          delay: b.delay,
          easing: "Linear",
        },
      ],
      // Cae y, al tocar el piso, se desinfla
      [`globo_${i}`, [[`globo_caida_${i}`, "globo_desinflar"]]],
    ]),
  ),
  globo_desinflar: {
    properties: { scaleX: 0, scaleY: 0, scaleZ: 0, opacity: 0 },
    duration: POP_MS,
    easing: "EaseIn",
  },
  globo_giro_der: { properties: { rotateY: "+=360" }, duration: 9000, easing: "Linear" },
  globo_giro_izq: { properties: { rotateY: "-=360" }, duration: 11000, easing: "Linear" },
});

/**
 * Lluvia de globos con los logos de los sponsors, en el marco de la escena (metros, +Z hacia el usuario).
 * Son 32 copias de 2 modelos: se montan de a una por modelo (ver loadQueue), así que cada globo
 * empieza a caer recién al montarse; con los retrasos de la lluvia no se nota
 */
export function Balloons() {
  const [loaded, setLoaded] = useState<ReadonlySet<number>>(new Set());
  const markLoaded = (i: number) => setLoaded((prev) => new Set(prev).add(i));
  return (
    <>
      {mountable(BALLOONS, (b) => loaded.has(b.i)).map((b) => (
        <ViroNode key={b.i} position={[b.x, b.fromY, b.z]} animation={{ name: `globo_${b.i}`, run: true, loop: false }}>
          <ViroNode rotation={[0, b.yaw, 0]} animation={{ name: b.spin, run: true, loop: true }}>
            <Viro3DObject source={b.model} type="GLB" onLoadEnd={() => markLoaded(b.i)} onError={() => markLoaded(b.i)} />
          </ViroNode>
        </ViroNode>
      ))}
    </>
  );
}
