import { Cue, ScheduleMetrics, ScheduledCueItem } from './types';

export function getStartEpochForToday(hhmm: string): number {
  const parts = (hhmm || '09:00').split(':');
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

export function computeSchedule(
  startTimeStr: string,
  cues: Cue[],
  activeCueIndex: number,
  activeElapsedSec: number,
  scheduleOffsetSec: number
): ScheduleMetrics {
  const startEpoch = getStartEpochForToday(startTimeStr);

  const plannedTotalSec = cues.reduce((sum, c) => sum + c.plannedDurationSec, 0);
  const plannedEndEpoch = startEpoch + plannedTotalSec * 1000;

  let cursorEpoch = startEpoch + (scheduleOffsetSec || 0) * 1000;
  const cueSchedules: ScheduledCueItem[] = [];

  cues.forEach((cue, idx) => {
    const itemStart = cursorEpoch;
    let effectiveSec = cue.adjustedDurationSec;

    // If active cue has run past its adjusted duration, project dynamically based on actual elapsed time
    if (idx === activeCueIndex && cues.length > 0 && activeElapsedSec > effectiveSec) {
      effectiveSec = activeElapsedSec;
    }

    const itemEnd = itemStart + effectiveSec * 1000;
    cueSchedules.push({
      startEpoch: itemStart,
      endEpoch: itemEnd,
      effectiveSec
    });
    cursorEpoch = itemEnd;
  });

  const projectedEndEpoch = cues.length > 0 ? cursorEpoch : plannedEndEpoch;
  const varianceSec = Math.round((projectedEndEpoch - plannedEndEpoch) / 1000);

  return {
    startEpoch,
    plannedTotalSec,
    plannedEndEpoch,
    projectedEndEpoch,
    varianceSec,
    cueSchedules
  };
}
