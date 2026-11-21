import { describe, it, expect } from 'vitest';
import { computeSchedule, getStartEpochForToday } from '../src/core/scheduleEngine';
import { Cue } from '../src/core/types';

describe('ScheduleEngine', () => {
  const mockCues: Cue[] = [
    {
      id: '1',
      title: 'Opening',
      speaker: 'Host',
      plannedDurationSec: 300,
      adjustedDurationSec: 300,
      type: 'Main',
      mode: 'manual',
      yellowThresholdSec: 60,
      redThresholdSec: 30,
      notes: '',
      status: 'active'
    },
    {
      id: '2',
      title: 'Keynote',
      speaker: 'Speaker 1',
      plannedDurationSec: 900,
      adjustedDurationSec: 900,
      type: 'Main',
      mode: 'manual',
      yellowThresholdSec: 120,
      redThresholdSec: 30,
      notes: '',
      status: 'pending'
    }
  ];

  it('computes planned and projected end times for on-time event', () => {
    const metrics = computeSchedule('09:00', mockCues, 0, 100, 0);
    const startEpoch = getStartEpochForToday('09:00');
    expect(metrics.startEpoch).toBe(startEpoch);
    expect(metrics.plannedTotalSec).toBe(1200); // 300 + 900 = 1200s (20 mins)
    expect(metrics.plannedEndEpoch).toBe(startEpoch + 1200 * 1000);
    expect(metrics.projectedEndEpoch).toBe(startEpoch + 1200 * 1000);
    expect(metrics.varianceSec).toBe(0);
    expect(metrics.cueSchedules.length).toBe(2);
  });

  it('reflects active cue overrun in projected end time and variance', () => {
    // Active cue planned for 300s, but activeElapsedSec is 400s (100s overrun)
    const metrics = computeSchedule('09:00', mockCues, 0, 400, 0);
    expect(metrics.varianceSec).toBe(100);
    expect(metrics.projectedEndEpoch).toBe(metrics.plannedEndEpoch + 100 * 1000);
  });

  it('incorporates schedule offset into calculation', () => {
    const metrics = computeSchedule('09:00', mockCues, 0, 100, 60);
    expect(metrics.varianceSec).toBe(60);
  });
});
