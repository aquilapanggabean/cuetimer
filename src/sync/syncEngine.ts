import { AppState } from '../core/types';
import { BroadcastAdapter, BroadcastMessagePayload } from './broadcastAdapter';
import { RemoteSyncAdapter } from './remoteAdapter';

export interface SyncPeer {
  id: string;
  role: string;
  lastSeen: number;
}

export interface SyncMessage extends BroadcastMessagePayload {
  type: 'STATE_UPDATE' | 'STAGE_HELLO' | 'STAGE_PONG' | 'STAGE_BYE' | 'PING_STAGES';
  senderId: string;
  role?: string;
  timestamp: number;
  state?: AppState;
}

export class SyncEngine {
  public readonly windowId: string;
  private channelName: string;
  private broadcastAdapter: BroadcastAdapter;
  private remoteAdapter: RemoteSyncAdapter | null = null;
  private stateSubscribers: ((state: AppState) => void)[] = [];
  private peers: Map<string, SyncPeer> = new Map();

  constructor(channelName = 'cuetimer_sync_v1', remoteAdapter?: RemoteSyncAdapter) {
    this.channelName = channelName;
    this.windowId = 'win_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
    this.remoteAdapter = remoteAdapter || null;
    this.broadcastAdapter = new BroadcastAdapter(this.channelName);

    this.broadcastAdapter.onMessage((msg) => {
      this.handleIncomingMessage(msg as SyncMessage);
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event.key === this.channelName && event.newValue) {
          try {
            const parsed = JSON.parse(event.newValue) as SyncMessage;
            this.handleIncomingMessage(parsed);
          } catch {
            // Ignore malformed storage packet
          }
        }
      });
    }

    if (this.remoteAdapter) {
      this.remoteAdapter.onState((remoteState) => {
        this.emitState(remoteState);
      });
    }
  }

  public handleIncomingMessage(msg: SyncMessage): void {
    if (!msg || msg.senderId === this.windowId) return;

    if (msg.type === 'STATE_UPDATE' && msg.state) {
      this.emitState(msg.state);
    } else if (msg.type === 'STAGE_HELLO' || msg.type === 'STAGE_PONG') {
      this.peers.set(msg.senderId, {
        id: msg.senderId,
        role: msg.role || 'stage',
        lastSeen: msg.timestamp || Date.now()
      });
    } else if (msg.type === 'STAGE_BYE') {
      this.peers.delete(msg.senderId);
    }
  }

  public publishState(state: AppState): void {
    const packet: SyncMessage = {
      type: 'STATE_UPDATE',
      senderId: this.windowId,
      role: 'operator',
      timestamp: Date.now(),
      state
    };

    this.broadcastAdapter.post(packet);

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(this.channelName, JSON.stringify(packet));
      } catch {
        // LocalStorage full or blocked
      }
    }

    if (this.remoteAdapter && this.remoteAdapter.isConnected()) {
      this.remoteAdapter.broadcastState(state);
    }
  }

  public announcePresence(role: 'stage' | 'operator' | 'overlay'): void {
    const packet: SyncMessage = {
      type: 'STAGE_HELLO',
      senderId: this.windowId,
      role,
      timestamp: Date.now()
    };
    this.broadcastAdapter.post(packet);
  }

  public announceLeave(): void {
    const packet: SyncMessage = {
      type: 'STAGE_BYE',
      senderId: this.windowId,
      timestamp: Date.now()
    };
    this.broadcastAdapter.post(packet);
  }

  public pingPeers(): void {
    const packet: SyncMessage = {
      type: 'PING_STAGES',
      senderId: this.windowId,
      timestamp: Date.now()
    };
    this.broadcastAdapter.post(packet);

    // Prune stale peers (> 6s inactivity)
    const cutoff = Date.now() - 6000;
    for (const [id, peer] of this.peers.entries()) {
      if (peer.lastSeen < cutoff) {
        this.peers.delete(id);
      }
    }
  }

  public getConnectedPeers(): SyncPeer[] {
    return Array.from(this.peers.values());
  }

  public onStateChange(cb: (state: AppState) => void): () => void {
    this.stateSubscribers.push(cb);
    return () => {
      this.stateSubscribers = this.stateSubscribers.filter((fn) => fn !== cb);
    };
  }

  private emitState(state: AppState): void {
    this.stateSubscribers.forEach((fn) => fn(state));
  }
}
