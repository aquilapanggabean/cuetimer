import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AudioEngine } from '../src/audio/audioEngine';

describe('AudioEngine', () => {
  let audio: AudioEngine;

  beforeEach(() => {
    audio = new AudioEngine();
  });

  it('initializes in unmuted state and toggles mute state', () => {
    expect(audio.isMuted()).toBe(false);
    audio.setMuted(true);
    expect(audio.isMuted()).toBe(true);
    audio.setMuted(false);
    expect(audio.isMuted()).toBe(false);
  });

  it('safely handles playChime without throwing even if AudioContext is not supported', () => {
    expect(() => {
      audio.playChime('warning');
      audio.playChime('critical');
      audio.playChime('overtime');
    }).not.toThrow();
  });

  it('does not play when muted', () => {
    audio.setMuted(true);
    const spy = vi.spyOn(audio as any, '_synthesizeTone');
    audio.playChime('warning');
    expect(spy).not.toHaveBeenCalled();
  });
});
