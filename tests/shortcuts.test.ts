import { describe, it, expect } from 'vitest';
import { resolveShortcutAction, isTypingTarget, SHORTCUT_DEFINITIONS } from '../src/core/shortcuts';

describe('Keyboard Shortcut Engine', () => {
  it('resolves Play/Pause, Skip/Next, Previous, Reset, End, Mute, and Adjust shortcuts', () => {
    expect(resolveShortcutAction({ key: ' ', code: 'Space' })).toBe('TOGGLE_PLAY_PAUSE');
    expect(resolveShortcutAction({ key: 'p' })).toBe('TOGGLE_PLAY_PAUSE');
    expect(resolveShortcutAction({ key: 'K' })).toBe('TOGGLE_PLAY_PAUSE');

    expect(resolveShortcutAction({ key: 'ArrowRight' })).toBe('NEXT_CUE');
    expect(resolveShortcutAction({ key: 's' })).toBe('NEXT_CUE');
    expect(resolveShortcutAction({ key: 'N' })).toBe('NEXT_CUE');

    expect(resolveShortcutAction({ key: 'ArrowLeft' })).toBe('PREV_CUE');
    expect(resolveShortcutAction({ key: 'b' })).toBe('PREV_CUE');

    expect(resolveShortcutAction({ key: 'r' })).toBe('RESET_CUE');
    expect(resolveShortcutAction({ key: 'e' })).toBe('END_EVENT');
    expect(resolveShortcutAction({ key: 'm' })).toBe('TOGGLE_MUTE');
    expect(resolveShortcutAction({ key: 'f' })).toBe('TOGGLE_FULLSCREEN');
    expect(resolveShortcutAction({ key: '?' })).toBe('TOGGLE_SHORTCUTS_HELP');

    expect(resolveShortcutAction({ key: '+' })).toBe('ADJUST_PLUS');
    expect(resolveShortcutAction({ key: '=' })).toBe('ADJUST_PLUS');
    expect(resolveShortcutAction({ key: 'ArrowUp' })).toBe('ADJUST_PLUS');
    expect(resolveShortcutAction({ key: '-' })).toBe('ADJUST_MINUS');
    expect(resolveShortcutAction({ key: 'ArrowDown' })).toBe('ADJUST_MINUS');
  });

  it('suppresses transport shortcuts while typing inside inputs, textareas, selects, or contentEditable', () => {
    expect(isTypingTarget({ key: ' ', targetTagName: 'INPUT' })).toBe(true);
    expect(isTypingTarget({ key: 's', targetTagName: 'TEXTAREA' })).toBe(true);
    expect(isTypingTarget({ key: 'p', targetTagName: 'SELECT' })).toBe(true);
    expect(isTypingTarget({ key: 'r', targetTagName: 'DIV', isContentEditable: true })).toBe(true);

    expect(resolveShortcutAction({ key: ' ', code: 'Space', targetTagName: 'INPUT' })).toBeNull();
    expect(resolveShortcutAction({ key: 's', targetTagName: 'TEXTAREA' })).toBeNull();
    expect(resolveShortcutAction({ key: 'Escape', targetTagName: 'INPUT' })).toBe('CLOSE_MODAL');
  });

  it('ignores key repeat on toggle/skip actions and supports Ctrl/Cmd Undo/Redo', () => {
    expect(resolveShortcutAction({ key: ' ', code: 'Space', repeat: true })).toBeNull();
    expect(resolveShortcutAction({ key: 's', repeat: true })).toBeNull();
    expect(resolveShortcutAction({ key: '+', repeat: true })).toBe('ADJUST_PLUS');

    expect(resolveShortcutAction({ key: 'z', ctrlKey: true })).toBe('UNDO');
    expect(resolveShortcutAction({ key: 'z', metaKey: true, shiftKey: true })).toBe('REDO');
    expect(resolveShortcutAction({ key: 'y', ctrlKey: true })).toBe('REDO');
    expect(SHORTCUT_DEFINITIONS.length).toBeGreaterThanOrEqual(10);
  });
});
