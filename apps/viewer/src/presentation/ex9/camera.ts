import type { V7Point } from '@self-evolving-world/world-core';
import type { Camera } from './model.js';

/** Critically damped presentation camera. No archive or simulation state. */
export class FollowCamera {
  readonly view: Camera = { x: 13, y: 19, span: 18 };
  span = 18;
  private vx = 0;
  private vy = 0;
  private lead: V7Point = { x: 0, y: 0 };
  cut(point: V7Point): void {
    this.view.x = point.x;
    this.view.y = point.y - 0.8;
    this.vx = this.vy = 0;
    this.lead = { x: 0, y: 0 };
  }
  release(): void {
    this.vx = this.vy = 0;
  }
  update(
    seconds: number,
    point?: V7Point,
    direction: V7Point = { x: 0, y: 0 },
  ): void {
    const dt = Math.min(0.1, Math.max(0, seconds));
    this.view.span += (this.span - this.view.span) * (1 - Math.exp(-12 * dt));
    if (!point) {
      this.release();
      return;
    }
    const distance = Math.hypot(direction.x, direction.y),
      strength = distance > 0 ? Math.min(0.32, distance * 0.4) / distance : 0,
      alpha = 1 - Math.exp(-7 * dt);
    this.lead.x += (direction.x * strength - this.lead.x) * alpha;
    this.lead.y += (direction.y * strength - this.lead.y) * alpha;
    for (const axis of ['x', 'y'] as const) {
      const target = point[axis] + this.lead[axis] - (axis === 'y' ? 0.8 : 0),
        error = this.view[axis] - target,
        offset = Math.sign(error) * Math.max(0, Math.abs(error) - 0.12),
        velocity = axis === 'x' ? this.vx : this.vy,
        decay = Math.exp(-10 * dt),
        change = velocity + 10 * offset,
        next = (velocity - 10 * change * dt) * decay;
      this.view[axis] += (offset + change * dt) * decay - offset;
      if (axis === 'x') this.vx = next;
      else this.vy = next;
    }
  }
}
