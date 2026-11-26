import { AppState, Cue, SavedRundown } from './core/types';
import {
  formatMMSS,
  formatHHMMSS,
  formatClockHHMM,
  formatClockHHMMSS,
  calculateElapsedMs,
  calculateRemainingMs,
  parseDurationSeconds
} from './core/timeEngine';
import { computeSchedule } from './core/scheduleEngine';
import { applyRippleShift, applyTrimNext, applyBufferProportionalTrim } from './core/recoveryEngine';
import { resolveShortcutAction } from './core/shortcuts';
import { AudioEngine } from './audio/audioEngine';
import { requestScreenWakeLock, releaseScreenWakeLock } from './core/wakeLock';
import { HistoryManager } from './storage/historyManager';
import {
  saveEventToDb,
  loadEventFromDb,
  loadActiveEventSync,
  saveLastUsedRundown,
  loadLastUsedRundown,
  loadLastUsedRundownSync,
  saveNamedRundown,
  listNamedRundowns,
  deleteNamedRundown
} from './storage/indexedDb';
import {
  parseSpreadsheetWithMeta,
  exportRundownToExcel,
  downloadRundownTemplate,
  createId
} from './storage/spreadsheetParser';
import { SyncEngine } from './sync/syncEngine';
import { getCurrentRoute, navigateTo, AppRoute } from './ui/router';
import { renderOperatorViewHtml } from './ui/components/operatorView';
import { renderStageViewHtml } from './ui/components/stageView';
import { renderOverlayViewHtml } from './ui/components/overlayView';
import { renderModalsHtml } from './ui/components/modals';

function buildDefaultCues(): Cue[] {
  return [
    {
      id: createId('cue'),
      title: 'Opening Remarks',
      speaker: 'Event Host',
      plannedDurationSec: 300,
      adjustedDurationSec: 300,
      type: 'Main',
      mode: 'manual',
      yellowThresholdSec: 120,
      redThresholdSec: 30,
      notes: 'Welcome attendees and introduce keynote theme',
      status: 'pending'
    },
    {
      id: createId('cue'),
      title: 'Keynote Address',
      speaker: 'Lead Keynote Speaker',
      plannedDurationSec: 1200,
      adjustedDurationSec: 1200,
      type: 'Main',
      mode: 'manual',
      yellowThresholdSec: 120,
      redThresholdSec: 30,
      notes: 'Main presentation deck on Playback A',
      status: 'pending'
    },
    {
      id: createId('cue'),
      title: 'Coffee & Networking Buffer',
      speaker: 'Stage Manager',
      plannedDurationSec: 600,
      adjustedDurationSec: 600,
      type: 'Buffer/Break',
      mode: 'auto',
      yellowThresholdSec: 120,
      redThresholdSec: 30,
      notes: 'Reset stage chairs and test panel microphones',
      status: 'pending'
    },
    {
      id: createId('cue'),
      title: 'Technical Panel Discussion',
      speaker: 'Panel Moderator',
      plannedDurationSec: 1500,
      adjustedDurationSec: 1500,
      type: 'Main',
      mode: 'manual',
      yellowThresholdSec: 120,
      redThresholdSec: 30,
      notes: 'Include 5 minutes for audience Q&A',
      status: 'pending'
    },
    {
      id: createId('cue'),
      title: 'Closing Summary',
      speaker: 'Program Director',
      plannedDurationSec: 300,
      adjustedDurationSec: 300,
      type: 'Main',
      mode: 'manual',
      yellowThresholdSec: 120,
      redThresholdSec: 30,
      notes: 'Final wrap-up and next-day schedule announcement',
      status: 'pending'
    }
  ];
}

function createInitialState(): AppState {
  return {
    eventName: 'Main Stage Event',
    eventStartTime: '09:00',
    cues: buildDefaultCues(),
    activeCueIndex: 0,
    isRunning: false,
    startedAtEpoch: null,
    accumulatedElapsedMs: 0,
    eventFirstStartedEpoch: null,
    eventEndedEpoch: null,
    scheduleOffsetSec: 0,
    adjustStepSec: 60,
    flashMessage: {
      text: '',
      blinking: false,
      visible: false,
      dismissedOnStage: false
    },
    googleSheetUrl: ''
  };
}

function normalizeRestoredState(raw: Partial<AppState> | null): AppState {
  const base = createInitialState();
  if (!raw || !Array.isArray(raw.cues)) return base;
  return {
    ...base,
    ...raw,
    eventName: raw.eventName || base.eventName,
    eventStartTime: raw.eventStartTime || base.eventStartTime,
    cues: raw.cues,
    activeCueIndex:
      raw.cues.length > 0
        ? Math.max(0, Math.min(raw.activeCueIndex ?? 0, raw.cues.length - 1))
        : 0,
    adjustStepSec: raw.adjustStepSec && raw.adjustStepSec > 0 ? raw.adjustStepSec : 60,
    flashMessage: raw.flashMessage
      ? { ...base.flashMessage, ...raw.flashMessage }
      : base.flashMessage
  };
}

// App Singleton Services
const syncEngine = new SyncEngine('cuetimer_sync_production_v1');
const audioEngine = new AudioEngine();
const initialState = normalizeRestoredState(loadActiveEventSync());
const historyManager = new HistoryManager<AppState>(initialState, 30);
let state: AppState = initialState;

let currentRoute: AppRoute = 'operator';
let pendingOvertimeAction: { overtimeSec: number; advanceAfter: boolean } | null = null;
let draggedRowIndex: number | null = null;
let searchFilterQuery = '';
let toastTimer: ReturnType<typeof setTimeout> | null = null;
let idleMouseTimer: ReturnType<typeof setTimeout> | null = null;
let lastChimePlayedForCue: string | null = null;
let cachedLastRundown: SavedRundown | null = loadLastUsedRundownSync();

function showToast(text: string): void {
  const banner = document.getElementById('toastBanner');
  const msgEl = document.getElementById('toastMessage');
  if (!banner || !msgEl) return;
  msgEl.textContent = text;
  banner.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    banner.classList.add('hidden');
  }, 3500);
}

function buildRundownSnapshot(nameOverride?: string, source: 'manual' | 'import' | 'auto' = 'auto'): SavedRundown {
  const totalDurationSec = state.cues.reduce((sum, c) => sum + (c.plannedDurationSec || 0), 0);
  const cleanCues: Cue[] = state.cues.map((c) => ({
    ...c,
    adjustedDurationSec: c.plannedDurationSec,
    status: 'pending'
  }));

  return {
    id: createId('rundown'),
    name: (nameOverride || state.eventName || 'Untitled Rundown').trim(),
    eventStartTime: state.eventStartTime || '09:00',
    cues: cleanCues,
    totalDurationSec,
    updatedAt: Date.now(),
    source
  };
}

function commitState(pushToHistory = true, updateLastSnapshot = true): void {
  if (pushToHistory) {
    historyManager.push(JSON.parse(JSON.stringify(state)));
  }
  syncEngine.publishState(state);
  saveEventToDb('current_active_event', state).catch(() => {});

  if (updateLastSnapshot && state.cues.length > 0) {
    const snap = buildRundownSnapshot(state.eventName, 'auto');
    cachedLastRundown = snap;
    saveLastUsedRundown(snap).catch(() => {});
  }

  updateUndoRedoButtons();
  renderFullUI();
}

function updateUndoRedoButtons(): void {
  const btnUndo = document.getElementById('btnUndo') as HTMLButtonElement | null;
  const btnRedo = document.getElementById('btnRedo') as HTMLButtonElement | null;
  if (btnUndo) btnUndo.disabled = !historyManager.canUndo();
  if (btnRedo) btnRedo.disabled = !historyManager.canRedo();
}

function getActiveCue(): Cue | null {
  if (!state.cues.length) return null;
  const idx = Math.max(0, Math.min(state.activeCueIndex, state.cues.length - 1));
  return state.cues[idx] || null;
}

function getActiveElapsedMs(nowMs: number = Date.now()): number {
  return calculateElapsedMs(state.startedAtEpoch, state.accumulatedElapsedMs, nowMs, state.isRunning);
}

function getActiveRemainingMs(nowMs: number = Date.now()): number {
  const cue = getActiveCue();
  if (!cue) return 0;
  return calculateRemainingMs(cue.adjustedDurationSec, getActiveElapsedMs(nowMs));
}

function getTotalEventElapsedMs(nowMs: number = Date.now()): number {
  if (!state.eventFirstStartedEpoch) return 0;
  const endRef = state.eventEndedEpoch || nowMs;
  return Math.max(0, endRef - state.eventFirstStartedEpoch);
}

