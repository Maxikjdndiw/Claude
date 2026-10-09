/** Minimal binary min-heap keyed by number priority (used by priority-flood and A*). */
export class MinHeap {
  private items: number[] = [];
  private prio: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: number, priority: number): void {
    const items = this.items;
    const prio = this.prio;
    let i = items.length;
    items.push(item);
    prio.push(priority);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (prio[p] <= priority) break;
      items[i] = items[p];
      prio[i] = prio[p];
      i = p;
    }
    items[i] = item;
    prio[i] = priority;
  }

  /** Returns the item with lowest priority. Undefined behavior when empty. */
  pop(): number {
    const items = this.items;
    const prio = this.prio;
    const top = items[0];
    const lastItem = items.pop()!;
    const lastPrio = prio.pop()!;
    const n = items.length;
    if (n > 0) {
      let i = 0;
      while (true) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && prio[r] < prio[l] ? r : l;
        if (prio[c] >= lastPrio) break;
        items[i] = items[c];
        prio[i] = prio[c];
        i = c;
      }
      items[i] = lastItem;
      prio[i] = lastPrio;
    }
    return top;
  }
}
