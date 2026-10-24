/** Error normalizado que lanza el cliente HTTP para cualquier respuesta no-2xx o fallo de red. */
export interface ApiErrorShape {
  status: number;
  /** Mensaje legible (FastAPI lo envía en `detail`). */
  message: string;
  /** Código de dominio opcional (p. ej. errores de voz: `no_speech`). */
  code?: string;
  /** true si no hubo respuesta: sin red, timeout o servidor caído. */
  isConnectionError: boolean;
}
