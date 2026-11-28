import { V7_PACKAGES } from '@self-evolving-world/world-core';
import type { V7Package } from '@self-evolving-world/world-core';

/**
 * Packages merged from main after the experiment B package tests took their byte-identity
 * snapshots (experiment A's ex16 packages, PR #37). They are not part of those snapshots, so the
 * tests exclude them; every package registered before the tested one is otherwise compared.
 */
export const MERGED_AFTER_GOAL_PAIR_SNAPSHOTS: readonly string[] = [
  'hand-join-fiber-cords@1',
  'hand-bind-crossing@1',
  'hand-twist-sectioned-cord@1',
  'hand-lash-crossing@1',
  'hand-frap-crossing@1',
  'hand-twist-long-sectioned-cord@1',
];

/** Packages registered before `pkg` that the snapshot covered, in registry order. */
export function packagesBefore(pkg: V7Package): V7Package[] {
  return V7_PACKAGES.slice(0, V7_PACKAGES.indexOf(pkg)).filter(
    (p) =>
      !MERGED_AFTER_GOAL_PAIR_SNAPSHOTS.includes(
        `${p.id}@${String(p.version)}`,
      ),
  );
}
