import { describe, it, expect } from 'vitest';
import {
  formatMMSS,
  formatHHMMSS,
  formatClockHHMM,
  formatClockHHMMSS,
  parseDurationSeconds,
  calculateElapsedMs,
  calculateRemainingMs
} from '../src/core/timeEngine';

describe('TimeEngine', () => {
  it('formats positive and negative seconds to MM:SS correctly', () => {
    expect(formatMMSS(300)).toBe('05:00');
    expect(formatMMSS(65)).toBe('01:05');
    expect(formatMMSS(-45)).toBe('-00:45');
    expect(formatMMSS(-125)).toBe('-02:05');
    expect(formatMMSS(0)).toBe('00:00');
  });

  it('formats HH:MM:SS correctly', () => {
    expect(formatHHMMSS(3665)).toBe('01:01:05');
    expect(formatHHMMSS(59)).toBe('00:00:59');
    expect(formatHHMMSS(-3665)).toBe('-01:01:05');
  });

  it('formats epoch timestamps to clock strings', () => {
    const fixedEpoch = new Date(2026, 10, 21, 9, 30, 45).getTime();
    expect(formatClockHHMM(fixedEpoch)).toBe('09:30');
    expect(formatClockHHMMSS(fixedEpoch)).toBe('09:30:45');
  });

  it('parses diverse duration string formats cleanly', () => {
    expect(parseDurationSeconds('15:00')).toBe(900);
    expect(parseDurationSeconds('01:15:00')).toBe(4500);
    expect(parseDurationSeconds('10m')).toBe(600);
    expect(parseDurationSeconds('45s')).toBe(45);
    expect(parseDurationSeconds('1h 30m')).toBe(5400);
    expect(parseDurationSeconds(15)).toBe(900);
    expect(parseDurationSeconds(0.5)).toBe(43200); // 0.5 day in Excel = 12 hours = 43200s
    expect(parseDurationSeconds('', 300)).toBe(300);
    expect(parseDurationSeconds(null, 300)).toBe(300);
  });

  it('calculates drift-free elapsed and remaining times', () => {
    const start = 1000000;
    const now = 1015000; // 15 seconds later
    const elapsed = calculateElapsedMs(start, 5000, now, true);
    expect(elapsed).toBe(20000); // 5000 accumulated + 15000 current run
    expect(calculateRemainingMs(30, elapsed)).toBe(10000); // 30s - 20s = 10s remaining
    expect(calculateRemainingMs(15, elapsed)).toBe(-5000); // 15s - 20s = -5s remaining (overtime)
  });

  it('handles paused state elapsed time accurately', () => {
    const elapsed = calculateElapsedMs(null, 7500, 2000000, false);
    expect(elapsed).toBe(7500);
  });
});
