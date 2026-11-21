export function pad2(val: number): string {
  return String(Math.floor(Math.abs(val))).padStart(2, '0');
}

export function formatMMSS(totalSeconds: number): string {
  const neg = totalSeconds < 0;
  const abs = Math.abs(Math.round(totalSeconds));
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return (neg ? '-' : '') + pad2(m) + ':' + pad2(s);
}

export function formatHHMMSS(totalSeconds: number): string {
  const neg = totalSeconds < 0;
  const abs = Math.abs(Math.floor(totalSeconds));
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  return (neg ? '-' : '') + pad2(h) + ':' + pad2(m) + ':' + pad2(s);
}

export function formatClockHHMM(epochMs: number): string {
  const d = new Date(epochMs);
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

export function formatClockHHMMSS(epochMs: number): string {
  const d = new Date(epochMs);
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
}

export function parseDurationSeconds(input: unknown, fallbackSec = 600): number {
  if (input === null || input === undefined || input === '') return fallbackSec;

  if (typeof input === 'number' && !isNaN(input)) {
    if (input > 0 && input < 1) {
      // Excel fractional day representation (e.g. 0.5 = 12 hours)
      return Math.max(0, Math.round(input * 86400));
    }
    return Math.max(0, Math.round(input * 60));
  }

  const str = String(input).trim().toLowerCase();
  if (!str) return fallbackSec;

  if (str.includes(':')) {
    const parts = str.split(':').map((p) => parseFloat(p) || 0);
    if (parts.length === 3) {
      return Math.max(0, Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2]));
    }
    if (parts.length === 2) {
      return Math.max(0, Math.round(parts[0] * 60 + parts[1]));
    }
  }

  const unitMatch = str.match(/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+(?:\.\d+)?)\s*m)?\s*(?:(\d+(?:\.\d+)?)\s*s)?$/);
  if (unitMatch && (unitMatch[1] || unitMatch[2] || unitMatch[3])) {
    const h = parseFloat(unitMatch[1] || '0');
    const m = parseFloat(unitMatch[2] || '0');
    const s = parseFloat(unitMatch[3] || '0');
    return Math.max(0, Math.round(h * 3600 + m * 60 + s));
  }

  const num = parseFloat(str);
  if (!isNaN(num)) {
    return Math.max(0, Math.round(num * 60));
  }

  return fallbackSec;
}

export function calculateElapsedMs(
  startedAtEpoch: number | null,
  accumulatedMs: number,
  nowMs: number,
  isRunning: boolean
): number {
  if (isRunning && startedAtEpoch !== null) {
    return Math.max(0, accumulatedMs + (nowMs - startedAtEpoch));
  }
  return Math.max(0, accumulatedMs);
}

export function calculateRemainingMs(durationSec: number, elapsedMs: number): number {
  return durationSec * 1000 - elapsedMs;
}
