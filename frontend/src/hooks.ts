import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Me } from "./api";

/** Poll an async loader every `ms` while the tab is visible. */
export function usePoll<T>(load: () => Promise<T>, ms: number, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;

  const refresh = useCallback(async () => {
    try {
      setData(await loadRef.current());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = () => {
      if (alive && document.visibilityState === "visible") refresh();
    };
    tick();
    const id = setInterval(tick, ms);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, refresh, ...deps]);

  return { data, error, refresh };
}

export type SessionCtx = { me: Me | null; refreshMe: () => void; ready: boolean };
export const Session = createContext<SessionCtx>({ me: null, refreshMe: () => {}, ready: false });
export const useSession = () => useContext(Session);
