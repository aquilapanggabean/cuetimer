import { AppState } from '../core/types';

export interface RemoteSyncAdapter {
  connect(roomCode: string, pin?: string): Promise<boolean>;
  broadcastState(state: AppState): void;
  onState(cb: (state: AppState) => void): () => void;
  disconnect(): void;
  isConnected(): boolean;
}

export class MockWebSocketRemoteAdapter implements RemoteSyncAdapter {
  private connected = false;
  private subscribers: ((state: AppState) => void)[] = [];

  public async connect(_roomCode: string, _pin?: string): Promise<boolean> {
    this.connected = true;
    return true;
  }

  public broadcastState(state: AppState): void {
    if (!this.connected) return;
    this.subscribers.forEach((fn) => fn(state));
  }

  public onState(cb: (state: AppState) => void): () => void {
    this.subscribers.push(cb);
    return () => {
      this.subscribers = this.subscribers.filter((fn) => fn !== cb);
    };
  }

  public disconnect(): void {
    this.connected = false;
    this.subscribers = [];
  }

  public isConnected(): boolean {
    return this.connected;
  }
}