function computeMetrics(nowMs: number = Date.now()) {
  const activeElapsedSec = Math.floor(getActiveElapsedMs(nowMs) / 1000);
  return computeSchedule(
    state.eventStartTime,
    state.cues,
    state.activeCueIndex,
    activeElapsedSec,
    state.scheduleOffsetSec
  );
}

function getDetectableOvertimeSec(): number {
  const remMs = getActiveRemainingMs(Date.now());
  if (remMs < 0) return Math.ceil(Math.abs(remMs) / 1000);
  const metrics = computeMetrics(Date.now());
  return metrics.varianceSec > 0 ? metrics.varianceSec : 0;
}

// Playback Transport
function startPlayback(): void {
  const cue = getActiveCue();
  if (!cue) {
    showToast('Add a cue before starting playback.');
    return;
  }
  if (state.isRunning) return;

  const now = Date.now();
  if (!state.eventFirstStartedEpoch) {
    state.eventFirstStartedEpoch = now;
  }
  state.eventEndedEpoch = null;
  state.isRunning = true;
  state.startedAtEpoch = now;
  cue.status = 'active';
  commitState(true, false);
}

function pausePlayback(): void {
  if (!state.isRunning) return;
  const now = Date.now();
  state.accumulatedElapsedMs = getActiveElapsedMs(now);
  state.startedAtEpoch = null;
  state.isRunning = false;
  commitState(true, false);
}

function toggleStartPause(): void {
  if (state.isRunning) pausePlayback();
  else startPlayback();
}

function activateCueAtIndex(targetIndex: number, preserveRunState?: boolean): void {
  if (!state.cues.length) return;
  const clamped = Math.max(0, Math.min(targetIndex, state.cues.length - 1));
  const shouldRun = preserveRunState !== undefined ? preserveRunState : state.isRunning;
  const now = Date.now();

  state.cues.forEach((c, i) => {
    if (i < clamped) c.status = 'completed';
    else if (i === clamped) c.status = 'active';
    else c.status = 'pending';
  });

  state.activeCueIndex = clamped;
  state.accumulatedElapsedMs = 0;
  lastChimePlayedForCue = null;

  if (shouldRun) {
    if (!state.eventFirstStartedEpoch) state.eventFirstStartedEpoch = now;
    state.eventEndedEpoch = null;
    state.isRunning = true;
    state.startedAtEpoch = now;
  } else {
    state.isRunning = false;
    state.startedAtEpoch = null;
  }
  commitState(true, false);
}

function requestNextCue(): void {
  if (!state.cues.length) return;
  const remMs = getActiveRemainingMs(Date.now());
  const cueOvertimeSec = remMs < 0 ? Math.ceil(Math.abs(remMs) / 1000) : 0;

  if (cueOvertimeSec > 0 && state.activeCueIndex < state.cues.length - 1) {
    openOvertimeModal(cueOvertimeSec, true);
    return;
  }

  if (state.activeCueIndex < state.cues.length - 1) {
    activateCueAtIndex(state.activeCueIndex + 1);
  } else {
    const now = Date.now();
    state.cues[state.activeCueIndex].status = 'completed';
    state.isRunning = false;
    state.startedAtEpoch = null;
    state.accumulatedElapsedMs = 0;
    if (state.eventFirstStartedEpoch && !state.eventEndedEpoch) {
      state.eventEndedEpoch = now;
    }
    commitState(true, false);
    showToast('Completed final cue in rundown.');
  }
}

function requestPrevCue(): void {
  if (!state.cues.length) return;
  if (state.activeCueIndex > 0) {
    activateCueAtIndex(state.activeCueIndex - 1);
  } else {
    resetCurrentCue();
  }
}

function resetCurrentCue(): void {
  const cue = getActiveCue();
  if (!cue) return;
  state.isRunning = false;
  state.startedAtEpoch = null;
  state.accumulatedElapsedMs = 0;
  lastChimePlayedForCue = null;
  cue.adjustedDurationSec = cue.plannedDurationSec;
  commitState(true, false);
  showToast('Cue reset to planned duration.');
}

function endEventPlayback(): void {
  const now = Date.now();
  state.isRunning = false;
  state.startedAtEpoch = null;
  if (state.eventFirstStartedEpoch && !state.eventEndedEpoch) {
    state.eventEndedEpoch = now;
  }
  commitState(true, false);
  showToast('Event playback ended.');
}

function adjustActiveCueDuration(deltaSec: number): void {
  const cue = getActiveCue();
  if (!cue) return;
  cue.adjustedDurationSec = Math.max(0, cue.adjustedDurationSec + deltaSec);
  commitState(true, false);
  const sign = deltaSec >= 0 ? '+' : '-';
  showToast(`Adjusted active cue by ${sign}${formatMMSS(Math.abs(deltaSec))}.`);
}

function evaluateAutoNext(): void {
  if (!state.isRunning) return;
  const cue = getActiveCue();
  if (!cue || cue.mode !== 'auto') return;

  const now = Date.now();
  const remMs = getActiveRemainingMs(now);
  if (remMs <= 0) {
    if (state.activeCueIndex < state.cues.length - 1) {
      const carryOverMs = Math.min(Math.abs(remMs), 2000);
      const nextIdx = state.activeCueIndex + 1;
      state.cues[state.activeCueIndex].status = 'completed';
      state.cues[nextIdx].status = 'active';
      state.activeCueIndex = nextIdx;
      state.accumulatedElapsedMs = carryOverMs;
      state.startedAtEpoch = now;
      lastChimePlayedForCue = null;
      commitState(true, false);
    } else {
      cue.status = 'completed';
      state.isRunning = false;
      state.startedAtEpoch = null;
      state.accumulatedElapsedMs = cue.adjustedDurationSec * 1000;
      if (state.eventFirstStartedEpoch && !state.eventEndedEpoch) {
        state.eventEndedEpoch = now;
      }
      commitState(true, false);
    }
  }
}

function checkAudioAlerts(remSec: number, cue: Cue): void {
  if (!state.isRunning || !cue) return;
  const keyBase = cue.id + '_' + remSec;

  if (remSec === cue.yellowThresholdSec && lastChimePlayedForCue !== keyBase) {
    audioEngine.playChime('warning');
    lastChimePlayedForCue = keyBase;
  } else if (remSec === cue.redThresholdSec && lastChimePlayedForCue !== keyBase) {
    audioEngine.playChime('critical');
    lastChimePlayedForCue = keyBase;
  } else if (remSec === 0 && lastChimePlayedForCue !== keyBase) {
    audioEngine.playChime('overtime');
    lastChimePlayedForCue = keyBase;
  }
}

// Overtime Modal Handling
function openOvertimeModal(overtimeSec?: number, advanceAfter?: boolean): void {
  const delta = overtimeSec || getDetectableOvertimeSec();
  if (delta <= 0) {
    showToast('Schedule is currently on time.');
    return;
  }

  pendingOvertimeAction = {
    overtimeSec: delta,
    advanceAfter: Boolean(advanceAfter)
  };

  const deltaEl = document.getElementById('otDeltaValue');
  const captionEl = document.getElementById('otSummaryCaption');
  const modalEl = document.getElementById('overtimeRecoveryModal');
  const skipBtn = document.getElementById('btnSkipRecoveryAdvance');

  if (deltaEl) deltaEl.textContent = '+' + formatMMSS(delta);
  if (captionEl) {
    captionEl.textContent = advanceAfter
      ? 'Current cue ran over by ' + formatMMSS(delta) + '. Choose upcoming adjustment:'
      : 'Schedule variance is behind by ' + formatMMSS(delta) + '. Choose recovery mode:';
  }

  // Populate live previews on the 3 recovery cards
  const baseMetrics = computeMetrics();
  const rippleEnd = baseMetrics.plannedEndEpoch + (state.scheduleOffsetSec + delta) * 1000;
  const trimRes = applyTrimNext(state.cues, state.activeCueIndex, delta);
  const propRes = applyBufferProportionalTrim(state.cues, state.activeCueIndex, delta);

  const rippleEl = document.getElementById('otPreviewRipple');
  const trimEl = document.getElementById('otPreviewTrimNext');
  const propEl = document.getElementById('otPreviewProportional');

  if (rippleEl) {
    rippleEl.textContent = `New Projected End: ${formatClockHHMM(rippleEnd)} (+${formatMMSS(delta)})`;
  }
  if (trimEl) {
    const nextCue = state.cues[state.activeCueIndex + 1];
    const nextAfter = trimRes.updatedCues[state.activeCueIndex + 1];
    trimEl.textContent = nextCue && nextAfter
      ? `${nextCue.title}: ${formatMMSS(nextCue.adjustedDurationSec)} -> ${formatMMSS(nextAfter.adjustedDurationSec)}`
      : 'No subsequent cue available to trim';
  }
  if (propEl) {
    propEl.textContent = propRes.leftoverOffsetSec > 0
      ? `Absorbed ${formatMMSS(delta - propRes.leftoverOffsetSec)} · Remainder +${formatMMSS(propRes.leftoverOffsetSec)}`
      : `Full ${formatMMSS(delta)} absorbed across upcoming buffers/cues`;
  }

  if (skipBtn) {
    skipBtn.classList.toggle('hidden', !advanceAfter);
  }

  if (modalEl) modalEl.classList.remove('hidden');
}

