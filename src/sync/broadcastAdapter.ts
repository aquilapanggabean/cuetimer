export interface BroadcastMessagePayload {
  type: string;
  senderId: string;
  role?: string;
  timestamp: number;
  [key: string]: unknown;
}

export class BroadcastAdapter {
  private channel: BroadcastChannel | null = null;
  private channelName: string;

  constructor(channelName: string) {
    this.channelName = channelName;
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel(this.channelName);
      } catch {
        this.channel = null;
      }
    }
  }

  public post(message: BroadcastMessagePayload): void {
    if (this.channel) {
      try {
        this.channel.postMessage(message);
      } catch {
        // BroadcastChannel failed
      }
    }
  }

  public onMessage(handler: (msg: BroadcastMessagePayload) => void): () => void {
    if (!this.channel) return () => {};

    const listener = (event: MessageEvent) => {
      if (event && event.data) {
        handler(event.data as BroadcastMessagePayload);
      }
    };

    this.channel.addEventListener('message', listener);
    return () => {
      this.channel?.removeEventListener('message', listener);
    };
  }

  public close(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
  }
}
