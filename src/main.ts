import { AppState, Cue } from './core/types';
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
import { AudioEngine } from './audio/audioEngine';
import { requestScreenWakeLock, releaseScreenWakeLock } from './core/wakeLock';
import { HistoryManager } from './storage/historyManager';
import { saveEventToDb } from './storage/indexedDb';
import { parseSpreadsheet, exportRundownToExcel, createId } from './storage/spreadsheetParser';
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

// App Singleton Services
const syncEngine = new SyncEngine('cuetimer_sync_production_v1');
const audioEngine = new AudioEngine();
const initialState = createInitialState();
const historyManager = new HistoryManager<AppState>(initialState, 30);
let state: AppState = initialState;

let currentRoute: AppRoute = 'operator';
let pendingOvertimeAction: { overtimeSec: number; advanceAfter: boolean } | null = null;
let draggedRowIndex: number | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
let idleMouseTimer: ReturnType<typeof setTimeout> | null = null;
let lastChimePlayedForCue: string | null = null;

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

function commitState(pushToHistory = true): void {
  if (pushToHistory) {
    historyManager.push(JSON.parse(JSON.stringify(state)));
  }
  syncEngine.publishState(state);
  saveEventToDb('current_active_event', state).catch(() => {});
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
  commitState();
}

function pausePlayback(): void {
  if (!state.isRunning) return;
  const now = Date.now();
  state.accumulatedElapsedMs = getActiveElapsedMs(now);
  state.startedAtEpoch = null;
  state.isRunning = false;
  commitState();
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
  commitState();
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
    commitState();
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
  commitState();
  showToast('Cue reset to planned duration.');
}

function endEventPlayback(): void {
  const now = Date.now();
  state.isRunning = false;
  state.startedAtEpoch = null;
  if (state.eventFirstStartedEpoch && !state.eventEndedEpoch) {
    state.eventEndedEpoch = now;
  }
  commitState();
  showToast('Event playback ended.');
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
      commitState();
    } else {
      cue.status = 'completed';
      state.isRunning = false;
      state.startedAtEpoch = null;
      state.accumulatedElapsedMs = cue.adjustedDurationSec * 1000;
      if (state.eventFirstStartedEpoch && !state.eventEndedEpoch) {
        state.eventEndedEpoch = now;
      }
      commitState();
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

// Rendering
function escapeHtmlAttr(value: unknown): string {
  return String(value || '')
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
    return;
  }

  emptyBox.classList.add('hidden');
  tableWrap.classList.remove('hidden');

  const metrics = computeMetrics();
  const frag = document.createDocumentFragment();

  state.cues.forEach((cue, idx) => {
    const tr = document.createElement('tr');
    tr.className = 'cue-row';
    if (idx === state.activeCueIndex) tr.classList.add('is-active');
    else if (cue.status === 'completed') tr.classList.add('is-completed');
    tr.draggable = true;
    tr.dataset.index = String(idx);

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

    const sched = metrics.cueSchedules[idx];
    const rangeLabel = sched ? formatClockHHMM(sched.startEpoch) + ' - ' + formatClockHHMM(sched.endEpoch) : '--:--';
    const diffSec = cue.adjustedDurationSec - cue.plannedDurationSec;
    const diffTag =
      diffSec !== 0
        ? ` <span class="tag ${diffSec > 0 ? 'tag-amber' : 'tag-neutral-bright'} mono" style="padding:1px 4px;font-size:10px;">${diffSec > 0 ? '+' : ''}${formatMMSS(diffSec)}</span>`
        : '';

    tr.innerHTML = `
      <td>
        <div style="display:flex;align-items:center;gap:4px;">
          <span class="drag-grip" title="Drag to reorder">&#x22EE;&#x22EE;</span>
          <span class="mono" style="font-weight:500;min-width:18px;">${idx + 1}</span>
        </div>
      </td>
      <td>
        <input type="text" class="inline-cell-input" data-field="title" data-index="${idx}" value="${escapeHtmlAttr(cue.title)}" aria-label="Cue Title" />
      </td>
      <td>
        <input type="text" class="inline-cell-input" data-field="speaker" data-index="${idx}" value="${escapeHtmlAttr(cue.speaker)}" aria-label="Speaker" />
      </td>
      <td>
        <input type="text" class="inline-cell-input inline-mono" data-field="planned" data-index="${idx}" value="${formatMMSS(cue.plannedDurationSec)}" aria-label="Planned Duration" />
      </td>
      <td class="mono" style="white-space:nowrap;font-size:12px;">
        <span>${formatMMSS(cue.adjustedDurationSec)}</span>${diffTag}
      </td>
      <td class="mono" style="white-space:nowrap;font-size:12px;color:var(--text-muted);">
        ${rangeLabel}
      </td>
      <td>
        <select class="select select-sm" data-field="type" data-index="${idx}">
          <option value="Main" ${cue.type === 'Main' ? 'selected' : ''}>Main</option>
          <option value="Buffer/Break" ${cue.type === 'Buffer/Break' ? 'selected' : ''}>Buffer/Break</option>
        </select>
      </td>
      <td>
        <select class="select select-sm" data-field="mode" data-index="${idx}">
          <option value="manual" ${cue.mode === 'manual' ? 'selected' : ''}>Manual</option>
          <option value="auto" ${cue.mode === 'auto' ? 'selected' : ''}>Auto-next</option>
        </select>
      </td>
      <td>
        <div style="display:flex;align-items:center;gap:4px;">
          <input type="text" class="inline-cell-input inline-mono" style="width:54px;color:var(--alert-amber);" data-field="yellow" data-index="${idx}" value="${formatMMSS(cue.yellowThresholdSec)}" title="Yellow warning" />
          <input type="text" class="inline-cell-input inline-mono" style="width:54px;color:var(--alert-red);" data-field="red" data-index="${idx}" value="${formatMMSS(cue.redThresholdSec)}" title="Red warning" />
        </div>
      </td>
      <td>
        <input type="text" class="inline-cell-input" data-field="notes" data-index="${idx}" value="${escapeHtmlAttr(cue.notes)}" placeholder="Notes" />
      </td>
      <td style="text-align:right;white-space:nowrap;">
        <button type="button" class="btn btn-icon btn-ghost" data-row-action="play" data-index="${idx}" title="Play Now">&#x25B6;</button>
        <button type="button" class="btn btn-icon btn-ghost" data-row-action="duplicate" data-index="${idx}" title="Duplicate">&#x2398;</button>
        <button type="button" class="btn btn-icon btn-ghost" data-row-action="delete" data-index="${idx}" title="Delete" style="color:#FCA5A5;">&times;</button>
      </td>
    `;

    frag.appendChild(tr);
  });

  tbody.innerHTML = '';
  tbody.appendChild(frag);
}

