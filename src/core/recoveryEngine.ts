import { Cue } from './types';

export function applyRippleShift(currentOffsetSec: number, overtimeSec: number): number {
  return (currentOffsetSec || 0) + Math.max(0, overtimeSec);
}

export function applyTrimNext(
  cues: Cue[],
  activeCueIndex: number,
  overtimeSec: number
): { updatedCues: Cue[]; leftoverOffsetSec: number } {
  const cloned = cues.map((c) => ({ ...c }));
  const nextIdx = activeCueIndex + 1;

  if (nextIdx >= cloned.length || overtimeSec <= 0) {
    return { updatedCues: cloned, leftoverOffsetSec: overtimeSec };
  }

  const nextCue = cloned[nextIdx];
  const deduct = Math.min(nextCue.adjustedDurationSec, overtimeSec);
  nextCue.adjustedDurationSec = Math.max(0, nextCue.adjustedDurationSec - deduct);
  const leftover = overtimeSec - deduct;

  return { updatedCues: cloned, leftoverOffsetSec: leftover };
}

export function applyBufferProportionalTrim(
  cues: Cue[],
  activeCueIndex: number,
  overtimeSec: number
): { updatedCues: Cue[]; leftoverOffsetSec: number } {
  const cloned = cues.map((c) => ({ ...c }));
  const nextIdx = activeCueIndex + 1;

  if (nextIdx >= cloned.length || overtimeSec <= 0) {
    return { updatedCues: cloned, leftoverOffsetSec: overtimeSec };
  }

  const upcoming = cloned.slice(nextIdx);
  let toAbsorb = overtimeSec;

  // 1. First absorb from Buffer/Break cues
  upcoming.forEach((cue) => {
    if (toAbsorb <= 0) return;
    if (cue.type === 'Buffer/Break' && cue.adjustedDurationSec > 0) {
      const take = Math.min(cue.adjustedDurationSec, toAbsorb);
      cue.adjustedDurationSec -= take;
      toAbsorb -= take;
    }
  });

  // 2. Distribute any remaining overtime proportionally across upcoming Main cues
  if (toAbsorb > 0) {
    let candidates = upcoming.filter((c) => c.type === 'Main' && c.adjustedDurationSec > 0);
    if (!candidates.length) {
      candidates = upcoming.filter((c) => c.adjustedDurationSec > 0);
    }

    const totalCandidateSec = candidates.reduce((sum, c) => sum + c.adjustedDurationSec, 0);

    if (totalCandidateSec > 0) {
      let allocated = 0;
      candidates.forEach((cue, i) => {
        if (i === candidates.length - 1) {
          const lastTake = Math.min(cue.adjustedDurationSec, toAbsorb - allocated);
          cue.adjustedDurationSec -= lastTake;
          allocated += lastTake;
        } else {
          const share = Math.min(
            cue.adjustedDurationSec,
            Math.round(toAbsorb * (cue.adjustedDurationSec / totalCandidateSec))
          );
          cue.adjustedDurationSec -= share;
          allocated += share;
        }
      });
      toAbsorb -= allocated;
    }
  }

  return { updatedCues: cloned, leftoverOffsetSec: toAbsorb };
}