function closeOvertimeModal(): void {
  const modalEl = document.getElementById('overtimeRecoveryModal');
  if (modalEl) modalEl.classList.add('hidden');
  pendingOvertimeAction = null;
}

function closeAllModals(): void {
  closeOvertimeModal();
  document.getElementById('saveRundownModal')?.classList.add('hidden');
  document.getElementById('savedRundownsModal')?.classList.add('hidden');
  document.getElementById('shortcutsModal')?.classList.add('hidden');
}

function executeRecovery(mode: 'ripple' | 'trim_next' | 'proportional'): void {
  if (!pendingOvertimeAction) return;
  const { overtimeSec, advanceAfter } = pendingOvertimeAction;
  const nextIdx = state.activeCueIndex + 1;

  if (mode === 'ripple') {
    state.scheduleOffsetSec = applyRippleShift(state.scheduleOffsetSec, overtimeSec);
    showToast('Applied Ripple / Cascade Shift (+' + formatMMSS(overtimeSec) + ').');
  } else if (mode === 'trim_next') {
    const res = applyTrimNext(state.cues, state.activeCueIndex, overtimeSec);
    state.cues = res.updatedCues;
    state.scheduleOffsetSec += res.leftoverOffsetSec;
    showToast('Trimmed immediate next cue by ' + formatMMSS(overtimeSec) + '.');
  } else if (mode === 'proportional') {
    const res = applyBufferProportionalTrim(state.cues, state.activeCueIndex, overtimeSec);
    state.cues = res.updatedCues;
    state.scheduleOffsetSec += res.leftoverOffsetSec;
    showToast('Absorbed ' + formatMMSS(overtimeSec) + ' via buffer and proportional trim.');
  }

  closeOvertimeModal();

  if (advanceAfter && nextIdx < state.cues.length) {
    activateCueAtIndex(nextIdx);
  } else {
    commitState();
  }
}

// Saved Rundowns & Last Used Helpers
function applyLoadedRundown(rundown: SavedRundown, labelPrefix = 'Loaded'): void {
  const clonedCues: Cue[] = (rundown.cues || []).map((c) => ({
    ...c,
    id: c.id || createId('cue'),
    adjustedDurationSec: c.plannedDurationSec,
    status: 'pending'
  }));

  state.eventName = rundown.name || state.eventName;
  state.eventStartTime = rundown.eventStartTime || state.eventStartTime || '09:00';
  state.cues = clonedCues;
  state.activeCueIndex = 0;
  state.isRunning = false;
  state.startedAtEpoch = null;
  state.accumulatedElapsedMs = 0;
  state.eventFirstStartedEpoch = null;
  state.eventEndedEpoch = null;
  state.scheduleOffsetSec = 0;
  lastChimePlayedForCue = null;

  commitState(true, true);
  showToast(`${labelPrefix} "${rundown.name}" (${clonedCues.length} cues · Start ${state.eventStartTime}).`);
}

function openSaveRundownModal(): void {
  if (!state.cues.length) {
    showToast('Add at least one cue before saving.');
    return;
  }
  const modal = document.getElementById('saveRundownModal');
  const input = document.getElementById('saveRundownNameInput') as HTMLInputElement | null;
  const summary = document.getElementById('saveRundownSummary');
  if (input) {
    input.value = state.eventName || 'Event Rundown';
  }
  if (summary) {
    const totalSec = state.cues.reduce((sum, c) => sum + c.plannedDurationSec, 0);
    summary.textContent = `${state.cues.length} cues · Start ${state.eventStartTime} · Total ${formatHHMMSS(totalSec)}`;
  }
  modal?.classList.remove('hidden');
  setTimeout(() => {
    input?.focus();
    input?.select();
  }, 20);
}

async function openSavedRundownsModal(): Promise<void> {
  const modal = document.getElementById('savedRundownsModal');
  modal?.classList.remove('hidden');
  await renderSavedRundownsModalContent();
}

async function renderSavedRundownsModalContent(): Promise<void> {
  const lastCard = document.getElementById('lastUsedRundownCard');
  const lastName = document.getElementById('lastUsedRundownName');
  const lastMeta = document.getElementById('lastUsedRundownMeta');
  const listEl = document.getElementById('savedRundownsList');

  const last = (await loadLastUsedRundown()) || cachedLastRundown;
  if (last) {
    cachedLastRundown = last;
  }

  if (lastCard && lastName && lastMeta) {
    if (last && last.cues.length > 0) {
      lastCard.classList.remove('hidden');
      lastName.textContent = last.name || 'Last Used Rundown';
      const savedDate = new Date(last.updatedAt).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      lastMeta.textContent = `${last.cues.length} cues · Start ${last.eventStartTime} · ${formatHHMMSS(last.totalDurationSec)} · ${savedDate}`;
    } else {
      lastCard.classList.add('hidden');
    }
  }

  if (!listEl) return;
  const items = await listNamedRundowns();

  if (!items.length) {
    listEl.innerHTML = `<div class="saved-empty-msg">No saved rundowns yet. Click "+ Save Current" to store your active rundown in the local library.</div>`;
    return;
  }

  listEl.innerHTML = items
    .map((item) => {
      const dateStr = new Date(item.updatedAt).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      return `
        <div class="saved-rundown-item" data-rundown-id="${escapeHtmlAttr(item.id)}">
          <div class="saved-item-main">
            <div class="saved-item-title">${escapeHtmlAttr(item.name)}</div>
            <div class="mono saved-item-meta">${item.cues.length} cues · Start ${escapeHtmlAttr(item.eventStartTime)} · ${formatHHMMSS(item.totalDurationSec)} · ${escapeHtmlAttr(dateStr)}</div>
          </div>
          <div class="saved-item-actions">
            <button type="button" class="btn btn-sm btn-contrast" data-saved-action="load" data-rundown-id="${escapeHtmlAttr(item.id)}" aria-label="Load ${escapeHtmlAttr(item.name)}">Load</button>
            <button type="button" class="btn btn-sm btn-ghost" data-saved-action="delete" data-rundown-id="${escapeHtmlAttr(item.id)}" aria-label="Delete ${escapeHtmlAttr(item.name)}" style="color:#FCA5A5;">Delete</button>
          </div>
        </div>
      `;
    })
    .join('');
}