function renderLiveTick(): void {
  const now = Date.now();
  const cue = getActiveCue();
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

  const textClass = alertLevel === 'overtime' || alertLevel === 'critical' ? 'text-critical' : alertLevel === 'warning' ? 'text-warning' : 'text-normal';
  const fillClass = alertLevel === 'overtime' || alertLevel === 'critical' ? 'fill-critical' : alertLevel === 'warning' ? 'fill-warning' : 'fill-normal';

  const progressPct =
    cue && cue.adjustedDurationSec > 0
      ? Math.max(0, Math.min(100, (remMs / (cue.adjustedDurationSec * 1000)) * 100))
      : 0;

  const clockStr = formatClockHHMMSS(now);
  const elapsedStr = formatHHMMSS(Math.floor(getTotalEventElapsedMs(now) / 1000));
  const metrics = computeMetrics(now);

  let varianceLabel = 'On Time';
  let varianceClass = 'tag-neutral-bright';
  if (metrics.varianceSec >= 2) {
    varianceLabel = 'Behind +' + formatMMSS(metrics.varianceSec);
    varianceClass = 'tag-red';
  } else if (metrics.varianceSec <= -2) {
    varianceLabel = 'Ahead -' + formatMMSS(Math.abs(metrics.varianceSec));
    varianceClass = 'tag-neutral-bright';
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
    varBadge.className = 'tag ' + varianceClass + ' mono';
  }

  if (otBar) {
    const otDelta = getDetectableOvertimeSec();
    if (otDelta > 0 && state.cues.length > 0) {
      otBar.classList.remove('hidden');
      const textEl = document.getElementById('overtimeBarText');
      if (textEl) {
        textEl.textContent = remSec < 0 ? 'Active cue is in overtime by +' + formatMMSS(otDelta) : 'Schedule is behind by +' + formatMMSS(otDelta);
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
    const miniClock = document.getElementById('miniClockText');
    const miniElapsed = document.getElementById('miniElapsedText');
    const miniCueTitle = document.getElementById('miniCueTitle');
    const miniCueSpeaker = document.getElementById('miniCueSpeaker');
    const miniHero = document.getElementById('miniHeroTimer');
    const miniFill = document.getElementById('miniProgressFill');

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
  }

  // Stage View (#/stage)
  const stageShell = document.getElementById('stageView');
  if (stageShell) {
    stageShell.classList.toggle('is-overtime', alertLevel === 'overtime');
    const stageClock = document.getElementById('stageLocalClock');
    const stageElapsed = document.getElementById('stageElapsedStopwatch');
    const stageTitle = document.getElementById('stageCueTitle');
    const stageSpeaker = document.getElementById('stageCueSpeaker');
    const stageCountdown = document.getElementById('stageHeroCountdown');
    const stageFill = document.getElementById('stageProgressFill');

    if (stageClock) stageClock.textContent = clockStr;
    if (stageElapsed) stageElapsed.textContent = elapsedStr;
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
  }

  // OBS Overlay View (#/overlay)
  const overlayTimer = document.getElementById('overlayTimer');
  const overlayBox = document.getElementById('overlayBox');
  const overlayCueTitle = document.getElementById('overlayCueTitle');
  const overlayCueSpeaker = document.getElementById('overlayCueSpeaker');
  const overlayBadge = document.getElementById('overlayStatusBadge');

  if (overlayTimer) {
    overlayTimer.textContent = formattedCountdown;
    overlayTimer.className = 'mono ' + textClass;
  }
  if (overlayBox) {
    overlayBox.classList.toggle('is-overtime', alertLevel === 'overtime');
  }
  if (overlayCueTitle && cue) overlayCueTitle.textContent = cue.title;
  if (overlayCueSpeaker && cue) overlayCueSpeaker.textContent = cue.speaker;
  if (overlayBadge) {
    overlayBadge.textContent = alertLevel === 'overtime' ? 'OVERTIME' : state.isRunning ? 'LIVE' : 'PAUSED';
    overlayBadge.className = 'tag ' + (alertLevel === 'overtime' ? 'tag-red' : 'tag-neutral-bright') + ' mono';
  }
}

function renderFullUI(): void {
  const startInput = document.getElementById('eventStartInput') as HTMLInputElement | null;
  if (startInput && document.activeElement !== startInput) {
    startInput.value = state.eventStartTime || '09:00';
  }

  const metaText = document.getElementById('rundownMetaText');
  if (metaText) {
    const totalSec = state.cues.reduce((sum, c) => sum + c.adjustedDurationSec, 0);
    metaText.textContent = `${state.cues.length} cues | Total ${formatHHMMSS(totalSec)}`;
  }

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

function setupEventHandlers(): void {
  // App routing button clicks
  document.getElementById('btnLaunchStage')?.addEventListener('click', () => {
    window.open(window.location.origin + window.location.pathname + '#/stage', 'CueTimerStage', 'width=1280,height=720');
  });

  document.getElementById('btnOpenOverlay')?.addEventListener('click', () => {
    window.open(window.location.origin + window.location.pathname + '#/overlay', 'CueTimerOverlay', 'width=800,height=240');
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
    document.addEventListener('fullscreenchange', resetIdleTimer);
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
    commitState();
    showToast(`Active remaining set to ${formatMMSS(newRemSec)}.`);
  });

  // Plus / Minus adjustments
  document.getElementById('btnAdjustMinus')?.addEventListener('click', () => {
    const cue = getActiveCue();
    if (!cue) return;
    cue.adjustedDurationSec = Math.max(0, cue.adjustedDurationSec - state.adjustStepSec);
    commitState();
  });

  document.getElementById('btnAdjustPlus')?.addEventListener('click', () => {
    const cue = getActiveCue();
    if (!cue) return;
    cue.adjustedDurationSec += state.adjustStepSec;
    commitState();
  });

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
    } else if (field === 'type') cue.type = target.value as any;
    else if (field === 'mode') cue.mode = target.value as any;
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

  // Modal dismiss buttons
  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.closeModal;
      if (id) document.getElementById(id)?.classList.add('hidden');
    });
  });

  // Spreadsheet import & export
  const fileInput = document.getElementById('spreadsheetFileInput') as HTMLInputElement | null;
  document.getElementById('btnImportExcel')?.addEventListener('click', () => fileInput?.click());
  document.getElementById('btnEmptyImport')?.addEventListener('click', () => fileInput?.click());

  fileInput?.addEventListener('change', (e) => {
    const files = (e.target as HTMLInputElement).files;
    if (!files || !files[0]) return;
    const file = files[0];
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result as ArrayBuffer;
        const cues = parseSpreadsheet(buffer);
        if (!cues.length) {
          showToast('No valid cue rows found.');
          return;
        }
        state.cues = cues;
        state.activeCueIndex = 0;
        state.isRunning = false;
        state.startedAtEpoch = null;
        state.accumulatedElapsedMs = 0;
        commitState();
        showToast(`Imported ${cues.length} cues from ${file.name}.`);
      } catch (err: any) {
        showToast('Import error: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  });

  document.getElementById('btnExportRundown')?.addEventListener('click', () => {
    const metrics = computeMetrics();
    exportRundownToExcel(state.cues, metrics, 'CueTimer_Rundown.xlsx');
    showToast('Exported CueTimer_Rundown.xlsx');
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
    state.cues = buildDefaultCues();
    state.activeCueIndex = 0;
    state.isRunning = false;
    state.startedAtEpoch = null;
    state.accumulatedElapsedMs = 0;
    commitState();
    showToast('Loaded 5-cue sample rundown.');
  }
  document.getElementById('btnRestoreSample')?.addEventListener('click', loadSample);
  document.getElementById('btnEmptySample')?.addEventListener('click', loadSample);

  document.getElementById('btnClearRundown')?.addEventListener('click', () => {
    state.cues = [];
    state.isRunning = false;
    state.startedAtEpoch = null;
    state.accumulatedElapsedMs = 0;
    commitState();
    showToast('Rundown cleared.');
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
    commitState();
  }

  document.getElementById('btnSendStageMessage')?.addEventListener('click', () => broadcastFlash());
  document.getElementById('btnClearStageMessage')?.addEventListener('click', () => {
    if (speakerInput) speakerInput.value = '';
    state.flashMessage = { text: '', blinking: false, visible: false, dismissedOnStage: false };
    commitState();
  });

  document.querySelectorAll('.preset-msg-btn[data-preset-msg]').forEach((btn) => {
    btn.addEventListener('click', () => {
      broadcastFlash((btn as HTMLElement).dataset.presetMsg);
    });
  });

  document.getElementById('btnDismissStageFlash')?.addEventListener('click', () => {
    state.flashMessage.dismissedOnStage = true;
    commitState();
  });

  // Global Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeOvertimeModal();
      inlineForm?.classList.add('hidden');
      timerBtn?.classList.remove('hidden');
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      document.getElementById('btnUndo')?.click();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      document.getElementById('btnRedo')?.click();
      return;
    }

    const targetTag = (document.activeElement?.tagName || '').toUpperCase();
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(targetTag)) return;

    if (e.code === 'Space') {
      e.preventDefault();
      toggleStartPause();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      requestNextCue();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      requestPrevCue();
    }
  });
}

function renderAppForRoute(): void {
  currentRoute = getCurrentRoute();
  const app = document.getElementById('app');
  if (!app) return;

  if (currentRoute === 'stage') {
    app.innerHTML = renderStageViewHtml();
    document.title = 'CueTimer Stage Display';
    requestScreenWakeLock().catch(() => {});
    syncEngine.announcePresence('stage');
  } else if (currentRoute === 'overlay') {
    app.innerHTML = renderOverlayViewHtml();
    document.title = 'CueTimer Broadcast Overlay';
    syncEngine.announcePresence('overlay');
  } else {
    app.innerHTML = renderOperatorViewHtml() + renderModalsHtml();
    document.title = 'CueTimer: Real-Time Event Time Keeper & Cue Management';
    releaseScreenWakeLock().catch(() => {});
    syncEngine.announcePresence('operator');
  }

  setupEventHandlers();
  renderFullUI();
}

// Initialization
window.addEventListener('hashchange', () => {
  renderAppForRoute();
});

syncEngine.onStateChange((incomingState) => {
  state = incomingState;
  renderFullUI();
});

renderAppForRoute();

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
    badge.textContent = `Sync Active (${count} Connected)`;
  }
}, 2000);
