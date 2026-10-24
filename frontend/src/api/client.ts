import { Environment } from "@/config/environment";
import type { ApiErrorShape } from "@/types/api";

const DEFAULT_TIMEOUT_MS = 30_000;

type Query = Record<string, string | number | boolean | undefined>;

export interface RequestOptions {
  query?: Query;
  /** Objeto plano (se envía como JSON) o FormData (multipart). */
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export class ApiError extends Error implements ApiErrorShape {
  readonly status: number;
  readonly code?: string;
  readonly isConnectionError: boolean;

  constructor({ status, message, code, isConnectionError }: ApiErrorShape) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.isConnectionError = isConnectionError;
  }
}

function buildUrl(path: string, query?: Query): string {
  const url = `${Environment.API_BASE_URL}${path}`;
  if (!query) return url;
  const params = Object.entries(query)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return params.length ? `${url}?${params.join("&")}` : url;
}

async function parseError(res: Response): Promise<ApiError> {
  let message = `HTTP ${res.status}`;
  let code: string | undefined;
  try {
    const data = await res.json();
    // FastAPI: { detail: string } o { detail: [{ msg }] } en errores de validación
    if (typeof data?.detail === "string") message = data.detail;
    else if (Array.isArray(data?.detail)) message = data.detail.map((d: { msg?: string }) => d.msg).join(", ");
    code = data?.code;
  } catch {
    // cuerpo vacío o no-JSON: nos quedamos con el status
  }
  return new ApiError({ status: res.status, message, code, isConnectionError: false });
}

async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const { query, body, headers, timeoutMs = DEFAULT_TIMEOUT_MS, signal } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  signal?.addEventListener("abort", () => controller.abort());

  const isForm = body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        // Con FormData el runtime define el boundary del multipart
        ...(body !== undefined && !isForm ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch (e) {
    // fetch también lanza por errores del cliente (body inválido, FormData no soportado):
    // se registra el original para no confundirlos con falta de red
    console.warn(`[API] ${method} ${path} falló antes de obtener respuesta:`, e);
    const timedOut = controller.signal.aborted && !signal?.aborted;
    throw new ApiError({
      status: 0,
      message: timedOut ? "Tiempo de espera agotado" : e instanceof Error ? e.message : "Error de red",
      isConnectionError: true,
    });
  } finally {
    clearTimeout(timer);
  }

  if (__DEV__) console.log(`[API] ${method} ${path} → ${res.status}`);
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const http = {
  get: <T>(path: string, options?: Omit<RequestOptions, "body">) => request<T>("GET", path, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>("POST", path, { ...options, body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>("PUT", path, { ...options, body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>("PATCH", path, { ...options, body }),
  delete: <T = void>(path: string, options?: RequestOptions) => request<T>("DELETE", path, options),
};
