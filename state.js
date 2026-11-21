/**
 * CueTimer – Shared State & Sync Layer
 * BroadcastChannel + localStorage for same-device multi-tab sync.
 * State shape is designed for easy Firebase/WebSocket migration.
 */

const STORAGE_KEY = 'cuetimer_state';
const CHANNEL_NAME = 'cuetimer_sync';

/** @typedef {'idle'|'running'|'paused'|'ended'} PlayState */
/** @typedef {'main'|'buffer'} CueType */
/** @typedef {'manual'|'auto'} TriggerMode */
/** @typedef {'ripple'|'trim-next'|'absorb'} OvertimeMode */

/**
 * @typedef {Object} Cue
 * @property {string} id
 * @property {string} title
 * @property {string} speaker
 * @property {number} plannedDuration  - seconds
 * @property {number} adjustedDuration - seconds (live-editable)
 * @property {CueType} type
 * @property {TriggerMode} triggerMode
 * @property {number} warningYellow    - seconds remaining to trigger yellow
 * @property {number} warningRed       - seconds remaining to trigger red
 * @property {string} notes
 * @property {boolean} played
 * @property {number|null} actualDuration - seconds (set when cue completes)
 */

/**
 * @typedef {Object} AppState
 * @property {string} eventTitle
 * @property {string} eventStartTime  - ISO string or "HH:MM" for today
 * @property {Cue[]} cues
 * @property {number} activeCueIndex
 * @property {PlayState} playState
 * @property {number} timerRemaining  - seconds remaining in active cue
 * @property {number} eventElapsed    - seconds since event start
 * @property {number|null} timerStartedAt - performance.now() snapshot
 * @property {string|null} flashMessage
 * @property {boolean} flashBlink
 * @property {string|null} googleSheetUrl
 * @property {OvertimeMode} overtimeMode
 * @property {number} adjustStep      - seconds for +/- adjustment
 */

/** @returns {AppState} */
export function defaultState() {
  return {
    eventTitle: 'My Event',
    eventStartTime: todayAt('09:00'),
    cues: [],
    activeCueIndex: -1,
    playState: 'idle',
    timerRemaining: 0,
    eventElapsed: 0,
    timerStartedAt: null,
    flashMessage: null,
    flashBlink: false,
    googleSheetUrl: null,
    overtimeMode: 'ripple',
    adjustStep: 60,
  };
}

function todayAt(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

/** @returns {Cue} */
export function newCue(overrides = {}) {
  return {
    id: uid(),
    title: '',
    speaker: '',
    plannedDuration: 300,
    adjustedDuration: 300,
    type: 'main',
    triggerMode: 'manual',
    warningYellow: 120,
    warningRed: 30,
    notes: '',
    played: false,
    actualDuration: null,
    ...overrides,
  };
}

// ─── Persistence ─────────────────────────────────────────────────────────────

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (_) {}
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

// ─── BroadcastChannel sync ───────────────────────────────────────────────────

let _channel = null;

export function getChannel() {
  if (!_channel && typeof BroadcastChannel !== 'undefined') {
    _channel = new BroadcastChannel(CHANNEL_NAME);
  }
  return _channel;
}

export function broadcast(state) {
  saveState(state);
  const ch = getChannel();
  if (ch) {
    try { ch.postMessage({ type: 'STATE_UPDATE', state }); } catch (_) {}
  }
}

// ─── Time helpers ────────────────────────────────────────────────────────────

/** Parse "MM:SS", "HH:MM:SS", or plain seconds number → seconds */
export function parseDuration(raw) {
  if (raw === null || raw === undefined || raw === '') return 0;
  const s = String(raw).trim();
  if (/^\d+$/.test(s)) return parseInt(s, 10) * 60; // plain number = minutes
  const parts = s.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

/** seconds → "MM:SS" */
export function fmtMMSS(secs) {
  const abs = Math.abs(Math.round(secs));
  const m = Math.floor(abs / 60).toString().padStart(2, '0');
  const s = (abs % 60).toString().padStart(2, '0');
  return (secs < 0 ? '-' : '') + m + ':' + s;
}

/** seconds → "HH:MM:SS" */
export function fmtHHMMSS(secs) {
  const abs = Math.abs(Math.round(secs));
  const h = Math.floor(abs / 3600).toString().padStart(2, '0');
  const m = Math.floor((abs % 3600) / 60).toString().padStart(2, '0');
  const s = (abs % 60).toString().padStart(2, '0');
  return (secs < 0 ? '-' : '') + h + ':' + m + ':' + s;
}

/** "HH:MM:SS" live clock */
export function nowHHMMSS() {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

/** Compute scheduled start/end times for each cue given event start */
export function computeSchedule(cues, eventStartISO) {
  const start = new Date(eventStartISO).getTime();
  let cursor = start;
  return cues.map(cue => {
    const s = cursor;
    cursor += cue.adjustedDuration * 1000;
    return { scheduledStart: s, scheduledEnd: cursor };
  });
}

/** Format ms timestamp as "HH:MM" */
export function fmtTime(ms) {
  const d = new Date(ms);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// ─── Overtime recovery ───────────────────────────────────────────────────────

/**
 * @param {Cue[]} cues
 * @param {number} fromIndex - index of cue that just finished
 * @param {number} overTimeSeconds - positive = overtime amount
 * @param {OvertimeMode} mode
 * @returns {Cue[]} new cues array with adjustments applied
 */
export function applyOvertimeRecovery(cues, fromIndex, overTimeSeconds, mode) {
  if (overTimeSeconds <= 0) return cues;
  const next = cues.slice();
  const remaining = next.slice(fromIndex + 1).filter(c => !c.played);
  const remainingIndices = [];
  for (let i = fromIndex + 1; i < next.length; i++) {
    if (!next[i].played) remainingIndices.push(i);
  }

  if (mode === 'trim-next' && remainingIndices.length > 0) {
    const idx = remainingIndices[0];
    next[idx] = {
      ...next[idx],
      adjustedDuration: Math.max(0, next[idx].adjustedDuration - overTimeSeconds),
    };
  } else if (mode === 'absorb') {
    // First absorb buffers, then proportional
    let ot = overTimeSeconds;
    for (const idx of remainingIndices) {
      if (next[idx].type === 'buffer' && ot > 0) {
        const trim = Math.min(next[idx].adjustedDuration, ot);
        next[idx] = { ...next[idx], adjustedDuration: next[idx].adjustedDuration - trim };
        ot -= trim;
      }
    }
    if (ot > 0) {
      const totalRemaining = remainingIndices
        .filter(i => next[i].type !== 'buffer')
        .reduce((sum, i) => sum + next[i].adjustedDuration, 0);
      if (totalRemaining > 0) {
        for (const idx of remainingIndices) {
          if (next[idx].type !== 'buffer') {
            const trim = ot * (next[idx].adjustedDuration / totalRemaining);
            next[idx] = {
              ...next[idx],
              adjustedDuration: Math.max(0, next[idx].adjustedDuration - trim),
            };
          }
        }
      }
    }
  }
  // 'ripple' mode: timestamps shift automatically via computeSchedule; no duration change needed.
  return next;
}
