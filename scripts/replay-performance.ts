/** Read-only local browser diagnostic. Build and serve the viewer first; this
 * never starts, resumes, rewrites or calls a model for an experiment. */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cpus, platform, arch } from 'node:os';

interface Metrics {
  long: number[];
  gaps: number[];
  canvasResizes: number;
}
declare global {
  interface Window {
    replayPerformance: Metrics;
  }
}
const label = process.argv[2] ?? 'current';
if (!/^[a-z0-9-]+$/.test(label))
  throw new Error('Use a lowercase diagnostic label.');
const base = process.argv[3] ?? 'http://127.0.0.1:4174';
const output = resolve('validation-results');
mkdirSync(output, { recursive: true });
const browser = await chromium.launch();
const results = [];
try {
  for (const id of ['ex8', 'ex10', 'ex12']) {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1100 },
    });
    await page.addInitScript(() => {
      window.replayPerformance = { long: [], gaps: [], canvasResizes: 0 };
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          window.replayPerformance.long.push(entry.duration);
      }).observe({ type: 'longtask', buffered: true });
      let last = performance.now();
      setInterval(() => {
        const now = performance.now();
        window.replayPerformance.gaps.push(now - last);
        last = now;
      }, 16);
      for (const key of ['width', 'height']) {
        const descriptor = Object.getOwnPropertyDescriptor(
          HTMLCanvasElement.prototype,
          key,
        );
        if (!descriptor?.set)
          throw new Error('Missing Canvas dimension setter.');
        Object.defineProperty(HTMLCanvasElement.prototype, key, {
          ...descriptor,
          set(this: HTMLCanvasElement, value: number) {
            window.replayPerformance.canvasResizes++;
            descriptor.set?.call(this, value);
          },
        });
      }
    });
    const start = performance.now();
    await page.goto(new URL(`/?experiment=${id}`, base).href);
    await page.waitForFunction(
      () =>
        document
          .querySelector('#status')
          ?.textContent.includes('Verified recorded state'),
      {},
      { timeout: 120_000 },
    );
    const initialMs = performance.now() - start;
    await page.waitForTimeout(500);
    const take = () =>
      page.evaluate(() => {
        const m = window.replayPerformance;
        const value = {
          longTasks: m.long.length,
          longTotalMs: m.long.reduce((a, b) => a + b, 0),
          maxLongMs: Math.max(0, ...m.long),
          maxHeartbeatGapMs: Math.max(0, ...m.gaps),
          canvasResizes: m.canvasResizes,
          domNodes: document.querySelectorAll('*').length,
        };
        m.long = [];
        m.gaps = [];
        m.canvasResizes = 0;
        return value;
      });
    const initial = await take();
    const begin = performance.now();
    await page.locator('#time').fill('90');
    await page.waitForFunction(
      () => document.querySelector('#round')?.textContent.startsWith('90 /'),
      {},
      { timeout: 180_000 },
    );
    const seekMs = performance.now() - begin;
    await page.waitForTimeout(500);
    const seek = await take();
    const box = await page.locator('#scene').boundingBox();
    if (!box) throw new Error('Missing recorded scene.');
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.7);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width * 0.6 + 100,
      box.y + box.height * 0.7 + 50,
      { steps: 20 },
    );
    await page.mouse.up();
    await page.waitForTimeout(500);
    const pan = await take();
    const result = { id, initialMs, initial, seekMs, seek, pan };
    results.push(result);
    console.log(JSON.stringify(result));
    await page.close();
  }
  writeFileSync(
    resolve(output, `replay-performance-${label}.json`),
    JSON.stringify(
      {
        label,
        node: process.version,
        browser: browser.version(),
        platform: platform(),
        arch: arch(),
        cpu: cpus()[0]?.model,
        viewport: { width: 1440, height: 1100 },
        results,
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await browser.close();
}
