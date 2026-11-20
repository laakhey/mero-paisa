/** Pure decision for month swiping, kept separate so it can be unit tested. */

/** Minimum horizontal travel, in points, for a deliberate swipe. */
export const SWIPE_DISTANCE = 60;
/** A quick flick counts even if it travels less. */
export const SWIPE_VELOCITY = 500;

/**
 * Like turning pages: swiping left (finger moves toward the left edge) goes to
 * the next month, swiping right goes back. Returns the month step, or 0 for a
 * movement too small or slow to count.
 */
export function swipeStep(translationX: number, velocityX: number): -1 | 0 | 1 {
  if (translationX <= -SWIPE_DISTANCE || (translationX < 0 && velocityX <= -SWIPE_VELOCITY)) return 1;
  if (translationX >= SWIPE_DISTANCE || (translationX > 0 && velocityX >= SWIPE_VELOCITY)) return -1;
  return 0;
}
