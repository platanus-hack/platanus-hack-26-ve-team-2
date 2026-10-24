import type { Viseme, VisemeId } from "@/types/voice";

/** Visema activo en el segundo `t` del audio (búsqueda binaria: los visemas vienen ordenados). */
export function visemeAt(visemes: Viseme[], t: number): VisemeId {
  let lo = 0;
  let hi = visemes.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = visemes[mid];
    if (t < v.t) hi = mid - 1;
    else if (t >= v.t + v.d) lo = mid + 1;
    else return v.v;
  }
  return "sil";
}

// Apertura de boca aproximada por visema Oculus/Meta (0 = cerrada, 1 = máxima)
const MOUTH_OPEN: Record<VisemeId, number> = {
  sil: 0,
  PP: 0.05,
  FF: 0.25,
  TH: 0.35,
  DD: 0.45,
  kk: 0.5,
  CH: 0.45,
  SS: 0.3,
  nn: 0.35,
  RR: 0.45,
  aa: 1,
  E: 0.7,
  I: 0.5,
  O: 0.8,
  U: 0.55,
};

export function mouthOpenness(viseme: VisemeId): number {
  return MOUTH_OPEN[viseme];
}
