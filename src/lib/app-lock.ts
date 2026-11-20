/** How long the app stays unlocked after the user leaves it. */
export const LOCK_GRACE_MS = 5 * 60 * 1000;

/**
 * Whether returning to the app must ask for biometrics again.
 *
 * Within the grace period it does not, so quickly switching to another app
 * and back is not interrupted. A clock that moved backwards (the user changed
 * the time) is treated as expired rather than trusted.
 */
export function needsRelock(leftAt: number, now: number, graceMs = LOCK_GRACE_MS): boolean {
  return now < leftAt || now - leftAt >= graceMs;
}
