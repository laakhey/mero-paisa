import { LOCK_GRACE_MS, needsRelock } from '../app-lock';

const left = 1_000_000;

describe('needsRelock', () => {
  it('stays unlocked when coming back within five minutes', () => {
    expect(needsRelock(left, left)).toBe(false);
    expect(needsRelock(left, left + 30_000)).toBe(false);
    expect(needsRelock(left, left + LOCK_GRACE_MS - 1)).toBe(false);
  });
  it('locks again once five minutes have passed', () => {
    expect(LOCK_GRACE_MS).toBe(300_000);
    expect(needsRelock(left, left + LOCK_GRACE_MS)).toBe(true);
    expect(needsRelock(left, left + 3_600_000)).toBe(true);
  });
  it('locks if the clock moved backwards', () => {
    expect(needsRelock(left, left - 1)).toBe(true);
  });
});