// Rendering
function escapeHtmlAttr(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderRundownRows(): void {
  const tbody = document.getElementById('rundownTableBody');
  const emptyBox = document.getElementById('emptyRundownState');
  const tableWrap = document.getElementById('rundownTableContainer');
  if (!tbody || !emptyBox || !tableWrap) return;

  if (!state.cues.length) {
    emptyBox.classList.remove('hidden');
    tableWrap.classList.add('hidden');
    tbody.innerHTML = '';
    const emptyLoadLast = document.getElementById('btnEmptyLoadLast');
    if (emptyLoadLast) {
      emptyLoadLast.classList.toggle('hidden', !cachedLastRundown || !cachedLastRundown.cues.length);
    }
    return;
  }

  emptyBox.classList.add('hidden');
  tableWrap.classList.remove('hidden');

  const metrics = computeMetrics();
  const frag = document.createDocumentFragment();
  const q = searchFilterQuery.trim().toLowerCase();

  let renderedCount = 0;

  state.cues.forEach((cue, idx) => {
    if (q) {
      const hay = `${cue.title} ${cue.speaker} ${cue.notes}`.toLowerCase();
      if (!hay.includes(q)) return;
    }
    renderedCount++;

    const tr = document.createElement('tr');
    tr.className = 'cue-row';
    if (idx === state.activeCueIndex) tr.classList.add('is-active');
    else if (cue.status === 'completed') tr.classList.add('is-completed');
    tr.draggable = !q;
    tr.dataset.index = String(idx);

    if (!q) {
      tr.addEventListener('dragstart', (e) => {
        draggedRowIndex = idx;
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      });
      tr.addEventListener('dragover', (e) => {
        e.preventDefault();
        tr.classList.add('is-drag-target');
      });
      tr.addEventListener('dragleave', () => {
        tr.classList.remove('is-drag-target');
      });
      tr.addEventListener('drop', (e) => {
        e.preventDefault();
        tr.classList.remove('is-drag-target');
        if (draggedRowIndex !== null && draggedRowIndex !== idx) {
          const moved = state.cues.splice(draggedRowIndex, 1)[0];
          state.cues.splice(idx, 0, moved);
          commitState();
        }
        draggedRowIndex = null;
      });
    }

    const sched = metrics.cueSchedules[idx];
    const rangeLabel = sched ? formatClockHHMM(sched.startEpoch) + ' – ' + formatClockHHMM(sched.endEpoch) : '--:--';
    const diffSec = cue.adjustedDurationSec - cue.plannedDurationSec;
    const diffTag =
      diffSec !== 0
        ? `<span class="cue-delta-text mono ${diffSec > 0 ? 'is-plus' : 'is-minus'}">${diffSec > 0 ? '+' : ''}${formatMMSS(diffSec)}</span>`
        : '';

    const safeTitle = escapeHtmlAttr(cue.title);

    tr.innerHTML = `
      <td>
        <div class="cue-index-cell">
          <span class="drag-grip" title="${q ? 'Clear filter to reorder' : 'Drag to reorder'}">&#x22EE;&#x22EE;</span>
          <span class="cue-index-num mono">${idx + 1}</span>
        </div>
      </td>
      <td>
        <input type="text" class="inline-cell-input" data-field="title" data-index="${idx}" value="${safeTitle}" aria-label="Cue ${idx + 1} title" />
      </td>
      <td>
        <input type="text" class="inline-cell-input" data-field="speaker" data-index="${idx}" value="${escapeHtmlAttr(cue.speaker)}" aria-label="Cue ${idx + 1} speaker" />
      </td>
      <td>
        <input type="text" class="inline-cell-input inline-mono" data-field="planned" data-index="${idx}" value="${formatMMSS(cue.plannedDurationSec)}" aria-label="Cue ${idx + 1} planned duration" />
      </td>
      <td class="mono" style="white-space:nowrap;font-size:12px;">
        <span>${formatMMSS(cue.adjustedDurationSec)}</span>${diffTag}
      </td>
      <td class="mono" style="white-space:nowrap;font-size:12px;color:var(--text-muted);">
        ${rangeLabel}
      </td>
      <td>
        <select class="select select-sm" data-field="type" data-index="${idx}" aria-label="Cue ${idx + 1} type">
          <option value="Main" ${cue.type === 'Main' ? 'selected' : ''}>Main</option>
          <option value="Buffer/Break" ${cue.type === 'Buffer/Break' ? 'selected' : ''}>Buffer/Break</option>
        </select>
      </td>
      <td>
        <select class="select select-sm" data-field="mode" data-index="${idx}" aria-label="Cue ${idx + 1} trigger mode">
          <option value="manual" ${cue.mode === 'manual' ? 'selected' : ''}>Manual</option>
          <option value="auto" ${cue.mode === 'auto' ? 'selected' : ''}>Auto-next</option>
        </select>
      </td>
      <td>
        <div class="warn-inputs-pair">
          <input type="text" class="inline-cell-input inline-mono" style="width:48px;color:var(--alert-amber);" data-field="yellow" data-index="${idx}" value="${formatMMSS(cue.yellowThresholdSec)}" title="Yellow warning threshold" aria-label="Cue ${idx + 1} yellow warning" />
          <input type="text" class="inline-cell-input inline-mono" style="width:48px;color:var(--alert-red);" data-field="red" data-index="${idx}" value="${formatMMSS(cue.redThresholdSec)}" title="Red warning threshold" aria-label="Cue ${idx + 1} red warning" />
        </div>
      </td>
      <td>
        <input type="text" class="inline-cell-input" data-field="notes" data-index="${idx}" value="${escapeHtmlAttr(cue.notes)}" placeholder="Notes" aria-label="Cue ${idx + 1} notes" />
      </td>
      <td style="text-align:right;white-space:nowrap;">
        <div class="row-actions-group">
          <button type="button" class="btn btn-icon btn-ghost" data-row-action="play" data-index="${idx}" title="Play ${safeTitle}" aria-label="Play ${safeTitle}">&#x25B6;</button>
          <button type="button" class="btn btn-icon btn-ghost" data-row-action="up" data-index="${idx}" title="Move up" aria-label="Move ${safeTitle} up" ${idx === 0 || q ? 'disabled' : ''}>&#x2191;</button>
          <button type="button" class="btn btn-icon btn-ghost" data-row-action="duplicate" data-index="${idx}" title="Duplicate ${safeTitle}" aria-label="Duplicate ${safeTitle}">&#x2398;</button>
          <button type="button" class="btn btn-icon btn-ghost" data-row-action="delete" data-index="${idx}" title="Delete ${safeTitle}" aria-label="Delete ${safeTitle}" style="color:#FCA5A5;">&times;</button>
        </div>
      </td>
    `;

    frag.appendChild(tr);
  });

  if (renderedCount === 0 && q) {
    const emptyFilterRow = document.createElement('tr');
    emptyFilterRow.innerHTML = `<td colspan="11" style="text-align:center;padding:24px;color:var(--text-muted);">No cues matching "${escapeHtmlAttr(searchFilterQuery)}".</td>`;
    frag.appendChild(emptyFilterRow);
  }

  tbody.innerHTML = '';
  tbody.appendChild(frag);
}

function renderLiveTick(): void {
  const now = Date.now();
  const cue = getActiveCue();
  const nextCue = state.cues[state.activeCueIndex + 1] || null;
  const remMs = getActiveRemainingMs(now);
  const remSec = remMs < 0 ? -Math.ceil(Math.abs(remMs) / 1000) : Math.ceil(remMs / 1000);
  const formattedCountdown = cue ? formatMMSS(remSec) : '00:00';

  if (cue) checkAudioAlerts(remSec, cue);

  const alertLevel =
    remSec < 0
      ? 'overtime'
      : cue && remSec <= cue.redThresholdSec
      ? 'critical'
      : cue && remSec <= cue.yellowThresholdSec
      ? 'warning'
      : 'normal';

  const textClass =
    alertLevel === 'overtime' || alertLevel === 'critical'
      ? 'text-critical'
      : alertLevel === 'warning'
      ? 'text-warning'
      : 'text-normal';
  const fillClass =
    alertLevel === 'overtime' || alertLevel === 'critical'
      ? 'fill-critical'
      : alertLevel === 'warning'
      ? 'fill-warning'
      : 'fill-normal';

  const progressPct =
    cue && cue.adjustedDurationSec > 0
      ? Math.max(0, Math.min(100, (remMs / (cue.adjustedDurationSec * 1000)) * 100))
      : 0;

  const clockStr = formatClockHHMMSS(now);
  const elapsedStr = formatHHMMSS(Math.floor(getTotalEventElapsedMs(now) / 1000));
  const metrics = computeMetrics(now);

  let varianceLabel = 'On Time';
  let varianceStateClass = 'is-ontime';
  if (metrics.varianceSec >= 2) {
    varianceLabel = 'Behind +' + formatMMSS(metrics.varianceSec);
    varianceStateClass = 'is-behind';
  } else if (metrics.varianceSec <= -2) {
    varianceLabel = 'Ahead -' + formatMMSS(Math.abs(metrics.varianceSec));
    varianceStateClass = 'is-ahead';
  }

  // Operator UI updates
  const plannedEndEl = document.getElementById('plannedEndText');
  const projEndEl = document.getElementById('projectedEndText');
  const varBadge = document.getElementById('varianceBadge');
  const otBar = document.getElementById('overtimeRecoveryBar');
  const timerBtn = document.getElementById('btnTimerClickEdit');

  if (plannedEndEl) plannedEndEl.textContent = formatClockHHMM(metrics.plannedEndEpoch);
  if (projEndEl) projEndEl.textContent = formatClockHHMM(metrics.projectedEndEpoch);
  if (varBadge) {
    varBadge.textContent = varianceLabel;
    varBadge.className = 'variance-status ' + varianceStateClass;
  }

  if (otBar) {
    const otDelta = getDetectableOvertimeSec();
    if (otDelta > 0 && state.cues.length > 0) {
      otBar.classList.remove('hidden');
      const textEl = document.getElementById('overtimeBarText');
      if (textEl) {
        textEl.textContent =
          remSec < 0
            ? 'Active cue is in overtime by +' + formatMMSS(otDelta)
            : 'Schedule is behind by +' + formatMMSS(otDelta);
      }
    } else {
      otBar.classList.add('hidden');
    }
  }

  if (timerBtn) {
    timerBtn.textContent = formattedCountdown;
    timerBtn.className = 'timer-readout-btn ' + textClass;
  }

  // Mini stage preview
  const miniScreen = document.getElementById('miniStageScreen');
  if (miniScreen) {
    miniScreen.classList.toggle('is-overtime', alertLevel === 'overtime');
    const miniSession = document.getElementById('miniSessionName');
    const miniClock = document.getElementById('miniClockText');
    const miniElapsed = document.getElementById('miniElapsedText');
    const miniCueTitle = document.getElementById('miniCueTitle');
    const miniCueSpeaker = document.getElementById('miniCueSpeaker');
    const miniHero = document.getElementById('miniHeroTimer');
    const miniFill = document.getElementById('miniProgressFill');
    const miniUpNext = document.getElementById('miniUpNextText');
    const miniStatus = document.getElementById('miniStatusTag');

    if (miniSession) {
      miniSession.textContent = state.cues.length ? `Cue ${state.activeCueIndex + 1} of ${state.cues.length}` : 'No Cues';
    }
    if (miniClock) miniClock.textContent = clockStr;
    if (miniElapsed) miniElapsed.textContent = elapsedStr;
    if (miniCueTitle) miniCueTitle.textContent = cue ? cue.title : 'Standby';
    if (miniCueSpeaker) miniCueSpeaker.textContent = cue ? cue.speaker : '';
    if (miniHero) {
      miniHero.textContent = formattedCountdown;
      miniHero.className = 'mini-hero-digits mono ' + textClass;
    }
    if (miniFill) {
      miniFill.style.width = progressPct + '%';
      miniFill.className = 'mini-progress-fill ' + fillClass;
    }
    if (miniUpNext) {
      miniUpNext.textContent = nextCue ? `Up Next: ${nextCue.title}` : 'Up Next: End of Event';
    }
    if (miniStatus) {
      miniStatus.textContent = alertLevel === 'overtime' ? 'OVERTIME' : state.isRunning ? 'LIVE' : state.accumulatedElapsedMs > 0 ? 'PAUSED' : 'STANDBY';
    }
  }

  // Stage View (#/stage)
  const stageShell = document.getElementById('stageView');
  if (stageShell) {
    stageShell.classList.toggle('is-overtime', alertLevel === 'overtime');
    const stageSession = document.getElementById('stageSessionIndicator');
    const stageClock = document.getElementById('stageLocalClock');
    const stageElapsed = document.getElementById('stageElapsedStopwatch');
    const stageStatusTag = document.getElementById('stageScheduleStatusTag');
    const stageOvertimeTag = document.getElementById('stageOvertimeTag');
    const stagePausedTag = document.getElementById('stagePausedTag');
    const stageTitle = document.getElementById('stageCueTitle');
    const stageSpeaker = document.getElementById('stageCueSpeaker');
    const stageCountdown = document.getElementById('stageHeroCountdown');
    const stageFill = document.getElementById('stageProgressFill');
    const stageBar = document.getElementById('stageProgressBar');
    const stageUpNextTitle = document.getElementById('stageUpNextTitle');
    const stageUpNextMeta = document.getElementById('stageUpNextMeta');
    const stageFooter = document.getElementById('stageEventTitleFooter');

    if (stageSession) {
      stageSession.textContent = state.cues.length
        ? `${state.eventName || 'Event'} · Cue ${state.activeCueIndex + 1} of ${state.cues.length}`
        : 'Standby';
    }
    if (stageClock) stageClock.textContent = clockStr;
    if (stageElapsed) stageElapsed.textContent = elapsedStr;
    if (stageStatusTag) {
      stageStatusTag.textContent = varianceLabel;
      stageStatusTag.className = 'stage-variance-text mono ' + varianceStateClass;
    }
    if (stageOvertimeTag) stageOvertimeTag.classList.toggle('hidden', alertLevel !== 'overtime');
    if (stagePausedTag) {
      stagePausedTag.classList.toggle('hidden', state.isRunning || state.accumulatedElapsedMs === 0);
    }
    if (stageTitle) stageTitle.textContent = cue ? cue.title : 'End of Rundown';
    if (stageSpeaker) stageSpeaker.textContent = cue ? cue.speaker : 'Standby';
    if (stageCountdown) {
      stageCountdown.textContent = formattedCountdown;
      stageCountdown.className = 'stage-countdown-hero mono ' + textClass;
    }
    if (stageFill) {
      stageFill.style.width = progressPct + '%';
      stageFill.className = 'stage-progress-bar-fill ' + fillClass;
    }
    if (stageBar) {
      stageBar.setAttribute('aria-valuenow', String(Math.round(progressPct)));
    }
    if (stageUpNextTitle) {
      stageUpNextTitle.textContent = nextCue ? nextCue.title : 'End of Rundown';
    }
    if (stageUpNextMeta) {
      stageUpNextMeta.textContent = nextCue
        ? `· ${nextCue.speaker} · ${formatMMSS(nextCue.adjustedDurationSec)}`
        : '· Final Session';
    }
    if (stageFooter) {
      stageFooter.textContent = `${state.eventName || 'CueTimer'} · Stage Display`;
    }
  }

  // OBS Overlay View (#/overlay)
  const overlayTimer = document.getElementById('overlayTimer');
  const overlayBox = document.getElementById('overlayBox');
  const overlayCueTitle = document.getElementById('overlayCueTitle');
  const overlayCueSpeaker = document.getElementById('overlayCueSpeaker');
  const overlayBadge = document.getElementById('overlayStatusBadge');

  if (overlayTimer) {
    overlayTimer.textContent = formattedCountdown;
    overlayTimer.className = 'mono overlay-timer-digits ' + textClass;
  }
  if (overlayBox) {
    overlayBox.classList.toggle('is-overtime', alertLevel === 'overtime');
  }
  if (overlayCueTitle) overlayCueTitle.textContent = cue ? cue.title : 'Standby';
  if (overlayCueSpeaker) overlayCueSpeaker.textContent = cue ? cue.speaker : '';
  if (overlayBadge) {
    const isOvertime = alertLevel === 'overtime';
    overlayBadge.textContent = isOvertime ? 'OVERTIME' : state.isRunning ? 'LIVE' : 'PAUSED';
    overlayBadge.className =
      'overlay-status-text mono ' + (isOvertime ? 'is-overtime' : !state.isRunning ? 'is-paused' : '');
  }
}

function renderFullUI(): void {
  const eventNameInput = document.getElementById('eventNameInput') as HTMLInputElement | null;
  if (eventNameInput && document.activeElement !== eventNameInput) {
    eventNameInput.value = state.eventName || 'Main Stage Event';
  }

  const startInput = document.getElementById('eventStartInput') as HTMLInputElement | null;
  if (startInput && document.activeElement !== startInput) {
    startInput.value = state.eventStartTime || '09:00';
  }

  const metaText = document.getElementById('rundownMetaText');
  if (metaText) {
    const totalSec = state.cues.reduce((sum, c) => sum + c.adjustedDurationSec, 0);
    metaText.textContent = `${state.cues.length} cues · Total ${formatHHMMSS(totalSec)}`;
  }

  const activeCue = getActiveCue();
  const activeTitleEl = document.getElementById('transportActiveCueTitle');
  const activeSpeakerEl = document.getElementById('transportActiveCueSpeaker');
  if (activeTitleEl) activeTitleEl.textContent = activeCue ? activeCue.title : 'No active cue';
  if (activeSpeakerEl) activeSpeakerEl.textContent = activeCue ? activeCue.speaker : 'Add a cue to begin';

  const btnStartPause = document.getElementById('btnStartPause');
  const labelStartPause = document.getElementById('labelStartPause');
  if (btnStartPause && labelStartPause) {
    if (state.isRunning) {
      btnStartPause.className = 'btn btn-amber btn-transport-primary';
      labelStartPause.textContent = 'PAUSE';
    } else {
      btnStartPause.className = 'btn btn-emerald btn-transport-primary';
      labelStartPause.textContent = state.accumulatedElapsedMs > 0 ? 'RESUME' : 'START';
    }
  }

  const counterEl = document.getElementById('transportCueCounter');
  if (counterEl) {
    counterEl.textContent = state.cues.length ? `Cue ${state.activeCueIndex + 1} of ${state.cues.length}` : 'Cue 0 of 0';
  }

  // Sync preset adjust chips and custom inputs
  document.querySelectorAll('.chip-btn[data-step]').forEach((chip) => {
    const step = parseInt((chip as HTMLElement).dataset.step || '0', 10);
    chip.classList.toggle('is-active', step === state.adjustStepSec);
  });

  const minInput = document.getElementById('adjustMinInput') as HTMLInputElement | null;
  const secInput = document.getElementById('adjustSecInput') as HTMLInputElement | null;
  if (minInput && document.activeElement !== minInput) {
    minInput.value = String(Math.floor(state.adjustStepSec / 60));
  }
  if (secInput && document.activeElement !== secInput) {
    secInput.value = String(state.adjustStepSec % 60);
  }

  // Load Last button state
  const btnLoadLast = document.getElementById('btnLoadLastRundown') as HTMLButtonElement | null;
  if (btnLoadLast) {
    const hasLast = Boolean(cachedLastRundown && cachedLastRundown.cues.length > 0);
    btnLoadLast.disabled = !hasLast;
    btnLoadLast.title = hasLast
      ? `Load last rundown: "${cachedLastRundown!.name}" (${cachedLastRundown!.cues.length} cues)`
      : 'No recent rundown saved yet';
  }

  // Flash message banners
  const flash = state.flashMessage;
  const miniOverlay = document.getElementById('miniFlashOverlay');
  const stageOverlay = document.getElementById('stageFlashOverlay');

  if (miniOverlay) {
    if (flash.visible && flash.text) {
      miniOverlay.textContent = flash.text;
      miniOverlay.classList.remove('hidden');
    } else {
      miniOverlay.classList.add('hidden');
    }
  }

  if (stageOverlay) {
    if (flash.visible && flash.text && !flash.dismissedOnStage) {
      const stageText = document.getElementById('stageFlashMessageText');
      if (stageText) stageText.textContent = flash.text;
      stageOverlay.classList.remove('hidden');
      stageOverlay.classList.toggle('is-blinking', Boolean(flash.blinking));
    } else {
      stageOverlay.classList.add('hidden');
    }
  }

  // Sound mute label
  const muteLabel = document.getElementById('muteStatusLabel');
  if (muteLabel) {
    muteLabel.textContent = audioEngine.isMuted() ? 'Sound: MUTED' : 'Sound: ON';
  }

  renderRundownRows();
  renderLiveTick();
}

function setupRouteEventHandlers(): void {
  // Workspace mode switcher
  document.getElementById('navModeOperator')?.addEventListener('click', () => {
    navigateTo('operator');
    renderAppForRoute();
  });

  document.getElementById('navModeStage')?.addEventListener('click', () => {
    navigateTo('stage');
    renderAppForRoute();
  });

  document.getElementById('navModeOverlay')?.addEventListener('click', () => {
    navigateTo('overlay');
    renderAppForRoute();
  });

  document.getElementById('btnInlineStagePreview')?.addEventListener('click', () => {
    navigateTo('stage');
    renderAppForRoute();
  });

  document.getElementById('btnBackToController')?.addEventListener('click', () => {
    navigateTo('operator');
    renderAppForRoute();
  });

  document.getElementById('btnToggleFullscreen')?.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  const stageViewEl = document.getElementById('stageView');
  if (stageViewEl) {
    const resetIdleTimer = () => {
      stageViewEl.classList.remove('is-fullscreen-idle');
      if (idleMouseTimer) clearTimeout(idleMouseTimer);
      if (document.fullscreenElement) {
        idleMouseTimer = setTimeout(() => {
          stageViewEl.classList.add('is-fullscreen-idle');
        }, 3000);
      }
    };
    stageViewEl.addEventListener('mousemove', resetIdleTimer);
  }

  // Event Name & Event Start Time
  const eventNameInput = document.getElementById('eventNameInput') as HTMLInputElement | null;
  eventNameInput?.addEventListener('change', () => {
    state.eventName = eventNameInput.value.trim() || 'Main Stage Event';
    commitState();
  });

  const eventStartInput = document.getElementById('eventStartInput') as HTMLInputElement | null;
  if (eventStartInput) {
    const applyStartTime = (pushHistory: boolean) => {
      const val = eventStartInput.value.trim();
      if (/^\d{2}:\d{2}$/.test(val)) {
        state.eventStartTime = val;
        commitState(pushHistory);
      }
    };
    eventStartInput.addEventListener('input', () => applyStartTime(false));
    eventStartInput.addEventListener('change', () => {
      applyStartTime(true);
      showToast(`Event start time updated to ${state.eventStartTime}.`);
    });
  }

  // Sound mute toggle
  document.getElementById('btnToggleSoundMute')?.addEventListener('click', () => {
    const isMuted = audioEngine.toggleMute();
    showToast(isMuted ? 'Sound muted.' : 'Sound unmuted.');
    renderFullUI();
  });

  // Undo / Redo
  document.getElementById('btnUndo')?.addEventListener('click', () => {
    const prev = historyManager.undo();
    if (prev) {
      state = JSON.parse(JSON.stringify(prev));
      commitState(false);
      showToast('Undo applied.');
    }
  });

  document.getElementById('btnRedo')?.addEventListener('click', () => {
    const next = historyManager.redo();
    if (next) {
      state = JSON.parse(JSON.stringify(next));
      commitState(false);
      showToast('Redo applied.');
    }
  });

  // Master Transport
  document.getElementById('btnStartPause')?.addEventListener('click', toggleStartPause);
  document.getElementById('btnNextCue')?.addEventListener('click', requestNextCue);
  document.getElementById('btnPrevCue')?.addEventListener('click', requestPrevCue);
  document.getElementById('btnResetCue')?.addEventListener('click', resetCurrentCue);
  document.getElementById('btnEndEvent')?.addEventListener('click', endEventPlayback);

  // Time click-to-edit
  const timerBtn = document.getElementById('btnTimerClickEdit');
  const inlineForm = document.getElementById('inlineTimerForm');
  const inlineInput = document.getElementById('inlineTimerInput') as HTMLInputElement | null;

  timerBtn?.addEventListener('click', () => {
    const cue = getActiveCue();
    if (!cue || !inlineForm || !inlineInput) return;
    const remSec = Math.max(0, Math.round(getActiveRemainingMs(Date.now()) / 1000));
    inlineInput.value = formatMMSS(remSec);
    timerBtn.classList.add('hidden');
    inlineForm.classList.remove('hidden');
    inlineInput.focus();
    inlineInput.select();
  });

  document.getElementById('btnCancelInlineTimer')?.addEventListener('click', () => {
    inlineForm?.classList.add('hidden');
    timerBtn?.classList.remove('hidden');
  });

  inlineForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const cue = getActiveCue();
    if (!cue || !inlineInput) return;
    const newRemSec = parseDurationSeconds(inlineInput.value, 0);
    const elapsedSec = Math.floor(getActiveElapsedMs(Date.now()) / 1000);
    cue.adjustedDurationSec = Math.max(0, elapsedSec + newRemSec);
    inlineForm.classList.add('hidden');
    timerBtn?.classList.remove('hidden');
    commitState(true, false);
    showToast(`Active remaining set to ${formatMMSS(newRemSec)}.`);
  });

  // Preset duration chips & custom adjust step
  document.querySelectorAll('.chip-btn[data-step]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const step = parseInt((chip as HTMLElement).dataset.step || '60', 10);
      if (step > 0) {
        state.adjustStepSec = step;
        commitState(false, false);
      }
    });
  });

  const minInput = document.getElementById('adjustMinInput') as HTMLInputElement | null;
  const secInput = document.getElementById('adjustSecInput') as HTMLInputElement | null;
  const syncCustomStep = () => {
    const mins = Math.max(0, parseInt(minInput?.value || '0', 10) || 0);
    const secs = Math.max(0, Math.min(59, parseInt(secInput?.value || '0', 10) || 0));
    state.adjustStepSec = Math.max(1, mins * 60 + secs);
    commitState(false, false);
  };
  minInput?.addEventListener('change', syncCustomStep);
  secInput?.addEventListener('change', syncCustomStep);

  document.getElementById('btnAdjustMinus')?.addEventListener('click', () => {
    adjustActiveCueDuration(-state.adjustStepSec);
  });

  document.getElementById('btnAdjustPlus')?.addEventListener('click', () => {
    adjustActiveCueDuration(state.adjustStepSec);
  });

  // Search filter
  const searchInput = document.getElementById('rundownSearchInput') as HTMLInputElement | null;
  if (searchInput) {
    searchInput.value = searchFilterQuery;
    searchInput.addEventListener('input', () => {
      searchFilterQuery = searchInput.value;
      renderRundownRows();
    });
  }

  // Rundown table actions & inline edit
  const tbody = document.getElementById('rundownTableBody');
  tbody?.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement | HTMLSelectElement;
    const idx = parseInt(target.dataset.index || '', 10);
    const field = target.dataset.field;
    if (isNaN(idx) || !field || !state.cues[idx]) return;

    const cue = state.cues[idx];
    if (field === 'title') cue.title = target.value.trim() || 'Untitled Cue';
    else if (field === 'speaker') cue.speaker = target.value.trim();
    else if (field === 'planned') {
      const nextSec = parseDurationSeconds(target.value, cue.plannedDurationSec);
      const delta = nextSec - cue.plannedDurationSec;
      cue.plannedDurationSec = nextSec;
      cue.adjustedDurationSec = Math.max(0, cue.adjustedDurationSec + delta);
    } else if (field === 'type') cue.type = target.value as Cue['type'];
    else if (field === 'mode') cue.mode = target.value as Cue['mode'];
    else if (field === 'yellow') cue.yellowThresholdSec = parseDurationSeconds(target.value, cue.yellowThresholdSec);
    else if (field === 'red') cue.redThresholdSec = parseDurationSeconds(target.value, cue.redThresholdSec);
    else if (field === 'notes') cue.notes = target.value;

    commitState();
  });

  tbody?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('button[data-row-action]') as HTMLElement | null;
    if (!btn) return;
    const action = btn.dataset.rowAction;
    const idx = parseInt(btn.dataset.index || '', 10);
    if (isNaN(idx) || !state.cues[idx]) return;

    if (action === 'play') {
      activateCueAtIndex(idx, true);
    } else if (action === 'up' && idx > 0) {
      const moved = state.cues.splice(idx, 1)[0];
      state.cues.splice(idx - 1, 0, moved);
      if (state.activeCueIndex === idx) state.activeCueIndex = idx - 1;
      else if (state.activeCueIndex === idx - 1) state.activeCueIndex = idx;
      commitState();
    } else if (action === 'duplicate') {
      const source = state.cues[idx];
      state.cues.splice(idx + 1, 0, { ...source, id: createId('cue'), title: source.title + ' (Copy)' });
      commitState();
      showToast('Cue duplicated.');
    } else if (action === 'delete') {
      state.cues.splice(idx, 1);
      if (state.activeCueIndex >= state.cues.length) {
        state.activeCueIndex = Math.max(0, state.cues.length - 1);
      }
      commitState();
    }
  });

  // Overtime Recovery modal buttons
  document.getElementById('btnOpenOvertimeModal')?.addEventListener('click', () => openOvertimeModal());
  document.getElementById('btnModeRipple')?.addEventListener('click', () => executeRecovery('ripple'));
  document.getElementById('btnModeTrimNext')?.addEventListener('click', () => executeRecovery('trim_next'));
  document.getElementById('btnModeBufferProportional')?.addEventListener('click', () => executeRecovery('proportional'));
  document.getElementById('btnSkipRecoveryAdvance')?.addEventListener('click', () => {
    closeOvertimeModal();
    if (state.activeCueIndex < state.cues.length - 1) {
      activateCueAtIndex(state.activeCueIndex + 1);
    }
  });

  // Save & Saved Rundowns Modals
  document.getElementById('btnSaveRundownModal')?.addEventListener('click', openSaveRundownModal);
  document.getElementById('btnOpenSavedModal')?.addEventListener('click', () => {
    openSavedRundownsModal().catch(() => {});
  });
  document.getElementById('btnTriggerSaveFromLibrary')?.addEventListener('click', () => {
    document.getElementById('savedRundownsModal')?.classList.add('hidden');
    openSaveRundownModal();
  });

  document.getElementById('saveRundownForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('saveRundownNameInput') as HTMLInputElement | null;
    const name = (input?.value || '').trim();
    if (!name) return;

    state.eventName = name;
    const snapshot = buildRundownSnapshot(name, 'manual');
    cachedLastRundown = snapshot;
    await saveNamedRundown(snapshot);
    await saveLastUsedRundown(snapshot);
    document.getElementById('saveRundownModal')?.classList.add('hidden');
    commitState(false, false);
    showToast(`Saved "${name}" to Saved Rundowns.`);
  });

  const loadLastHandler = async () => {
    const last = (await loadLastUsedRundown()) || cachedLastRundown;
    if (!last || !last.cues.length) {
      showToast('No previous rundown available to load.');
      return;
    }
    document.getElementById('savedRundownsModal')?.classList.add('hidden');
    applyLoadedRundown(last, 'Loaded last rundown');
  };

  document.getElementById('btnLoadLastRundown')?.addEventListener('click', () => {
    loadLastHandler().catch(() => {});
  });
  document.getElementById('btnEmptyLoadLast')?.addEventListener('click', () => {
    loadLastHandler().catch(() => {});
  });
  document.getElementById('btnModalLoadLastRundown')?.addEventListener('click', () => {
    loadLastHandler().catch(() => {});
  });

  document.getElementById('savedRundownsList')?.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest('button[data-saved-action]') as HTMLElement | null;
    if (!btn) return;
    const action = btn.dataset.savedAction;
    const id = btn.dataset.rundownId;
    if (!id) return;

    if (action === 'load') {
      const items = await listNamedRundowns();
      const target = items.find((r) => r.id === id);
      if (target) {
        document.getElementById('savedRundownsModal')?.classList.add('hidden');
        applyLoadedRundown(target, 'Loaded');
      }
    } else if (action === 'delete') {
      await deleteNamedRundown(id);
      await renderSavedRundownsModalContent();
      showToast('Removed saved rundown.');
    }
  });

  // Keyboard Shortcuts modal button
  document.getElementById('btnOpenShortcutsModal')?.addEventListener('click', () => {
    document.getElementById('shortcutsModal')?.classList.remove('hidden');
  });

  // Modal dismiss buttons
  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.closeModal;
      if (id) document.getElementById(id)?.classList.add('hidden');
    });
  });

  document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.add('hidden');
      }
    });
  });

  // Spreadsheet import, template download, and export
  const fileInput = document.getElementById('spreadsheetFileInput') as HTMLInputElement | null;
  document.getElementById('btnImportExcel')?.addEventListener('click', () => fileInput?.click());
  document.getElementById('btnEmptyImport')?.addEventListener('click', () => fileInput?.click());

  const handleDownloadTemplate = () => {
    downloadRundownTemplate('CueTimer_Rundown_Template.xlsx');
    showToast('Downloaded CueTimer_Rundown_Template.xlsx');
  };
  document.getElementById('btnDownloadTemplate')?.addEventListener('click', handleDownloadTemplate);
  document.getElementById('btnEmptyTemplate')?.addEventListener('click', handleDownloadTemplate);

  fileInput?.addEventListener('change', (e) => {
    const inputEl = e.target as HTMLInputElement;
    const files = inputEl.files;
    if (!files || !files[0]) return;
    const file = files[0];
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result as ArrayBuffer;
        const parsed = parseSpreadsheetWithMeta(buffer);
        if (!parsed.cues.length) {
          showToast('No valid cue rows found.');
          return;
        }
        const fileBaseName = file.name.replace(/\.[^/.]+$/, '');
        state.cues = parsed.cues;
        state.eventName = parsed.eventTitle || fileBaseName || state.eventName;
        if (parsed.eventStartTime) {
          state.eventStartTime = parsed.eventStartTime;
        }
        state.activeCueIndex = 0;
        state.isRunning = false;
        state.startedAtEpoch = null;
        state.accumulatedElapsedMs = 0;
        state.eventFirstStartedEpoch = null;
        state.eventEndedEpoch = null;
        state.scheduleOffsetSec = 0;
        lastChimePlayedForCue = null;

        const importedSnap = buildRundownSnapshot(state.eventName, 'import');
        cachedLastRundown = importedSnap;
        saveLastUsedRundown(importedSnap).catch(() => {});

        commitState(true, false);
        const startMsg = parsed.eventStartTime ? ` · Start set to ${parsed.eventStartTime}` : '';
        showToast(`Imported ${parsed.cues.length} cues from ${file.name}${startMsg}`);
      } catch (err: any) {
        showToast('Import error: ' + err.message);
      } finally {
        inputEl.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  });

  document.getElementById('btnExportRundown')?.addEventListener('click', () => {
    const metrics = computeMetrics();
    const safeBase = (state.eventName || 'CueTimer_Rundown').replace(/[^a-zA-Z0-9_-]+/g, '_');
    exportRundownToExcel(state.cues, metrics, `${safeBase}.xlsx`);
    showToast(`Exported ${safeBase}.xlsx`);
  });

  // Add, Restore Sample, Clear
  function addCue() {
    state.cues.push({
      id: createId('cue'),
      title: `Session ${state.cues.length + 1}`,
      speaker: 'Speaker',
      plannedDurationSec: 600,
      adjustedDurationSec: 600,
      type: 'Main',
      mode: 'manual',
      yellowThresholdSec: 120,
      redThresholdSec: 30,
      notes: '',
      status: 'pending'
    });
    commitState();
  }
  document.getElementById('btnAddCue')?.addEventListener('click', addCue);
  document.getElementById('btnEmptyAdd')?.addEventListener('click', addCue);

  function loadSample() {
    state.eventName = 'Main Stage Event';
    state.eventStartTime = '09:00';
    state.cues = buildDefaultCues();
    state.activeCueIndex = 0;
    state.isRunning = false;
    state.startedAtEpoch = null;
    state.accumulatedElapsedMs = 0;
    state.eventFirstStartedEpoch = null;
    state.eventEndedEpoch = null;
    state.scheduleOffsetSec = 0;
    lastChimePlayedForCue = null;
    commitState();
    showToast('Loaded 5-cue sample rundown.');
  }
  document.getElementById('btnRestoreSample')?.addEventListener('click', loadSample);
  document.getElementById('btnEmptySample')?.addEventListener('click', loadSample);

  document.getElementById('btnClearRundown')?.addEventListener('click', () => {
    state.cues = [];
    state.activeCueIndex = 0;
    state.isRunning = false;
    state.startedAtEpoch = null;
    state.accumulatedElapsedMs = 0;
    commitState(true, false);
    showToast('Rundown cleared. Use "Load Last" to restore your previous rundown.');
  });

  // Speaker flash messages
  const speakerInput = document.getElementById('speakerMessageInput') as HTMLInputElement | null;
  const blinkBox = document.getElementById('flashBlinkToggle') as HTMLInputElement | null;

  function broadcastFlash(textOverride?: string) {
    const text = (textOverride !== undefined ? textOverride : speakerInput?.value || '').trim();
    if (!text) {
      showToast('Enter a message first.');
      return;
    }
    if (speakerInput) speakerInput.value = text;
    state.flashMessage = {
      text,
      blinking: Boolean(blinkBox?.checked),
      visible: true,
      dismissedOnStage: false
    };
    commitState(true, false);
  }

  document.getElementById('btnSendStageMessage')?.addEventListener('click', () => broadcastFlash());
  document.getElementById('btnClearStageMessage')?.addEventListener('click', () => {
    if (speakerInput) speakerInput.value = '';
    state.flashMessage = { text: '', blinking: false, visible: false, dismissedOnStage: false };
    commitState(true, false);
  });

  document.querySelectorAll('.preset-msg-btn[data-preset-msg]').forEach((btn) => {
    btn.addEventListener('click', () => {
      broadcastFlash((btn as HTMLElement).dataset.presetMsg);
    });
  });

  document.getElementById('btnDismissStageFlash')?.addEventListener('click', () => {
    state.flashMessage.dismissedOnStage = true;
    commitState(false, false);
  });
}

