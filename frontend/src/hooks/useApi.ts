import { useEffect, useRef, useState } from 'react';

export function useApi<T, Args extends unknown[]>(
  fn: (...args: Args) => Promise<T>,
  deps: unknown[] = [],
): {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: (...args: Args) => Promise<void>;
} {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const refetch = async (...args: Args): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const r = await fnRef.current(...args);
      setData(r);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refetch(...([] as unknown as Args));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, refetch };
}
