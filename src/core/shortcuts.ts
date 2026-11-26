export type ShortcutAction =
  | 'TOGGLE_PLAY_PAUSE'
  | 'NEXT_CUE'
  | 'PREV_CUE'
  | 'RESET_CUE'
  | 'END_EVENT'
  | 'ADJUST_PLUS'
  | 'ADJUST_MINUS'
  | 'TOGGLE_MUTE'
  | 'TOGGLE_FULLSCREEN'
  | 'TOGGLE_SHORTCUTS_HELP'
  | 'UNDO'
  | 'REDO'
  | 'CLOSE_MODAL';

export interface KeyEventLike {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
  targetTagName?: string;
  isContentEditable?: boolean;
}

export interface ShortcutDefinition {
  keys: string[];
  action: ShortcutAction;
  label: string;
  description: string;
  category: 'Transport' | 'Timing' | 'Workspace';
}

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  {
    keys: ['Space', 'P', 'K'],
    action: 'TOGGLE_PLAY_PAUSE',
    label: 'Play / Pause',
    description: 'Start, pause, or resume the active cue countdown',
    category: 'Transport'
  },
  {
    keys: ['→', 'S', 'N'],
    action: 'NEXT_CUE',
    label: 'Skip / Next Cue',
    description: 'Advance to the next cue in the rundown',
    category: 'Transport'
  },
  {
    keys: ['←', 'B'],
    action: 'PREV_CUE',
    label: 'Previous Cue',
    description: 'Return to the previous cue or reset the first cue',
    category: 'Transport'
  },
  {
    keys: ['R'],
    action: 'RESET_CUE',
    label: 'Reset Cue',
    description: 'Reset the active cue timer back to planned duration',
    category: 'Transport'
  },
  {
    keys: ['E'],
    action: 'END_EVENT',
    label: 'End Event',
    description: 'Stop playback and mark event stopwatch ended',
    category: 'Transport'
  },
  {
    keys: ['+', '↑'],
    action: 'ADJUST_PLUS',
    label: 'Add Time Step',
    description: 'Add the selected adjustment step to the active cue',
    category: 'Timing'
  },
  {
    keys: ['-', '↓'],
    action: 'ADJUST_MINUS',
    label: 'Subtract Time Step',
    description: 'Subtract the selected adjustment step from the active cue',
    category: 'Timing'
  },
  {
    keys: ['M'],
    action: 'TOGGLE_MUTE',
    label: 'Mute / Unmute Audio',
    description: 'Toggle warning and overtime audio chimes',
    category: 'Workspace'
  },
  {
    keys: ['Ctrl/Cmd + Z'],
    action: 'UNDO',
    label: 'Undo Change',
    description: 'Revert the last rundown or timing edit',
    category: 'Workspace'
  },
  {
    keys: ['Ctrl/Cmd + Y'],
    action: 'REDO',
    label: 'Redo Change',
    description: 'Reapply the last undone edit',
    category: 'Workspace'
  },
  {
    keys: ['F'],
    action: 'TOGGLE_FULLSCREEN',
    label: 'Fullscreen Stage',
    description: 'Toggle fullscreen when viewing the Stage Display',
    category: 'Workspace'
  },
  {
    keys: ['?'],
    action: 'TOGGLE_SHORTCUTS_HELP',
    label: 'Keyboard Shortcuts',
    description: 'Open or close this shortcut reference',
    category: 'Workspace'
  }
];

const IGNORED_INPUT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export function isTypingTarget(evt: KeyEventLike): boolean {
  if (evt.isContentEditable) return true;
  const tag = (evt.targetTagName || '').toUpperCase();
  return IGNORED_INPUT_TAGS.has(tag);
}

export function resolveShortcutAction(evt: KeyEventLike): ShortcutAction | null {
  const key = evt.key || '';
  const lower = key.toLowerCase();
  const hasModifier = Boolean(evt.ctrlKey || evt.metaKey);

  if (key === 'Escape') {
    return 'CLOSE_MODAL';
  }

  if (hasModifier && !evt.altKey) {
    if (lower === 'z') {
      return evt.shiftKey ? 'REDO' : 'UNDO';
    }
    if (lower === 'y' && !evt.shiftKey) {
      return 'REDO';
    }
    return null;
  }

  if (evt.altKey || isTypingTarget(evt)) {
    return null;
  }

  if (key === '?' || (key === '/' && evt.shiftKey)) {
    return evt.repeat ? null : 'TOGGLE_SHORTCUTS_HELP';
  }

  if (evt.code === 'Space' || key === ' ') {
    return evt.repeat ? null : 'TOGGLE_PLAY_PAUSE';
  }

  if (lower === 'p' || lower === 'k') {
    return evt.repeat ? null : 'TOGGLE_PLAY_PAUSE';
  }

  if (key === 'ArrowRight' || lower === 's' || lower === 'n') {
    return evt.repeat ? null : 'NEXT_CUE';
  }

  if (key === 'ArrowLeft' || lower === 'b') {
    return evt.repeat ? null : 'PREV_CUE';
  }

  if (lower === 'r') {
    return evt.repeat ? null : 'RESET_CUE';
  }

  if (lower === 'e') {
    return evt.repeat ? null : 'END_EVENT';
  }

  if (lower === 'm') {
    return evt.repeat ? null : 'TOGGLE_MUTE';
  }

  if (lower === 'f') {
    return evt.repeat ? null : 'TOGGLE_FULLSCREEN';
  }

  if (key === '+' || key === '=' || key === 'ArrowUp') {
    return 'ADJUST_PLUS';
  }

  if (key === '-' || key === '_' || key === 'ArrowDown') {
    return 'ADJUST_MINUS';
  }

  return null;
}
