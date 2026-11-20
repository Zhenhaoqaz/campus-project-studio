import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTaskMerge, resolveTaskMerge } from './taskEditing.js';
import { taskPayload } from './workflow.js';
import {
  resolveBrowserStorage,
  readStoredValue,
  writeStoredValue,
  removeStoredValue,
  normalizeView,
} from './storage.js';
import { readPreferences, writePreferences, DEFAULT_PREFERENCES } from './preferences.js';
import { readDraft, writeDraft } from './recovery.js';
import { messageState } from './messageState.js';
import { formKey, openFormDraft } from './recordDrafts.js';
import { previousTaskScope, taskSelection } from './discussionSelection.js';

test('scope reuse takes IDs from the latest task receipt, ignoring later general replies', () => {
  const tasks = [{ id: 'first' }, { id: 'form' }];
  const first = {
    task_scope: { explicit: true, used: 1 },
    evidence: [{ kind: 'task', doc_id: 'first' }],
  };
  const latest = {
    task_scope: { explicit: true, used: 1 },
    evidence: [{ kind: 'teacher', doc_id: 'first' }, { kind: 'task', doc_id: 'form' }],
  };
  assert.deepEqual(previousTaskScope([first, latest, { role: 'assistant' }], tasks),
    { value: ['form'], missing: 0, canReuse: true });
  assert.equal(previousTaskScope([{ ...latest, evidence: [] }], tasks), undefined);
});

test('scope reuse keeps all and zero distinct and flags unavailable task IDs', () => {
  const tasks = [{ id: 'form' }];
  const reply = (explicit, ids) => ({
    task_scope: { explicit, used: ids.length },
    evidence: ids.map((id) => ({ kind: 'task', doc_id: id })),
  });
  assert.deepEqual(previousTaskScope([reply(false, ['old'])], tasks),
    { value: null, missing: 0, canReuse: true });
  assert.deepEqual(previousTaskScope([reply(true, [])], tasks),
    { value: [], missing: 0, canReuse: true });
  assert.deepEqual(previousTaskScope([reply(true, ['old', 'form'])], tasks),
    { value: ['form'], missing: 1, canReuse: true });
  assert.deepEqual(previousTaskScope([reply(true, ['old'])], tasks),
    { value: [], missing: 1, canReuse: false });
  assert.equal(taskSelection(['form', 'old'], tasks).missing, 1);
});

test('ordinary form drafts restore against their original version and are isolated by record', () => {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
  for (const [type, field] of [['editProject', 'brief'], ['requirement', 'text'], ['task', 'title']]) {
    const base = { id: 'record', version: 'a'.repeat(64), [field]: '原文' };
    const key = formKey(type, 'P1', base.id);
    assert.equal(openFormDraft(storage, key, type, base).save(base, {...base, [field]: '草稿'}), 'saved');
    const other = openFormDraft(storage, formKey(type, 'P2', base.id), type, base);
    assert.equal(other.restored, null);
    const current = {...base, version: 'b'.repeat(64), [field]: '新记录'};
    const recovered = openFormDraft(storage, key, type, current);
    assert.equal(recovered.restored.base.version, base.version);
    assert.equal(recovered.restored.base[field], '原文');
    assert.equal(recovered.restored.value[field], '草稿');
  }
});

test('stale form sessions cannot erase or replace another tab’s draft', () => {
  let value = null;
  const storage = {
    getItem: () => value,
    setItem: (_, next) => { value = next; },
    removeItem: () => { value = null; },
  };
  const base = { name: '', brief: '' };
  const stale = openFormDraft(storage, 'record', 'newProject', base);
  const current = openFormDraft(storage, 'record', 'newProject', base);
  assert.equal(current.save(base, {name: '另一窗口'}), 'saved');
  assert.equal(stale.discard(), 'other-tab');
  assert.equal(stale.save(base, {name: '本窗口'}), 'other-tab');
  assert.equal(openFormDraft(storage, 'record', 'newProject', base).restored.value.name, '另一窗口');
  storage.setItem = () => { throw new Error('quota'); };
  assert.equal(current.save(base, {name: '暂存失败'}), 'unavailable');
});

const original = {
  id: 'task-a',
  project_id: 'P1',
  title: '列表联调',
  description: '原说明',
  acceptance: '原验收',
  status: 'todo',
  priority: 'medium',
  dependencies: ['before'],
  requirement_ids: ['R1'],
  version: '1'.repeat(64),
};

