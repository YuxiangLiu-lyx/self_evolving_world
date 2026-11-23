import { replayService } from './replay-service.js';
import type { ReplayRequest, ReplayResponse } from './replay-service.js';

// Keep worker host types local: the viewer also compiles against DOM libraries.
const host = globalThis as unknown as {
  onmessage: (event: MessageEvent<ReplayRequest>) => void;
  postMessage: (response: ReplayResponse) => void;
};
// A task boundary lets new seek messages run without the nested timer's
// four-millisecond minimum delay on every cheap recorded round.
const turns: (() => void)[] = [];
const channel = new MessageChannel();
channel.port1.onmessage = () => {
  turns.shift()?.();
};
const service = replayService(
  async (url) => {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok)
      throw new Error(`Archive unavailable (${String(response.status)}).`);
    return response.text();
  },
  (response) => {
    host.postMessage(response);
  },
  () =>
    new Promise((resolve) => {
      turns.push(resolve);
      channel.port2.postMessage(null);
    }),
);
host.onmessage = (event) => {
  void service.seek(event.data);
};
