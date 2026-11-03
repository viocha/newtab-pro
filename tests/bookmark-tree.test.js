import { expect, test } from 'bun:test';
import { getDirectChildCounts } from '../entrypoints/newtab/bookmark-tree';

test('直接孩子数量包含书签和文件夹，不累计孙级节点', () => {
  const counts = getDirectChildCounts([{
    id: 'root', children: [
      { id: 'bookmark', url: 'https://example.com' },
      { id: 'folder', children: [{ id: 'nested', url: 'https://example.org' }] },
      { id: 'empty', children: [] },
    ],
  }]);
  expect([...counts]).toEqual([['root', 3], ['folder', 1], ['empty', 0]]);
  expect(getDirectChildCounts([{ id: 'empty' }]).get('empty')).toBe(0);
});
