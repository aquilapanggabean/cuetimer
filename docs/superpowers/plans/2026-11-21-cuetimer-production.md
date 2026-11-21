# CueTimer Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the monolithic CueTimer HTML prototype into a modular, production-ready, broadcast-grade Progressive Web App (PWA) with zero-drift epoch timing, Web Audio sound synthesis, multi-event IndexedDB persistence, hybrid real-time multi-screen sync, and dedicated OBS/vMix overlay views.

**Architecture:** The application is architected around a decoupled TypeScript core engine: `TimeEngine` handles drift-free epoch countdowns; `ScheduleEngine` and `RecoveryEngine` manage schedule projections and 3-mode overtime mitigation; `AudioEngine` synthesizes alarms via Web Audio API; `StorageEngine` manages IndexedDB persistence and undo/redo stacks; and `SyncEngine` handles zero-latency multi-window and cross-device communication via a hybrid BroadcastChannel/WebSocket adapter. Modular UI components render Operator Controller (`#/operator`), Fullscreen Stage Display (`#/stage`), and Transparent Lower-Third Overlay (`#/overlay`).

**Tech Stack:** TypeScript, Vite, Vitest, Web Audio API, IndexedDB, BroadcastChannel API, Service Worker (PWA), SheetJS (local bundle).

**Spec:** [production-readiness-plan.md](file:///C:/Users/altai/.gemini/antigravity/brain/ed570d98-860e-4b44-9215-3a3ae284cc44/production-readiness-plan.md)

## Global Constraints

- **Offline-First**: Must run 100% offline without external CDN calls (all fonts and libraries bundled locally).
- **Drift-Free Timekeeping**: Absolute epoch UTC arithmetic (`Date.now()`) with no cumulative interval drift; resilient to OS tab sleep/wake.
- **Broadcast Safety (WCAG AA)**: Minimum 4.8:1 contrast ratio, high-visibility tabular numerals (`DM Mono`), and zero jarring layout shifts.
- **Zero-Latency Multi-Window Sync**: Instantaneous cross-window reflection (<10ms) via `BroadcastChannel` with presence heartbeats.
- **Data Integrity**: State changes to the rundown must support Undo/Redo (`Ctrl+Z` / `Ctrl+Y`) and auto-persist to IndexedDB.

## Review Focus

1. **Negative Overtime Clock Display**: Active remaining time transitioning past 0 into overtime must cleanly render with `-MM:SS` format, red visual state, and border pulse without crashing.
2. **Tab Sleep / Background Suspension**: If a laptop lid is closed or the browser tab is backgrounded for 10 minutes, reviving the tab must recalculate exact remaining time and schedule variance without skipping ticks.
3. **Overtime Recovery with Empty Buffers**: When applying "Buffer-First Proportional Trim" where no Buffer cues exist or buffer is 0, the engine must gracefully fallback to proportional main cue deduction without division-by-zero errors.
4. **Offline Import & Malformed Spreadsheets**: Importing Excel or CSV with missing columns, invalid duration formats, or weird characters must fail safely with clear toast error banners without corrupting existing rundown state.
5. **Rapid Transport Clicking (Play/Pause/Skip Race Conditions)**: Spamming Spacebar or Next Cue buttons must not corrupt the accumulated elapsed time or generate orphaned active cues.

---

### Task 1: Project Scaffolding & Build Configuration

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Test: `tests/scaffold.test.ts`

**Interfaces:**
- Consumes: None (Root setup)
- Produces: Project build pipeline, Vitest test runner, and TypeScript compilation setup.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/scaffold.test.ts
import { describe, it, expect } from 'vitest';

describe('Project Scaffolding', () => {
  it('verifies test runner and environment is working', () => {
    const environment = 'production-ready';
    expect(environment).toBe('production-ready');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scaffold.test.ts`
Expected: FAIL (packages not yet installed or config missing).

- [ ] **Step 3: Implement project configuration files**

Create `package.json` with scripts (`dev`, `build`, `test`), `tsconfig.json` with strict mode, `vite.config.ts` with Vitest configured, and root `index.html`. Install dependencies (`typescript`, `vite`, `vitest`, `xlsx`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/scaffold.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json vite.config.ts index.html tests/scaffold.test.ts
git commit -m "chore: scaffold vite typescript and vitest testing environment"
```

---

### Task 2: Core Domain Models & Drift-Free `TimeEngine`

**Files:**
- Create: `src/core/types.ts`
- Create: `src/core/timeEngine.ts`
- Test: `tests/timeEngine.test.ts`

**Interfaces:**
- Consumes: None
- Produces:
  - `Cue`, `CueType`, `TriggerMode`, `CueStatus`, `AppState`, `ScheduleMetrics` types
  - `formatMMSS(seconds: number): string`
  - `formatHHMMSS(seconds: number): string`
  - `formatClockHHMM(epochMs: number): string`
  - `formatClockHHMMSS(epochMs: number): string`
  - `parseDurationSeconds(input: unknown, fallbackSec?: number): number`
  - `calculateElapsedMs(startedAtEpoch: number | null, accumulatedMs: number, nowMs: number, isRunning: boolean): number`
  - `calculateRemainingMs(durationSec: number, elapsedMs: number): number`

- [ ] **Step 1: Write failing tests for TimeEngine**

```typescript
// tests/timeEngine.test.ts
import { describe, it, expect } from 'vitest';
import {
  formatMMSS,
  formatHHMMSS,
  parseDurationSeconds,
  calculateElapsedMs,
  calculateRemainingMs
} from '../src/core/timeEngine';

describe('TimeEngine', () => {
  it('formats positive and negative seconds to MM:SS correctly', () => {
    expect(formatMMSS(300)).toBe('05:00');
    expect(formatMMSS(65)).toBe('01:05');
    expect(formatMMSS(-45)).toBe('-00:45');
    expect(formatMMSS(0)).toBe('00:00');
  });

  it('formats HH:MM:SS correctly', () => {
    expect(formatHHMMSS(3665)).toBe('01:01:05');
    expect(formatHHMMSS(59)).toBe('00:00:59');
  });

  it('parses diverse duration string formats cleanly', () => {
    expect(parseDurationSeconds('15:00')).toBe(900);
    expect(parseDurationSeconds('01:15:00')).toBe(4500);
    expect(parseDurationSeconds('10m')).toBe(600);
    expect(parseDurationSeconds('45s')).toBe(45);
    expect(parseDurationSeconds('1h 30m')).toBe(5400);
    expect(parseDurationSeconds(15)).toBe(900);
  });

  it('calculates drift-free elapsed and remaining times', () => {
    const start = 1000000;
    const now = 1015000; // 15 seconds later
    const elapsed = calculateElapsedMs(start, 5000, now, true);
    expect(elapsed).toBe(20000); // 5000 accumulated + 15000 current run
    expect(calculateRemainingMs(30, elapsed)).toBe(10000); // 30s - 20s = 10s remaining
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/timeEngine.test.ts`
Expected: FAIL with "Cannot find module '../src/core/timeEngine'"

- [ ] **Step 3: Implement `types.ts` and `timeEngine.ts`**

Define domain types in `src/core/types.ts` and implement pure time formatting and drift-free calculation functions in `src/core/timeEngine.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/timeEngine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts src/core/timeEngine.ts tests/timeEngine.test.ts
git commit -m "feat(core): implement domain types and drift-free time engine"
```

---

### Task 3: Schedule & Overtime Recovery Engine (`ScheduleEngine` & `RecoveryEngine`)

**Files:**
- Create: `src/core/scheduleEngine.ts`
- Create: `src/core/recoveryEngine.ts`
- Test: `tests/scheduleEngine.test.ts`
- Test: `tests/recoveryEngine.test.ts`

**Interfaces:**
- Consumes: `Cue`, `ScheduleMetrics` from `src/core/types.ts`, helper methods from `timeEngine.ts`
- Produces:
  - `computeSchedule(startTimeStr: string, cues: Cue[], activeCueIndex: number, activeElapsedSec: number, offsetSec: number): ScheduleMetrics`
  - `applyRippleShift(currentOffsetSec: number, overtimeSec: number): number`
  - `applyTrimNext(cues: Cue[], activeCueIndex: number, overtimeSec: number): { updatedCues: Cue[]; leftoverOffsetSec: number }`
  - `applyBufferProportionalTrim(cues: Cue[], activeCueIndex: number, overtimeSec: number): { updatedCues: Cue[]; leftoverOffsetSec: number }`

- [ ] **Step 1: Write failing tests for Schedule and Recovery engines**

```typescript
// tests/recoveryEngine.test.ts
import { describe, it, expect } from 'vitest';
import { applyRippleShift, applyTrimNext, applyBufferProportionalTrim } from '../src/core/recoveryEngine';
import { Cue } from '../src/core/types';

describe('RecoveryEngine', () => {
  const sampleCues: Cue[] = [
    { id: '1', title: 'A', speaker: '', plannedDurationSec: 600, adjustedDurationSec: 600, type: 'Main', mode: 'manual', yellowThresholdSec: 120, redThresholdSec: 30, notes: '', status: 'active' },
    { id: '2', title: 'Buffer', speaker: '', plannedDurationSec: 300, adjustedDurationSec: 300, type: 'Buffer/Break', mode: 'manual', yellowThresholdSec: 120, redThresholdSec: 30, notes: '', status: 'pending' },
    { id: '3', title: 'B', speaker: '', plannedDurationSec: 600, adjustedDurationSec: 600, type: 'Main', mode: 'manual', yellowThresholdSec: 120, redThresholdSec: 30, notes: '', status: 'pending' }
  ];

  it('applies ripple shift by incrementing schedule offset', () => {
    expect(applyRippleShift(0, 120)).toBe(120);
    expect(applyRippleShift(60, 30)).toBe(90);
  });

  it('trims immediate next cue and clamps at zero', () => {
    const res = applyTrimNext(sampleCues, 0, 100);
    expect(res.updatedCues[1].adjustedDurationSec).toBe(200);
    expect(res.leftoverOffsetSec).toBe(0);
  });

  it('absorbs overtime first from buffer cues then distributes proportionally', () => {
    const res = applyBufferProportionalTrim(sampleCues, 0, 400); // 300 from buffer, 100 from cue B
    expect(res.updatedCues[1].adjustedDurationSec).toBe(0); // Buffer fully consumed
    expect(res.updatedCues[2].adjustedDurationSec).toBe(500); // 600 - 100 = 500
    expect(res.leftoverOffsetSec).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/recoveryEngine.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `scheduleEngine.ts` and `recoveryEngine.ts`**

Write `computeSchedule` to calculate timeline projection, cumulative time, and schedule variance. Implement the three overtime mitigation algorithms in `recoveryEngine.ts` ensuring safety checks when buffer cues are 0.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/recoveryEngine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/scheduleEngine.ts src/core/recoveryEngine.ts tests/scheduleEngine.test.ts tests/recoveryEngine.test.ts
git commit -m "feat(core): implement schedule projection and 3-mode overtime recovery engine"
```

---

### Task 4: Web Audio Synthesizer & WakeLock Manager (`AudioEngine` & `ScreenWakeLock`)

**Files:**
- Create: `src/audio/audioEngine.ts`
- Create: `src/core/wakeLock.ts`
- Test: `tests/audioEngine.test.ts`

**Interfaces:**
- Consumes: None
- Produces:
  - `AudioEngine.playChime(type: 'warning' | 'critical' | 'overtime'): void`
  - `AudioEngine.setMuted(muted: boolean): void`
  - `AudioEngine.isMuted(): boolean`
  - `requestScreenWakeLock(): Promise<boolean>`
  - `releaseScreenWakeLock(): Promise<void>`

- [ ] **Step 1: Write failing test for AudioEngine**

```typescript
// tests/audioEngine.test.ts
import { describe, it, expect, vi } from 'vitest';
import { AudioEngine } from '../src/audio/audioEngine';

describe('AudioEngine', () => {
  it('manages mute state correctly', () => {
    const audio = new AudioEngine();
    expect(audio.isMuted()).toBe(false);
    audio.setMuted(true);
    expect(audio.isMuted()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/audioEngine.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement Web Audio synthesis and Screen WakeLock**

Implement `AudioEngine` creating standard sine/square oscillator frequencies (880Hz / 440Hz dual chimes) with smooth gain envelope, no external audio files required. Implement `ScreenWakeLock` wrapping `navigator.wakeLock` with visibility change auto-reacquisition.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/audioEngine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/audio/audioEngine.ts src/core/wakeLock.ts tests/audioEngine.test.ts
git commit -m "feat(audio): implement web audio chime synthesizer and screen wakelock"
```

---

### Task 5: Multi-Event Persistence, Undo/Redo & SheetJS Storage (`StorageEngine`)

**Files:**
- Create: `src/storage/indexedDb.ts`
- Create: `src/storage/historyManager.ts`
- Create: `src/storage/spreadsheetParser.ts`
- Test: `tests/spreadsheetParser.test.ts`
- Test: `tests/historyManager.test.ts`

**Interfaces:**
- Consumes: `AppState`, `Cue` from `src/core/types.ts`
- Produces:
  - `initDatabase(): Promise<IDBDatabase>`
  - `saveEvent(eventName: string, state: AppState): Promise<void>`
  - `loadEvent(eventName: string): Promise<AppState | null>`
  - `listEvents(): Promise<string[]>`
  - `HistoryManager<T>` with `push(state: T)`, `undo(): T | null`, `redo(): T | null`, `canUndo()`, `canRedo()`
  - `parseSpreadsheet(buffer: ArrayBuffer | string): Cue[]`
  - `exportToExcel(cues: Cue[], schedule: ScheduleMetrics, filename: string): void`

- [ ] **Step 1: Write failing tests for HistoryManager & SpreadsheetParser**

```typescript
// tests/historyManager.test.ts
import { describe, it, expect } from 'vitest';
import { HistoryManager } from '../src/storage/historyManager';

describe('HistoryManager', () => {
  it('supports undo and redo transitions', () => {
    const history = new HistoryManager<number>(1);
    history.push(2);
    history.push(3);
    expect(history.canUndo()).toBe(true);
    expect(history.undo()).toBe(2);
    expect(history.undo()).toBe(1);
    expect(history.canUndo()).toBe(false);
    expect(history.redo()).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/historyManager.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `indexedDb.ts`, `historyManager.ts`, and `spreadsheetParser.ts`**

Implement IndexedDB event store, generic immutable undo/redo history stack, and spreadsheet parsing leveraging local `xlsx` bundle with header normalization and flexible duration extraction.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/historyManager.test.ts tests/spreadsheetParser.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/storage/indexedDb.ts src/storage/historyManager.ts src/storage/spreadsheetParser.ts tests/historyManager.test.ts tests/spreadsheetParser.test.ts
git commit -m "feat(storage): implement indexeddb persistence, undo-redo history and spreadsheet engine"
```

---

### Task 6: Hybrid Multi-Window & Network Real-Time Sync (`SyncEngine`)

**Files:**
- Create: `src/sync/syncEngine.ts`
- Create: `src/sync/broadcastAdapter.ts`
- Create: `src/sync/remoteAdapter.ts`
- Test: `tests/syncEngine.test.ts`

**Interfaces:**
- Consumes: `AppState` from `src/core/types.ts`
- Produces:
  - `SyncEngine`:
    - `publishState(state: AppState): void`
    - `onStateChange(cb: (state: AppState) => void): () => void`
    - `pingPeers(): void`
    - `announcePresence(role: 'stage' | 'operator' | 'overlay'): void`
    - `getConnectedPeers(): { id: string; role: string; lastSeen: number }[]`

- [ ] **Step 1: Write failing test for SyncEngine**

```typescript
// tests/syncEngine.test.ts
import { describe, it, expect } from 'vitest';
import { SyncEngine } from '../src/sync/syncEngine';

describe('SyncEngine', () => {
  it('instantiates and manages subscribers', () => {
    const engine = new SyncEngine('test_channel');
    let updated = false;
    const unsub = engine.onStateChange(() => { updated = true; });
    expect(typeof unsub).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/syncEngine.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `syncEngine.ts`, `broadcastAdapter.ts`, and `remoteAdapter.ts`**

Build local `BroadcastChannel` with fallback `StorageEvent` for instant 0ms multi-window synchronization, peer heartbeat registry, and pluggable remote adapter interface.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/syncEngine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sync/syncEngine.ts src/sync/broadcastAdapter.ts src/sync/remoteAdapter.ts tests/syncEngine.test.ts
git commit -m "feat(sync): implement zero-latency multi-window and peer presence sync engine"
```

---

### Task 7: View Routing & Production UI Components (Operator, Stage, Overlay)

**Files:**
- Create: `src/ui/router.ts`
- Create: `src/ui/styles.css`
- Create: `src/ui/components/operatorView.ts`
- Create: `src/ui/components/stageView.ts`
- Create: `src/ui/components/overlayView.ts`
- Create: `src/ui/components/modals.ts`
- Create: `src/main.ts`
- Test: `tests/router.test.ts`

**Interfaces:**
- Consumes: All modules from Tasks 2-6
- Produces: Complete interactive web application matching broadcast UI specs with 3 route views:
  - `#/operator` (or root): Complete Operator control center.
  - `#/stage`: High-visibility stage & confidence monitor.
  - `#/overlay`: Broadcast chroma/transparent lower-third overlay for OBS/vMix.

- [ ] **Step 1: Write failing test for routing engine**

```typescript
// tests/router.test.ts
import { describe, it, expect } from 'vitest';
import { resolveRoute } from '../src/ui/router';

describe('Router', () => {
  it('resolves routes correctly based on hash and query parameters', () => {
    expect(resolveRoute('#/stage', '')).toBe('stage');
    expect(resolveRoute('', '?view=stage')).toBe('stage');
    expect(resolveRoute('#/overlay', '')).toBe('overlay');
    expect(resolveRoute('', '')).toBe('operator');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/router.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement views and assemble application in `main.ts`**

Implement hash router, broadcast dark-mode CSS theme, operator view (with drag/drop rundown, live inline editor, transport controls), stage view (with overtime pulse, idle mouse auto-hide, flash overlay), overlay view (transparent lower-third timer), modals for Google Sheets & Overtime Recovery, and initialize tick loop (100ms drift-free).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/router.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/ src/main.ts tests/router.test.ts
git commit -m "feat(ui): implement operator, stage, and transparent overlay views with router"
```

---

### Task 8: Local Asset Bundling, PWA Service Worker & Full Verification

**Files:**
- Create: `public/manifest.json`
- Create: `public/sw.js`
- Create: `public/fonts/` (DM Sans & DM Mono WOFF2)
- Modify: `index.html`
- Test: `tests/e2eVerification.test.ts`

**Interfaces:**
- Consumes: Built assets from Task 1-7
- Produces: 100% offline-capable, installable PWA with self-hosted fonts and complete test verification.

- [ ] **Step 1: Write end-to-end integration test**

```typescript
// tests/e2eVerification.test.ts
import { describe, it, expect } from 'vitest';
import { TimeEngine } from '../src/core/timeEngine';
import { computeSchedule } from '../src/core/scheduleEngine';
import { applyBufferProportionalTrim } from '../src/core/recoveryEngine';

describe('CueTimer End-to-End Core Workflow', () => {
  it('executes complete event timing and recovery flow seamlessly', () => {
    const cues = [
      { id: '1', title: 'Welcome', speaker: 'Host', plannedDurationSec: 300, adjustedDurationSec: 300, type: 'Main' as const, mode: 'manual' as const, yellowThresholdSec: 60, redThresholdSec: 30, notes: '', status: 'active' as const },
      { id: '2', title: 'Buffer', speaker: '', plannedDurationSec: 300, adjustedDurationSec: 300, type: 'Buffer/Break' as const, mode: 'auto' as const, yellowThresholdSec: 60, redThresholdSec: 30, notes: '', status: 'pending' as const }
    ];

    const metrics = computeSchedule('09:00', cues, 0, 360, 0); // 60s overtime
    expect(metrics.varianceSec).toBe(60);

    const recovered = applyBufferProportionalTrim(cues, 0, 60);
    expect(recovered.updatedCues[1].adjustedDurationSec).toBe(240); // 300 - 60
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/e2eVerification.test.ts`
Expected: Verify failure or verify execution.

- [ ] **Step 3: Setup offline manifest, service worker caching, and self-hosted fonts**

Configure `public/manifest.json` for PWA installation, `public/sw.js` for precaching all assets, and wire up font loading in `index.html` with zero external Google Fonts CDN reliance.

- [ ] **Step 4: Run full test suite and build**

Run: `npm test && npm run build`
Expected: All tests PASS, build creates optimized `dist/` bundle.

- [ ] **Step 5: Commit**

```bash
git add public/ index.html tests/e2eVerification.test.ts
git commit -m "feat(pwa): bundle offline assets, service worker, and verify production build"
```
