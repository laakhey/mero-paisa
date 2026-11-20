import { splitCategories } from '../categories';

const names = ['Dining', 'Groceries', 'Transport', 'Housing', 'Health', 'Travel', 'Education'];
const categories = names.map((name, index) => ({ id: index + 1, name }));
const ids = (list: { id: number }[]) => list.map((c) => c.id);

describe('splitCategories', () => {
  it('shows the four most used and hides the rest behind search', () => {
    const result = splitCategories(categories, null, '');
    expect(ids(result.quick)).toEqual([1, 2, 3, 4]);
    expect(result.matches).toEqual([]);
    expect(result.hasMore).toBe(true);
  });

  it('searches only the categories that are not already shown', () => {
    const result = splitCategories(categories, null, ' tra ');
    // "Transport" is a quick pick already, so only "Travel" is a match.
    expect(ids(result.matches)).toEqual([6]);
  });

  it('is case-insensitive', () => {
    expect(ids(splitCategories(categories, null, 'EDU').matches)).toEqual([7]);
  });

  it('keeps a selection from outside the top four visible', () => {
    const result = splitCategories(categories, 6, 'tra');
    expect(ids(result.quick)).toEqual([1, 2, 3, 4, 6]);
    expect(result.matches).toEqual([]);
  });

  it('reports nothing more to search when everything fits', () => {
    const result = splitCategories(categories.slice(0, 3), null, 'x');
    expect(ids(result.quick)).toEqual([1, 2, 3]);
    expect(result.hasMore).toBe(false);
  });
});
