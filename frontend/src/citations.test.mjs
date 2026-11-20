import test from 'node:test';
import assert from 'node:assert/strict';
import { remarkCitations } from './citations.js';

test('turns grouped citations inside lists and emphasis into individual links', () => {
  const tree = {
    type: 'root',
    children: [
      {
        type: 'listItem',
        children: [
          { type: 'strong', children: [{ type: 'text', value: '依据 [S1, S3] 和 [R2]。' }] },
        ],
      },
    ],
  };
  remarkCitations()(tree);
  const children = tree.children[0].children[0].children;
  assert.deepEqual(
    children.filter((c) => c.type === 'link').map((c) => c.url),
    ['#evidence-S1', '#evidence-S3', '#evidence-R2'],
  );
});

test('leaves code and existing links unchanged', () => {
  const tree = {
    type: 'root',
    children: [
      { type: 'inlineCode', value: '[S1]' },
      { type: 'link', url: 'https://example.org', children: [{ type: 'text', value: '[S2]' }] },
    ],
  };
  const before = JSON.stringify(tree);
  remarkCitations()(tree);
  assert.equal(JSON.stringify(tree), before);
});

test('task record citations use the same accessible controls as requirements and documents', () => {
  const tree = { type: 'root', children: [{ type: 'text', value: '任务 [T1, S2]，原文 [R1]。' }] };
  remarkCitations()(tree);
  assert.deepEqual(
    tree.children.filter((node) => node.type === 'link').map((node) => node.url),
    ['#evidence-T1', '#evidence-S2', '#evidence-R1'],
  );
});
