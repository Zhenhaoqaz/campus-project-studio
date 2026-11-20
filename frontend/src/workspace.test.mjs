import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PREFERENCES,
  normalizePreferences,
  readPreferences,
  writePreferences,
  shouldSendKey,
} from './preferences.js';
import { collaborationStages, mentionedTaskRecords } from './chatModes.js';
import { readDraft, writeDraft, runRecovery } from './recovery.js';

test('settings preserve supported choices while rejecting malformed stored fields', () => {
  assert.deepEqual(
    normalizePreferences({
      readingSize: 'huge',
      contrast: null,
      autoScroll: 'false',
      sendShortcut: 'mod-enter',
    }),
    { ...DEFAULT_PREFERENCES, sendShortcut: 'mod-enter' },
  );
  let text = 'not-json';
  const storage = {
    getItem: () => text,
    setItem: (_key, value) => {
      text = value;
    },
  };
  assert.deepEqual(readPreferences(storage), DEFAULT_PREFERENCES);
  assert.equal(
    writePreferences(storage, {
      ...DEFAULT_PREFERENCES,
      readingSize: 'large',
      sourcesVisible: false,
    }),
    true,
  );
  assert.equal(readPreferences(storage).readingSize, 'large');
  assert.equal(readPreferences(storage).sourcesVisible, false);
  assert.equal(DEFAULT_PREFERENCES.readingSize, 'standard');
});
test('unavailable preference storage keeps usable defaults and reports failed writes', () => {
  const storage = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('full');
    },
  };
  assert.deepEqual(readPreferences(storage), DEFAULT_PREFERENCES);
  assert.equal(writePreferences(storage, DEFAULT_PREFERENCES), false);
});
test('send shortcuts preserve Chinese composition and intentional line breaks', () => {
  const enter = { key: 'Enter' };
  assert.equal(shouldSendKey(enter, DEFAULT_PREFERENCES), true);
  for (const extra of [
    { shiftKey: true },
    { altKey: true },
    { isComposing: true },
    { nativeEvent: { isComposing: true } },
    { keyCode: 229 },
  ])
    assert.equal(shouldSendKey({ ...enter, ...extra }, DEFAULT_PREFERENCES), false);
  const manual = { ...DEFAULT_PREFERENCES, sendShortcut: 'mod-enter' };
  assert.equal(shouldSendKey(enter, manual), false);
  assert.equal(shouldSendKey({ ...enter, ctrlKey: true }, manual), true);
  assert.equal(shouldSendKey({ ...enter, metaKey: true }, manual), true);
  assert.equal(shouldSendKey({ ...enter, ctrlKey: true, shiftKey: true }, manual), false);
});
test('role conversation drafts and explicit recovery retain the intended recipient', () => {
  const values = new Map(),
    storage = {
      getItem: (key) => values.get(key),
      setItem: (key, value) => values.set(key, value),
    };
  writeDraft(storage, 'P', 'C', { text: '先讨论范围', mode: 'planner' });
  assert.equal(readDraft(storage, 'P', 'C').mode, 'planner');
  const recovery = runRecovery(
    [{ role: 'user', run_id: 'R', content: '检查依赖' }],
    [{ id: 'R', mode: 'reviewer', status: 'failed' }],
  );
  assert.equal(recovery.mode, 'reviewer');
  assert.equal(recovery.kind, 'retry');
});
test('planning progress does not claim a candidate exists after role output alone', () => {
  const messages = [
    { run_id: 'R', role: 'planner', status: 'complete' },
    { run_id: 'R', role: 'reviewer', status: 'complete' },
  ];
  const stages = collaborationStages({ id: 'R', mode: 'plan', status: 'running' }, messages);
  assert.equal(stages.find((item) => item.key === 'candidate').state, 'active');
  const completed = collaborationStages({ id: 'R', mode: 'plan', status: 'completed' }, messages, [
    { run_id: 'R', status: 'proposed' },
  ]);
  assert.equal(completed.find((item) => item.key === 'candidate').state, 'done');
  assert.equal(completed.find((item) => item.key === 'candidate').label, '生成候选计划');
});
test('interrupted role progress keeps completed stages and leaves later work unstarted', () => {
  const stages = collaborationStages({ id: 'R', mode: 'plan', status: 'cancelled' }, [
    { run_id: 'R', role: 'planner', status: 'interrupted' },
  ]);
  assert.deepEqual(
    stages.map((item) => item.state),
    ['done', 'stopped', 'waiting', 'waiting'],
  );
  const failed = collaborationStages({ id: 'F', mode: 'reviewer', status: 'failed' }, []);
  assert.deepEqual(
    failed.map((item) => item.state),
    ['failed', 'waiting'],
  );
});

test('task record controls resolve only supplied task IDs and keep T1 distinct from T10', () => {
  const evidence = [
    { id: 'T1', kind: 'task' },
    { id: 'T10', kind: 'task' },
    { id: 'S1', kind: 'guide' },
  ];
  assert.deepEqual(
    mentionedTaskRecords('先看 T10，然后核对 [S1]。', evidence).map((item) => item.id),
    ['T10'],
  );
  assert.deepEqual(mentionedTaskRecords('不存在的 T99 不能生成任务按钮。', evidence), []);
});
