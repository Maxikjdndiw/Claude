import { useEffect, useState } from 'preact/hooks';

/** Minimal observable store. The UI re-renders on `emit()`. */
export class Store<T extends object> {
  private listeners = new Set<() => void>();
  constructor(public state: T) {}

  set(patch: Partial<T>): void {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  emit(): void {
    for (const l of this.listeners) l();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

/** Subscribe a component to a store; re-renders when the selected value changes. */
export function useStore<T extends object, R>(store: Store<T>, select: (s: T) => R): R {
  const [, force] = useState(0);
  useEffect(() => {
    let last = select(store.state);
    return store.subscribe(() => {
      const next = select(store.state);
      if (next !== last) {
        last = next;
        force((x) => x + 1);
      }
    });
  }, [store]);
  return select(store.state);
}
