import { HealthModule } from "./modules/health";
import { VoiceModule } from "./modules/voice";
import { ZonesModule } from "./modules/zones";

/**
 * Punto de entrada único a la API. Cada dominio del backend es un módulo:
 * para un endpoint nuevo, agrégalo al módulo de su dominio (o crea uno en `modules/`).
 */
export const clientApi = {
  health: HealthModule,
  zones: ZonesModule,
  voice: VoiceModule,
};

export { ApiError } from "./client";
