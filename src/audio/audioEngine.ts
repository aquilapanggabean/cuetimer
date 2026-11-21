export type ChimeType = 'warning' | 'critical' | 'overtime';

export class AudioEngine {
  private muted: boolean = false;
  private ctx: AudioContext | null = null;

  constructor() {
    this.muted = false;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  private _getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;

    if (!this.ctx) {
      try {
        this.ctx = new AudioCtx();
      } catch {
        return null;
      }
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  protected _synthesizeTone(freq: number, durationSec: number, type: OscillatorType = 'sine', gainVal = 0.2): void {
    const ctx = this._getAudioContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      gain.gain.setValueAtTime(gainVal, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationSec);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + durationSec);
    } catch {
      // Audio not permitted or interrupted
    }
  }

  public playChime(type: ChimeType): void {
    if (this.muted) return;

    if (type === 'warning') {
      // Pleasant dual chime (880Hz -> 660Hz)
      this._synthesizeTone(880, 0.25, 'sine', 0.15);
      setTimeout(() => {
        if (!this.muted) this._synthesizeTone(660, 0.35, 'sine', 0.15);
      }, 120);
    } else if (type === 'critical') {
      // Urgent triple beep (988Hz)
      this._synthesizeTone(988, 0.15, 'triangle', 0.25);
      setTimeout(() => {
        if (!this.muted) this._synthesizeTone(988, 0.15, 'triangle', 0.25);
      }, 160);
      setTimeout(() => {
        if (!this.muted) this._synthesizeTone(988, 0.2, 'triangle', 0.25);
      }, 320);
    } else if (type === 'overtime') {
      // Low alert pulse (440Hz sawtooth)
      this._synthesizeTone(440, 0.3, 'sawtooth', 0.2);
    }
  }
}
