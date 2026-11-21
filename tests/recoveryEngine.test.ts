import { describe, it, expect } from 'vitest';
import { applyRippleShift, applyTrimNext, applyBufferProportionalTrim } from '../src/core/recoveryEngine';
import { Cue } from '../src/core/types';

describe('RecoveryEngine', () => {
  const getSampleCues = (): Cue[] => [
    {
      id: '1',
      title: 'Session 1',
      speaker: '',
      plannedDurationSec: 600,
      adjustedDurationSec: 600,
      type: 'Main',
      mode: 'manual',
      yellowThresholdSec: 60,
      redThresholdSec: 30,
      notes: '',
      status: 'active'
    },
    {
      id: '2',
      title: 'Networking Buffer',
      speaker: '',
      plannedDurationSec: 300,
      adjustedDurationSec: 300,
      type: 'Buffer/Break',
      mode: 'manual',
      yellowThresholdSec: 60,
      redThresholdSec: 30,
      notes: '',
      status: 'pending'
    },
    {
      id: '3',
      title: 'Session 2',
      speaker: '',
      plannedDurationSec: 600,
      adjustedDurationSec: 600,
      type: 'Main',
      mode: 'manual',
      yellowThresholdSec: 60,
      redThresholdSec: 30,
      notes: '',
      status: 'pending'
    }
  ];

  it('applies ripple shift by incrementing schedule offset', () => {
    expect(applyRippleShift(0, 120)).toBe(120);
    expect(applyRippleShift(60, 30)).toBe(90);
  });

  it('trims immediate next cue and clamps at zero', () => {
    const cues = getSampleCues();
    const res = applyTrimNext(cues, 0, 100);
    expect(res.updatedCues[1].adjustedDurationSec).toBe(200); // 300 - 100
    expect(res.leftoverOffsetSec).toBe(0);
  });

  it('handles trim next when overtime exceeds next cue duration', () => {
    const cues = getSampleCues();
    const res = applyTrimNext(cues, 0, 400); // Buffer is only 300s
    expect(res.updatedCues[1].adjustedDurationSec).toBe(0);
    expect(res.leftoverOffsetSec).toBe(100); // 100s leftover carried to offset
  });

  it('absorbs overtime first from buffer cues then distributes proportionally across remaining main cues', () => {
    const cues = getSampleCues();
    // 400s overtime: 300s absorbed by Buffer (cue 2), remaining 100s absorbed by Session 2 (cue 3)
    const res = applyBufferProportionalTrim(cues, 0, 400);
    expect(res.updatedCues[1].adjustedDurationSec).toBe(0);
    expect(res.updatedCues[2].adjustedDurationSec).toBe(500); // 600 - 100
    expect(res.leftoverOffsetSec).toBe(0);
  });

  it('gracefully handles proportional trim when no upcoming cues exist', () => {
    const cues = getSampleCues();
    const res = applyBufferProportionalTrim(cues, 2, 100); // at last cue
    expect(res.leftoverOffsetSec).toBe(100);
  });
});
