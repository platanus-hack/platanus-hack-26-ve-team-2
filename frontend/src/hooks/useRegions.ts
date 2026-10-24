import { useCallback, useEffect, useState } from "react";

import { clientApi } from "@/api";
import type { ApiError } from "@/api";
import type { Region } from "@/types/region";

type State = { regions: Region[]; loading: boolean; error: ApiError | null };

export function useRegions() {
  const [state, setState] = useState<State>({ regions: [], loading: true, error: null });

  const load = useCallback(async () => {
    try {
      const regions = await clientApi.regions.list();
      setState({ regions, loading: false, error: null });
    } catch (e) {
      setState((prev) => ({ ...prev, loading: false, error: e as ApiError }));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(() => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    return load();
  }, [load]);

  return { ...state, refresh };
}
