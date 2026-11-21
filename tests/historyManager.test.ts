import { describe, it, expect } from 'vitest';
import { HistoryManager } from '../src/storage/historyManager';

describe('HistoryManager', () => {
  it('supports undo and redo transitions', () => {
    const history = new HistoryManager<number>(1, 10);
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);

    history.push(2);
    history.push(3);

    expect(history.canUndo()).toBe(true);
    expect(history.undo()).toBe(2);
    expect(history.undo()).toBe(1);
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(true);

    expect(history.redo()).toBe(2);
    expect(history.redo()).toBe(3);
    expect(history.canRedo()).toBe(false);
  });

  it('drops redo history when new state is pushed after undo', () => {
    const history = new HistoryManager<string>('a');
    history.push('b');
    history.push('c');
    history.undo(); // now at 'b'
    history.push('d'); // brand new branch
    expect(history.canRedo()).toBe(false);
    expect(history.undo()).toBe('b');
  });

  it('respects maximum history stack limit', () => {
    const history = new HistoryManager<number>(0, 3);
    history.push(1);
    history.push(2);
    history.push(3);
    history.push(4); // exceeds max 3 items in past stack

    expect(history.undo()).toBe(3);
    expect(history.undo()).toBe(2);
    expect(history.undo()).toBe(1);
    expect(history.canUndo()).toBe(false);
  });
});
