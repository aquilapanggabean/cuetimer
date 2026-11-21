export class HistoryManager<T> {
  private past: T[] = [];
  private present: T;
  private future: T[] = [];
  private maxDepth: number;

  constructor(initialState: T, maxDepth = 30) {
    this.present = initialState;
    this.maxDepth = maxDepth;
  }

  public get current(): T {
    return this.present;
  }

  public canUndo(): boolean {
    return this.past.length > 0;
  }

  public canRedo(): boolean {
    return this.future.length > 0;
  }

  public push(newState: T): void {
    this.past.push(this.present);
    if (this.past.length > this.maxDepth) {
      this.past.shift();
    }
    this.present = newState;
    this.future = []; // new action invalidates forward redo history
  }

  public undo(): T | null {
    if (!this.canUndo()) return null;
    const previous = this.past.pop()!;
    this.future.unshift(this.present);
    this.present = previous;
    return this.present;
  }

  public redo(): T | null {
    if (!this.canRedo()) return null;
    const next = this.future.shift()!;
    this.past.push(this.present);
    this.present = next;
    return this.present;
  }

  public clear(resetState?: T): void {
    this.past = [];
    this.future = [];
    if (resetState !== undefined) {
      this.present = resetState;
    }
  }
}