test('task merge preserves independent edits and adopts the latest version without changing snapshots', () => {
  const local = { ...original, description: '我的新说明' };
  const current = {
    ...original,
    acceptance: '另一窗口的新验收',
    status: 'doing',
    version: '2'.repeat(64),
  };
  const before = JSON.stringify([original, local, current]);
  const analysis = analyzeTaskMerge(original, local, current);
  const result = resolveTaskMerge(analysis);
  assert.equal(result.description, '我的新说明');
  assert.equal(result.acceptance, '另一窗口的新验收');
  assert.equal(result.status, 'doing');
  assert.equal(taskPayload(result).expected_version, current.version);
  assert.equal(JSON.stringify([original, local, current]), before);
  result.dependencies.push('new');
  assert.deepEqual(current.dependencies, ['before']);
});

test('both-sided text and relationship changes require an explicit choice for each conflict', () => {
  const local = { ...original, description: '我的说明', requirement_ids: ['R1', 'R2'] };
  const current = {
    ...original,
    description: '当前说明',
    requirement_ids: ['R3'],
    version: '2'.repeat(64),
  };
  const analysis = analyzeTaskMerge(original, local, current);
  assert.deepEqual(
    analysis.fields.filter((row) => row.conflict).map((row) => row.field),
    ['description', 'requirement_ids'],
  );
  assert.equal(resolveTaskMerge(analysis), null);
  assert.equal(resolveTaskMerge(analysis, { description: 'local' }), null);
  const result = resolveTaskMerge(analysis, { description: 'local', requirement_ids: 'current' });
  assert.equal(result.description, '我的说明');
  assert.deepEqual(result.requirement_ids, ['R3']);
});

test('identical edits, link ordering and JSON link storage do not invent conflicts', () => {
  const base = { ...original, requirement_ids: ['R1', 'R2'] };
  const local = { ...base, description: '相同说明', requirement_ids: '["R2","R1"]' };
  const current = { ...base, description: '相同说明' };
  const analysis = analyzeTaskMerge(base, local, current);
  assert.equal(
    analysis.fields.some((row) => row.conflict),
    false,
  );
  assert.equal(resolveTaskMerge(analysis).description, '相同说明');
});

test('blocked localStorage access still allows reads while reporting unsuccessful writes', () => {
  const browser = Object.defineProperty({}, 'localStorage', {
    get() {
      throw new Error('SecurityError');
    },
  });
  const storage = resolveBrowserStorage(browser);
  assert.equal(readStoredValue(storage, 'campus-project', 'campus-demo'), 'campus-demo');
  assert.equal(normalizeView(readStoredValue(storage, 'campus-view')), 'overview');
  assert.equal(writeStoredValue(storage, 'campus-project', 'new'), false);
  assert.equal(removeStoredValue(storage, 'key'), false);
  assert.deepEqual(readPreferences(storage), DEFAULT_PREFERENCES);
  assert.equal(writePreferences(storage, DEFAULT_PREFERENCES), false);
  assert.equal(readDraft(storage, 'P1', null), null);
  assert.equal(
    writeDraft(storage, 'P1', null, { text: '未丢失的内存草稿', mode: 'reviewer' }),
    false,
  );
});

test('storage method failures and invalid remembered views use supported fallbacks', () => {
  const storage = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('quota');
    },
    removeItem() {
      throw new Error('blocked');
    },
  };
  assert.equal(readStoredValue(storage, 'key', 'fallback'), 'fallback');
  assert.equal(writeStoredValue(storage, 'key', 'value'), false);
  for (const value of [null, 'unknown', 'TASKS', 'settings', ''])
    assert.equal(normalizeView(value), 'overview');
  assert.equal(normalizeView('tasks'), 'tasks');
  const map = new Map();
  const working = {
    getItem: (key) => map.get(key),
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
  };
  assert.equal(writeStoredValue(working, 'key', 'value'), true);
  assert.equal(readStoredValue(working, 'key'), 'value');
  assert.equal(removeStoredValue(working, 'key'), true);
});

test('message labels separate saved output from citation checks and interruption', () => {
  assert.equal(messageState({ status: 'complete' }).label, '已保存 · 内容需核对');
  assert.match(messageState({ status: 'unverified' }).note, /未通过引用检查/);
  assert.match(messageState({ status: 'interrupted' }).note, /部分输出/);
  assert.equal(messageState({ status: 'streaming' }).tone, 'pending');
  assert.equal(messageState({ status: 'unknown' }).label, '状态待确认');
});
