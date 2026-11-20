import { swipeStep } from '../swipe';

describe('swipeStep', () => {
  it('goes to the next month on a left swipe and back on a right swipe', () => {
    expect(swipeStep(-80, -100)).toBe(1);
    expect(swipeStep(80, 100)).toBe(-1);
  });
  it('accepts a short but fast flick', () => {
    expect(swipeStep(-30, -900)).toBe(1);
    expect(swipeStep(30, 900)).toBe(-1);
  });
  it('ignores small or slow movements', () => {
    expect(swipeStep(-40, -100)).toBe(0);
    expect(swipeStep(10, 200)).toBe(0);
    expect(swipeStep(0, 0)).toBe(0);
  });
  it('ignores a flick that ends up moving the other way', () => {
    expect(swipeStep(20, -900)).toBe(0);
    expect(swipeStep(-20, 900)).toBe(0);
  });
});
