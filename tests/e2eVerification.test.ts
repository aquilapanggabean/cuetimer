import { describe, it, expect } from 'vitest';
import { Cue } from '../src/core/types';
import { computeSchedule } from '../src/core/scheduleEngine';
import { applyBufferProportionalTrim } from '../src/core/recoveryEngine';
import { formatMMSS, calculateRemainingMs } from '../src/core/timeEngine';
import { HistoryManager } from '../src/storage/historyManager';
import { convertRowsToCues } from '../src/storage/spreadsheetParser';

describe('CueTimer End-to-End Production Verification', () => {
  it('manages an entire live event lifecycle from import to overtime recovery', () => {
    // 1. Spreadsheet data input simulation
    const rawSpreadsheetRows = [
      { Title: 'Opening Keynote', Speaker: 'Dr. Jane', Duration: '10:00', Type: 'Main', Mode: 'manual' },
      { Title: 'Production Buffer', Speaker: 'Crew', Duration: '05:00', Type: 'Buffer/Break', Mode: 'auto' },
      { Title: 'Panel Session', Speaker: 'Moderator', Duration: '15:00', Type: 'Main', Mode: 'manual' }
    ];

    const cues: Cue[] = convertRowsToCues(rawSpreadsheetRows);
    expect(cues.length).toBe(3);
    expect(cues[0].plannedDurationSec).toBe(600); // 10 mins
    expect(cues[1].plannedDurationSec).toBe(300); // 5 mins
    expect(cues[2].plannedDurationSec).toBe(900); // 15 mins

    // 2. Initial on-time schedule
    let metrics = computeSchedule('09:00', cues, 0, 0, 0);
    expect(metrics.plannedTotalSec).toBe(1800); // 30 mins
    expect(metrics.varianceSec).toBe(0);

    // 3. Keynote runs 120 seconds into overtime (720s elapsed for 600s cue)
    const activeElapsed = 720;
    const remainingMs = calculateRemainingMs(cues[0].adjustedDurationSec, activeElapsed * 1000);
    expect(remainingMs).toBe(-120000); // -120s remaining
    expect(formatMMSS(Math.ceil(remainingMs / 1000))).toBe('-02:00');

    metrics = computeSchedule('09:00', cues, 0, activeElapsed, 0);
    expect(metrics.varianceSec).toBe(120); // 2 minutes behind schedule

    // 4. Operator applies Buffer-First Overtime Recovery
    const recoveryResult = applyBufferProportionalTrim(cues, 0, 120);
    expect(recoveryResult.updatedCues[1].adjustedDurationSec).toBe(180); // 300 - 120 = 180s buffer remaining
    expect(recoveryResult.leftoverOffsetSec).toBe(0);

    // When cue 0 concludes at 720s, its actual duration is preserved
    recoveryResult.updatedCues[0].adjustedDurationSec = 720;

    // 5. Projected schedule with trimmed buffer returns exactly on-time (720 + 180 + 900 = 1800s)
    metrics = computeSchedule('09:00', recoveryResult.updatedCues, 1, 0, 0);
    expect(metrics.varianceSec).toBe(0); // Event projected end returns back on-time!
  });

  it('preserves immutable undo/redo history during event adjustments', () => {
    const history = new HistoryManager<{ count: number }>({ count: 1 });
    history.push({ count: 2 });
    history.push({ count: 3 });
    expect(history.undo()?.count).toBe(2);
    expect(history.undo()?.count).toBe(1);
    expect(history.redo()?.count).toBe(2);
  });
});

