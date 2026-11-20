import test from 'node:test';
import assert from 'node:assert/strict';
import {
  editablePlan,
  manualPlanPayload,
  manualPlanProblems,
  nextTaskKey,
  readPlanDraft,
  writePlanDraft,
  clearPlanDraft,
  planDraftKey,
} from './planEditing.js';

const source = {
  summary: '原计划',
  milestones: ['先做核心'],
  risks: [],
  tasks: [
    {
      key: 'T1',
      title: '实现列表',
      description: '实现筛选列表',
      acceptance: '能够按分类筛选',
      priority: 'high',
      requirement_ids: ['r1'],
      dependencies: [],
    },
  ],
};
const requirements = [
  { id: 'r1', kind: 'teacher' },
  { id: 'r2', kind: 'teacher' },
];

test('manual editing preserves the source snapshot and never reuses a removed source task key', () => {
  const draft = editablePlan(source);
  draft.tasks[0].requirement_ids.push('r2');
  draft.tasks[0].description = '加入要求二的工作';
  assert.deepEqual(source.tasks[0].requirement_ids, ['r1']);
  assert.equal(source.tasks[0].description, '实现筛选列表');
  assert.equal(nextTaskKey([], source.tasks), 'T2');
});

test('requirement numbers alone do not repair a plan; concrete edited work is required', () => {
  const draft = editablePlan(source);
  draft.tasks[0].requirement_ids.push('r2');
  draft.tasks[0].description = ' 实现筛选列表 \n';
  assert.ok(
    manualPlanProblems(source, draft, requirements).some((text) => text.includes('不能只补编号')),
  );
  draft.tasks[0].acceptance += '，并检查报告中的数据流说明';
  assert.deepEqual(manualPlanProblems(source, draft, requirements), []);
});

test('removed requirements and dangling dependencies stay visible as errors', () => {
  const draft = editablePlan(source);
  draft.tasks[0].dependencies = ['T2'];
  const problems = manualPlanProblems(source, draft, []);
  assert.ok(problems.some((text) => text.includes('已移除的要求')));
  assert.ok(problems.some((text) => text.includes('无效或自指')));
});

test('payload retains only editable fields and the checked context version', () => {
  const draft = { ...editablePlan(source), edited_by: 'model', validation: { complete: true } };
  draft.summary = ' 人工新概述 ';
  const payload = manualPlanPayload(draft, 'current-hash');
  assert.equal(payload.summary, '人工新概述');
  assert.equal(payload.context_fingerprint, 'current-hash');
  assert.equal(payload.edited_by, undefined);
  assert.equal(payload.validation, undefined);
});

test('unsaved plan drafts remain separate by project and source version and clear after discard', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  writePlanDraft(storage, 'P1', 'V1', source);
  writePlanDraft(storage, 'P2', 'V1', { ...source, summary: '另一个项目' });
  assert.equal(readPlanDraft(storage, 'P1', 'V1').draft.summary, '原计划');
  assert.equal(readPlanDraft(storage, 'P2', 'V1').draft.summary, '另一个项目');
  assert.equal(readPlanDraft(storage, 'P1', 'V2'), null);
  assert.equal(clearPlanDraft(storage, 'P1', 'V1'), true);
  assert.equal(readPlanDraft(storage, 'P1', 'V1'), null);
  assert.notEqual(readPlanDraft(storage, 'P2', 'V1'), null);
});

test('malformed or unavailable plan storage cannot crash the editor or mutate its input', () => {
  const invalid = {
    getItem: () =>
      JSON.stringify({ version: 1, updatedAt: 'today', draft: { ...source, tasks: 'broken' } }),
  };
  assert.equal(readPlanDraft(invalid, 'P', 'V'), null);
  const blocked = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('full');
    },
    removeItem() {
      throw new Error('blocked');
    },
  };
  assert.equal(readPlanDraft(blocked, 'P', 'V'), null);
  assert.equal(writePlanDraft(blocked, 'P', 'V', source), false);
  assert.equal(clearPlanDraft(blocked, 'P', 'V'), false);
  assert.equal(source.tasks[0].title, '实现列表');
  assert.notEqual(planDraftKey('P:V', '1'), planDraftKey('P', 'V:1'));
});
