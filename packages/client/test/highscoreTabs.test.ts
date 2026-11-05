import { describe, expect, it } from 'vitest';
import {
  allCategories,
  categoryKey,
  pickCategory,
  visibleTabs,
  type Category,
} from '../src/ui/highscoreTable.js';

const counts = (rows: Record<string, number>) => new Map(Object.entries(rows));

describe('Leaderboard: hide tabs without results', () => {
  it('lists every board+size category once (ALL only on the marines board)', () => {
    const cats = allCategories(3).map(categoryKey);
    expect(cats).toEqual([
      'squads:1',
      'squads:2',
      'squads:3',
      'marines:0',
      'marines:1',
      'marines:2',
      'marines:3',
    ]);
  });

  it('shows only boards and sizes that have rows', () => {
    const tabs = visibleTabs(
      counts({ 'squads:2': 3, 'squads:4': 1, 'marines:0': 5, 'marines:2': 4, 'marines:1': 0 }),
      4,
    );
    expect(tabs.boards).toEqual(['squads', 'marines']);
    expect(tabs.sizes.squads).toEqual([2, 4]);
    expect(tabs.sizes.marines).toEqual([0, 2]);
  });

  it('hides a board whose tables are all empty', () => {
    const tabs = visibleTabs(counts({ 'squads:1': 2 }), 4);
    expect(tabs.boards).toEqual(['squads']);
    expect(tabs.sizes.marines).toEqual([]);
  });

  it('shows no tabs at all when everything is empty (normal "no runs" message)', () => {
    const tabs = visibleTabs(counts({}), 4);
    expect(tabs.boards).toEqual([]);
    expect(tabs.sizes).toEqual({ squads: [], marines: [] });
    const want: Category = { board: 'squads', ts: 1 };
    expect(pickCategory(want, tabs)).toEqual(want);
  });

  it('keeps a non-empty selection, else falls back to the first non-empty one', () => {
    const tabs = visibleTabs(
      counts({ 'squads:3': 1, 'squads:5': 1, 'marines:0': 2, 'marines:3': 1 }),
      8,
    );
    expect(pickCategory({ board: 'squads', ts: 5 }, tabs)).toEqual({ board: 'squads', ts: 5 });
    // SOLO empty → first non-empty size of the same board
    expect(pickCategory({ board: 'squads', ts: 1 }, tabs)).toEqual({ board: 'squads', ts: 3 });
    expect(pickCategory({ board: 'marines', ts: 5 }, tabs)).toEqual({ board: 'marines', ts: 0 });
    // whole board empty → first non-empty board
    const onlyMarines = visibleTabs(counts({ 'marines:0': 1, 'marines:2': 1 }), 8);
    expect(pickCategory({ board: 'squads', ts: 1 }, onlyMarines)).toEqual({
      board: 'marines',
      ts: 0,
    });
  });
});
