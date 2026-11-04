/** Ограниченный упорядоченный список лучших K элементов (вставка бинарным поиском). */
export class TopK<T> {
  private readonly items: T[] = [];

  constructor(
    private readonly k: number,
    private readonly compare: (a: T, b: T) => number,
  ) {}

  offer(item: T): void {
    const items = this.items;
    if (items.length === this.k && this.compare(item, items[items.length - 1] as T) >= 0) return;
    let lo = 0;
    let hi = items.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.compare(items[mid] as T, item) <= 0) lo = mid + 1;
      else hi = mid;
    }
    items.splice(lo, 0, item);
    if (items.length > this.k) items.pop();
  }

  toArray(): T[] {
    return [...this.items];
  }
}