// Single Global Keyboard Shortcut Listener
function handleGlobalKeyDown(e: KeyboardEvent): void {
  const target = e.target as HTMLElement | null;
  const action = resolveShortcutAction({
    key: e.key,
    code: e.code,
    ctrlKey: e.ctrlKey,
    metaKey: e.metaKey,
    altKey: e.altKey,
    shiftKey: e.shiftKey,
    repeat: e.repeat,
    targetTagName: target?.tagName || '',
    isContentEditable: Boolean(target?.isContentEditable)
  });

  if (!action) return;

  switch (action) {
    case 'CLOSE_MODAL': {
      closeAllModals();
      document.getElementById('inlineTimerForm')?.classList.add('hidden');
      document.getElementById('btnTimerClickEdit')?.classList.remove('hidden');
      break;
    }
    case 'UNDO': {
      e.preventDefault();
      document.getElementById('btnUndo')?.click();
      break;
    }
    case 'REDO': {
      e.preventDefault();
      document.getElementById('btnRedo')?.click();
      break;
    }
    case 'TOGGLE_PLAY_PAUSE': {
      e.preventDefault();
      toggleStartPause();
      break;
    }
    case 'NEXT_CUE': {
      e.preventDefault();
      requestNextCue();
      break;
    }
    case 'PREV_CUE': {
      e.preventDefault();
      requestPrevCue();
      break;
    }
    case 'RESET_CUE': {
      e.preventDefault();
      resetCurrentCue();
      break;
    }
    case 'END_EVENT': {
      e.preventDefault();
      endEventPlayback();
      break;
    }
    case 'ADJUST_PLUS': {
      e.preventDefault();
      adjustActiveCueDuration(state.adjustStepSec);
      break;
    }
    case 'ADJUST_MINUS': {
      e.preventDefault();
      adjustActiveCueDuration(-state.adjustStepSec);
      break;
    }
    case 'TOGGLE_MUTE': {
      e.preventDefault();
      const isMuted = audioEngine.toggleMute();
      showToast(isMuted ? 'Sound muted.' : 'Sound unmuted.');
      renderFullUI();
      break;
    }
    case 'TOGGLE_FULLSCREEN': {
      if (currentRoute === 'stage') {
        e.preventDefault();
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      }
      break;
    }
    case 'TOGGLE_SHORTCUTS_HELP': {
      e.preventDefault();
      document.getElementById('shortcutsModal')?.classList.toggle('hidden');
      break;
    }
  }
}

