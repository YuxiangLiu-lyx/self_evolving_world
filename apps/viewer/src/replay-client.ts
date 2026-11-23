import type { ReplayRequest, ReplayResponse } from './replay-service.js';

type FrameResponse = Extract<ReplayResponse, { kind: 'frame' }>;
type WorkerPort = Pick<
  Worker,
  'postMessage' | 'terminate' | 'onmessage' | 'onerror' | 'onmessageerror'
>;

/** The main thread receives only the requested verified world, never a segment
 * or every intermediate frame. Superseded consumers settle without stale output. */
export class ReplayClient {
  private serial = 0;
  private failure: Error | undefined;
  private pending:
    | {
        id: number;
        resolve: (value: FrameResponse | null) => void;
        reject: (error: Error) => void;
        progress: (tick: number) => void;
      }
    | undefined;
  constructor(private readonly worker: WorkerPort) {
    worker.onmessage = (event: MessageEvent<ReplayResponse>) => {
      const response = event.data;
      const pending = this.pending;
      if (!pending || response.id !== pending.id) return;
      if (response.kind === 'progress') pending.progress(response.tick);
      else {
        this.pending = undefined;
        if (response.kind === 'error')
          pending.reject(new Error(response.message));
        else pending.resolve(response);
      }
    };
    const failed = () => {
      this.failure = new Error(
        'Replay worker failed. Reload the archive to retry.',
      );
      this.pending?.reject(this.failure);
      this.pending = undefined;
      worker.terminate();
    };
    worker.onerror = failed;
    worker.onmessageerror = failed;
  }
  seek(
    request: Omit<ReplayRequest, 'id'>,
    progress: (tick: number) => void,
  ): Promise<FrameResponse | null> {
    if (this.failure) return Promise.reject(this.failure);
    this.pending?.resolve(null);
    return new Promise((resolve, reject) => {
      const id = ++this.serial;
      this.pending = { id, resolve, reject, progress };
      this.worker.postMessage({ ...request, id } satisfies ReplayRequest);
    });
  }
  dispose(): void {
    this.pending?.resolve(null);
    this.pending = undefined;
    this.failure = new Error('Replay worker closed.');
    this.worker.terminate();
  }
}
