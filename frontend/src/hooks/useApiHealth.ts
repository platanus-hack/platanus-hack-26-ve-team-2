import { useEffect, useState } from "react";

import { clientApi } from "@/api";

type ApiStatus = "conectando..." | "ok" | "sin conexión";

export function useApiHealth(): ApiStatus {
  const [status, setStatus] = useState<ApiStatus>("conectando...");

  useEffect(() => {
    clientApi.health
      .check()
      .then(() => setStatus("ok"))
      .catch(() => setStatus("sin conexión"));
  }, []);

  return status;
}
