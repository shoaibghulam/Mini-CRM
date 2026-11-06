import { useCallback, useEffect, useRef, useState } from 'react';
import { describeError } from '@/domain/errors';

export type AsyncData<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'success'; readonly data: T };

/**
 * Runs `loader` on mount and whenever it changes (wrap it in useCallback).
 * `reload` re-runs it after a mutation and keeps showing the old data until the
 * new data arrives; a new loader (e.g. another id) resets to loading.
 * Stale responses are ignored.
 */
export function useAsyncData<T>(loader: () => Promise<T>): readonly [AsyncData<T>, () => void] {
  const [state, setState] = useState<AsyncData<T>>({ status: 'loading' });
  const [version, setVersion] = useState(0);
  const lastLoader = useRef(loader);

  useEffect(() => {
    let cancelled = false;
    const isReload = lastLoader.current === loader;
    lastLoader.current = loader;
    setState((prev) => (isReload && prev.status === 'success' ? prev : { status: 'loading' }));
    loader()
      .then((data) => {
        if (!cancelled) setState({ status: 'success', data });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ status: 'error', message: describeError(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [loader, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return [state, reload] as const;
}
