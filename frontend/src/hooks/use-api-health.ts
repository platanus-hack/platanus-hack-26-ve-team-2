import { useEffect, useState } from "react";

import { api } from "@/lib/api";

type ApiStatus = "conectando..." | "ok" | "sin conexión";

export function useApiHealth(): ApiStatus {
  const [status, setStatus] = useState<ApiStatus>("conectando...");

  useEffect(() => {
    api
      .health()
      .then(() => setStatus("ok"))
      .catch(() => setStatus("sin conexión"));
  }, []);

  return status;
}