document.addEventListener('keydown', handleGlobalKeyDown);

function renderAppForRoute(): void {
  currentRoute = getCurrentRoute();
  const app = document.getElementById('app');
  if (!app) return;

  if (currentRoute === 'stage') {
    app.innerHTML = renderStageViewHtml();
    document.title = 'CueTimer — Stage Display';
    requestScreenWakeLock().catch(() => {});
    syncEngine.announcePresence('stage');
  } else if (currentRoute === 'overlay') {
    app.innerHTML = renderOverlayViewHtml();
    document.title = 'CueTimer — Broadcast Overlay';
    syncEngine.announcePresence('overlay');
  } else {
    app.innerHTML = renderOperatorViewHtml() + renderModalsHtml();
    document.title = 'CueTimer — Live Event Timing & Stage Control';
    releaseScreenWakeLock().catch(() => {});
    syncEngine.announcePresence('operator');
  }

  setupRouteEventHandlers();
  updateUndoRedoButtons();
  renderFullUI();
}

// Initialization
window.addEventListener('hashchange', () => {
  renderAppForRoute();
});

syncEngine.onStateChange((incomingState) => {
  state = normalizeRestoredState(incomingState);
  renderFullUI();
});

renderAppForRoute();

// Hydrate from IndexedDB asynchronously if available and sync cache
Promise.all([loadEventFromDb('current_active_event'), loadLastUsedRundown()])
  .then(([dbState, dbLast]) => {
    if (dbLast) {
      cachedLastRundown = dbLast;
    }
    if (dbState && !loadActiveEventSync()) {
      state = normalizeRestoredState(dbState);
      renderFullUI();
    } else {
      const btnLoadLast = document.getElementById('btnLoadLastRundown') as HTMLButtonElement | null;
      if (btnLoadLast && cachedLastRundown?.cues.length) {
        btnLoadLast.disabled = false;
      }
    }
  })
  .catch(() => {});

// 100ms drift-free tick loop
setInterval(() => {
  evaluateAutoNext();
  renderLiveTick();
}, 100);

// 2000ms heartbeat
setInterval(() => {
  syncEngine.pingPeers();
  const badge = document.getElementById('syncStatusBadge');
  if (badge) {
    const count = syncEngine.getConnectedPeers().length;
    badge.textContent = `${count} stage ${count === 1 ? 'window' : 'windows'} connected`;
  }
}, 2000);
