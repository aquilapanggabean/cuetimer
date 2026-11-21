import { describe, it, expect, vi } from 'vitest';
import { SyncEngine, SyncMessage } from '../src/sync/syncEngine';
import { AppState } from '../src/core/types';

describe('SyncEngine', () => {
  const dummyState: AppState = {
    eventStartTime: '09:00',
    cues: [],
    activeCueIndex: 0,
    isRunning: false,
    startedAtEpoch: null,
    accumulatedElapsedMs: 0,
    eventFirstStartedEpoch: null,
    eventEndedEpoch: null,
    scheduleOffsetSec: 0,
    adjustStepSec: 60,
    flashMessage: { text: '', blinking: false, visible: false, dismissedOnStage: false },
    googleSheetUrl: ''
  };

  it('manages subscribers and publishes state', () => {
    const engine = new SyncEngine('test_cuetimer_sync');
    let receivedState: AppState | null = null;

    const unsub = engine.onStateChange((s) => {
      receivedState = s;
    });

    engine.handleIncomingMessage({
      type: 'STATE_UPDATE',
      senderId: 'remote-1',
      role: 'operator',
      timestamp: Date.now(),
      state: dummyState
    });

    expect(receivedState).toEqual(dummyState);
    unsub();

    // Verify unsub stops listening
    engine.handleIncomingMessage({
      type: 'STATE_UPDATE',
      senderId: 'remote-1',
      role: 'operator',
      timestamp: Date.now(),
      state: { ...dummyState, eventStartTime: '10:00' }
    });
    expect(receivedState?.eventStartTime).toBe('09:00');
  });

  it('registers and tracks active peer heartbeats', () => {
    const engine = new SyncEngine('test_cuetimer_sync');
    engine.handleIncomingMessage({
      type: 'STAGE_HELLO',
      senderId: 'stage-screen-1',
      role: 'stage',
      timestamp: Date.now()
    });

    const peers = engine.getConnectedPeers();
    expect(peers.length).toBe(1);
    expect(peers[0].id).toBe('stage-screen-1');
    expect(peers[0].role).toBe('stage');

    // Bye message removes peer
    engine.handleIncomingMessage({
      type: 'STAGE_BYE',
      senderId: 'stage-screen-1',
      role: 'stage',
      timestamp: Date.now()
    });
    expect(engine.getConnectedPeers().length).toBe(0);
  });
});
