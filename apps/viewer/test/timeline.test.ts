import { describe, expect, it } from 'vitest';
import { createDemoTimeline, DEMO_SETUP } from '../src/scenario.js';
import {
  appendAction,
  createTimeline,
  frameAt,
  MAX_ACTIONS,
  parseReplay,
  serializeReplay,
} from '../src/timeline.js';

describe('recording and replay', () => {
  it('records twelve scripted commands while retaining immutable earlier frames', () => {
    const timeline = createDemoTimeline();
    expect(timeline.frames).toHaveLength(13);
    expect(frameAt(timeline, 0).items).toHaveLength(6);
    expect(frameAt(timeline, 12).items).toHaveLength(3);
    expect(frameAt(timeline, 3).event?.outcome).toBe('skill-unavailable');
    expect(frameAt(timeline, 9).event?.outcome).toBe('skill-unavailable');
    expect(Object.isFrozen(timeline.frames)).toBe(true);
  });
  it('seeks without generating actions or altering the future', () => {
    const timeline = createDemoTimeline();
    const before = JSON.stringify(timeline);
    expect(frameAt(timeline, 2).tick).toBe(2);
    expect(frameAt(timeline, 0).tick).toBe(0);
    expect(frameAt(timeline, 12).tick).toBe(12);
    expect(JSON.stringify(timeline)).toBe(before);
    expect(() => frameAt(timeline, -1)).toThrow();
    expect(() => frameAt(timeline, 0.5)).toThrow();
    expect(() => frameAt(timeline, 13)).toThrow();
  });
  it('round-trips full history from initial conditions and commands', () => {
    const timeline = createDemoTimeline();
    const exported = serializeReplay(timeline);
    expect(parseReplay(exported)).toEqual(timeline);
    expect(exported).not.toContain('observations');
    expect(exported).not.toContain('inventory');
    expect(exported).not.toContain('snapshots');
  });
  it('records rejected moves and repeated unsupported attempts faithfully', () => {
    let timeline = createTimeline({
      agents: [{ id: 'a', name: 'A', position: { x: 0, y: 0 } }],
    });
    timeline = appendAction(timeline, {
      type: 'move',
      agentId: 'a',
      direction: 'west',
    });
    timeline = appendAction(timeline, {
      type: 'try',
      agentId: 'a',
      skill: 'fly',
    });
    expect(parseReplay(serializeReplay(timeline))).toEqual(timeline);
    expect(frameAt(timeline, 1).event?.outcome).toBe('out-of-bounds');
  });
  it('rejects malformed input, incompatible versions and illegal commands', () => {
    const base = {
      format: 'self-evolving-world/replay',
      version: 1,
      coreVersion: '1',
      initial: {
        ...DEMO_SETUP,
        settings: { width: 16, height: 12, visionRadius: 4 },
      },
      actions: [],
    };
    for (const data of [
      null,
      {},
      { ...base, version: 2 },
      { ...base, coreVersion: '2' },
      {
        ...base,
        actions: [{ type: 'execute-code', agentId: 'lin', source: 'alert(1)' }],
      },
      {
        ...base,
        actions: [{ type: 'move', agentId: 'missing', direction: 'east' }],
      },
      {
        ...base,
        initial: {
          ...base.initial,
          settings: { width: 0, height: 12, visionRadius: 4 },
        },
      },
    ])
      expect(() => parseReplay(JSON.stringify(data))).toThrow();
    expect(() => parseReplay('{invalid')).toThrow();
    expect(() => parseReplay(' '.repeat(1_000_001))).toThrow('1 MB');
  });
  it('limits record/import length and preserves the previous timeline on failure', () => {
    let timeline = createTimeline({
      agents: [{ id: 'a', name: 'A', position: { x: 0, y: 0 } }],
    });
    for (let i = 0; i < MAX_ACTIONS; i += 1)
      timeline = appendAction(timeline, {
        type: 'try',
        agentId: 'a',
        skill: 'fly',
      });
    expect(() =>
      appendAction(timeline, { type: 'try', agentId: 'a', skill: 'fly' }),
    ).toThrow('500');
    expect(timeline.frames).toHaveLength(501);
    expect(parseReplay(serializeReplay(timeline))).toEqual(timeline);
    const overLimit = {
      format: 'self-evolving-world/replay',
      version: 1,
      coreVersion: '1',
      initial: {
        settings: { width: 1, height: 1, visionRadius: 0 },
        agents: [{ id: 'a', name: 'A', position: { x: 0, y: 0 } }],
        items: [],
      },
      actions: Array.from({ length: 501 }, () => ({
        type: 'try',
        agentId: 'a',
        skill: 'fly',
      })),
    };
    expect(() => parseReplay(JSON.stringify(overLimit))).toThrow('500');
  });
  it('supports an empty world with custom fixed settings', () => {
    const timeline = createTimeline({
      settings: { width: 5, height: 3, visionRadius: 0 },
    });
    const restored = parseReplay(serializeReplay(timeline));
    expect(frameAt(restored, 0).settings).toEqual({
      width: 5,
      height: 3,
      visionRadius: 0,
    });
    expect(restored).toEqual(timeline);
  });
});
