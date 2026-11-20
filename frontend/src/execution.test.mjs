import test from 'node:test';
import assert from 'node:assert/strict';
import {
  executionState,
  executionSummary,
  filterExecution,
  reviewQuestion,
  appendReviewDraft,
} from './execution.js';

const tasks = [
  {
    id: 'a',
    title: '接口',
    status: 'todo',
    priority: 'high',
    acceptance: '能返回列表',
    requirement_ids: '["r1"]',
    dependencies: [],
  },
  {
    id: 'b',
    title: '联调',
    status: 'doing',
    priority: 'high',
    acceptance: ' ',
    requirement_ids: ['r1', 'r1'],
    dependencies: ['a'],
  },
  {
    id: 'c',
    title: '已记录完成',
    status: 'done',
    acceptance: '',
    requirement_ids: ['personal'],
    dependencies: [],
  },
  {
    id: 'd',
    title: '布局',
    status: 'doing',
    priority: 'low',
    acceptance: '窄屏正常',
    dependencies: [],
  },
];
const requirements = [
  { id: 'r1', kind: 'teacher' },
  { id: 'r2', kind: 'teacher' },
  { id: 'personal', kind: 'personal' },
];

test('execution review counts actual teacher associations, including done tasks, without inventing coverage', () => {
  const summary = executionSummary(requirements, tasks);
  assert.equal(summary.teachers.length, 2);
  assert.equal(summary.linked, 1);
  assert.deepEqual(
    summary.teachers[0].tasks.map((t) => t.id),
    ['a', 'b'],
  );
  assert.deepEqual(
    summary.missingAcceptance.map((t) => t.id),
    ['b', 'c'],
  );
  assert.equal(executionSummary([], tasks).linked, 0);
  assert.equal(executionSummary(requirements, []).linked, 0);
});

test('next actions prioritize active unblocked work, exclude done tasks and never infer dependencies from order', () => {
  const before = JSON.stringify(tasks);
  assert.deepEqual(
    executionSummary(requirements, tasks).focus.map((t) => t.id),
    ['d', 'a'],
  );
  assert.equal(executionState(tasks[1], tasks), 'blocked');
  assert.equal(executionState({ ...tasks[1], dependencies: ['missing'] }, tasks), 'blocked');
  const completed = tasks.map((t) => (t.id === 'a' ? { ...t, status: 'done' } : t));
  assert.equal(executionState(completed[1], completed), 'ready');
  assert.equal(JSON.stringify(tasks), before);
});

test('execution filters evaluate prerequisites from the whole project and combine with requirement filters', () => {
  assert.deepEqual(
    filterExecution([tasks[1]], tasks, { readiness: 'blocked', requirementId: 'r1' }).map(
      (t) => t.id,
    ),
    ['b'],
  );
  assert.equal(
    filterExecution(tasks, tasks, { readiness: 'ready', requirementId: 'r2' }).length,
    0,
  );
  assert.deepEqual(
    filterExecution(tasks, tasks, { readiness: 'acceptance' }).map((t) => t.id),
    ['b', 'c'],
  );
  assert.equal(filterExecution(tasks, tasks, { requirementId: 'r1' }).length, 2);
});

test('review handoff keeps the original draft, avoids duplicate questions and refuses silent truncation', () => {
  const question = reviewQuestion(tasks[1]);
  assert.ok(question.includes('联调') && question.includes('不要创建或修改任务'));
  const original = '我的未发送问题\n第二行';
  const merged = appendReviewDraft(original, question);
  assert.equal(merged.text, `${original}\n\n${question}`);
  assert.deepEqual(appendReviewDraft(merged.text, question), merged);
  assert.deepEqual(appendReviewDraft(original, question, 10), { text: original, ok: false });
  assert.equal(appendReviewDraft('', reviewQuestion()).ok, true);
});
