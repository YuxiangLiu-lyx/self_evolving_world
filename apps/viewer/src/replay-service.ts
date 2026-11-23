import {
  browserDigest,
  incrementalSceneReplay,
  ReplaySuperseded,
} from './continuous-history.js';
import type { SceneIndex, SceneSegment } from './continuous-history.js';
import type { V7Cursor, V7World } from '@self-evolving-world/world-core';

export interface ReplayRequest {
  id: number;
  url: string;
  part: SceneIndex['segments'][number];
  tick: number;
}
export type ReplayResponse =
  | { id: number; kind: 'progress'; tick: number }
  | {
      id: number;
      kind: 'frame';
      world: V7World;
      tasks: Record<string, V7Cursor>;
    }
  | { id: number; kind: 'error'; message: string };

/** One archive-owned worker. Both bytes and verified prefixes share a bounded
 * cache. Later requests supersede earlier work at verified round boundaries. */
export function replayService(
  load: (url: string) => Promise<string>,
  send: (response: ReplayResponse) => void,
  yieldTurn: () => Promise<void>,
) {
  let latest = 0;
  const cache = new Map<
    string,
    Promise<{
      segment: SceneSegment;
      replay: ReturnType<typeof incrementalSceneReplay>;
    }>
  >();
  async function seek(request: ReplayRequest): Promise<void> {
    latest = request.id;
    const current = () => latest === request.id;
    try {
      const { part } = request;
      const key = JSON.stringify([
        request.url,
        part.start,
        part.end,
        part.sha256,
      ]);
      let loading = cache.get(key);
      if (!loading) {
        loading = (async () => {
          const text = await load(request.url);
          if ((await browserDigest(text)) !== part.sha256)
            throw new Error('Segment integrity check failed.');
          const segment = JSON.parse(text) as SceneSegment;
          if (
            segment.start !== part.start ||
            segment.start + segment.rounds.length !== part.end
          )
            throw new Error('Replay segment bounds differ from its index.');
          return { segment, replay: incrementalSceneReplay(segment) };
        })();
      }
      // Refresh access order, including in-flight requests.
      cache.delete(key);
      cache.set(key, loading);
      if (cache.size > 3) cache.delete(cache.keys().next().value ?? '');
      const value = await loading;
      if (!current()) return;
      const world = await value.replay.frame(request.tick, {
        current,
        advanced: async (tick) => {
          if (current()) send({ id: request.id, kind: 'progress', tick });
          // WebCrypto can resolve within one task. Explicitly yield so worker
          // messages can cancel a long seek instead of queuing behind it.
          await yieldTurn();
        },
      });
      if (current())
        send({
          id: request.id,
          kind: 'frame',
          world,
          tasks:
            value.segment.rounds.find((r) => r.tick === request.tick)?.tasks ??
            {},
        });
    } catch (error) {
      if (current() && !(error instanceof ReplaySuperseded))
        send({
          id: request.id,
          kind: 'error',
          message: error instanceof Error ? error.message : 'Replay failed.',
        });
    }
  }
  return { seek };
}
