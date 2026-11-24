/** The coding conversation that completed a development handoff, recorded as it actually was.
 * Every retained archive through ex13 was developed by Codex; Claude records only new handoffs. */
export type DevelopmentReviewer =
  'current-codex-conversation' | 'current-claude-conversation';

export const DEVELOPMENT_REVIEWERS: readonly DevelopmentReviewer[] = [
  'current-codex-conversation',
  'current-claude-conversation',
];

export function isDevelopmentReviewer(
  value: unknown,
): value is DevelopmentReviewer {
  return DEVELOPMENT_REVIEWERS.some((reviewer) => reviewer === value);
}
