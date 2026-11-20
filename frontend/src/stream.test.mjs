import test from 'node:test';
import assert from 'node:assert/strict';
import { consumeSSE, parseEventBlock } from './stream.js';
import { draftKey, readDraft, writeDraft, runRecovery, canRestoreQuestion } from './recovery.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
}
test('conversation drafts remain isolated by project and conversation', () => {
  const store = memoryStorage();
  writeDraft(store, 'P1', 'C1', { text: '项目一的草稿', mode: 'plan' });
  writeDraft(store, 'P1', 'C2', { text: '另一段会话', mode: 'chat' });
  writeDraft(store, 'P2', 'C1', { text: '另一个项目', mode: 'chat' });
  assert.equal(readDraft(store, 'P1', 'C1').text, '项目一的草稿');
  assert.equal(readDraft(store, 'P1', 'C1').mode, 'plan');
  assert.equal(readDraft(store, 'P2', 'C1').text, '另一个项目');
  assert.equal(readDraft(store, 'P1', null), null);
  assert.notEqual(draftKey('P1', null), draftKey('P1', 'new'));
});
test('invalid and unavailable draft storage does not discard the current input', () => {
  const store = memoryStorage();
  store.setItem(draftKey('P', 'C'), 'not json');
  assert.equal(readDraft(store, 'P', 'C'), null);
  const broken = {
    getItem() {
      throw new Error('storage disabled');
    },
    setItem() {
      throw new Error('quota exceeded');
    },
  };
  assert.equal(readDraft(broken, 'P', 'C'), null);
  assert.equal(writeDraft(broken, 'P', 'C', { text: '仍保留在输入框的文字' }), false);
});
test('running recovery is a resubscribe action, terminal recovery is an explicit new attempt', () => {
  const messages = [
    { role: 'user', run_id: 'old', content: '旧问题' },
    { role: 'user', run_id: 'current', content: '本次问题' },
  ];
  const running = runRecovery(messages, [
    { id: 'current', status: 'running', mode: 'plan' },
    { id: 'old', status: 'failed' },
  ]);
  assert.equal(running.kind, 'resume');
  assert.equal(running.text, '本次问题');
  const failed = runRecovery(messages, [{ id: 'current', status: 'failed', mode: 'plan' }]);
  assert.equal(failed.kind, 'retry');
  assert.equal(failed.mode, 'plan');
  assert.equal(runRecovery(messages, [{ id: 'current', status: 'completed' }]), null);
});
test('stopped runs can be retried without replacing a different unsent draft', () => {
  const recovery = runRecovery(
    [{ role: 'user', run_id: 'R', content: '原问题' }],
    [{ id: 'R', status: 'cancelled' }],
  );
  assert.equal(recovery.kind, 'retry');
  assert.equal(canRestoreQuestion('正在写的新问题', recovery.text), false);
  assert.equal(canRestoreQuestion('', recovery.text), true);
  assert.equal(canRestoreQuestion(' 原问题 ', recovery.text), true);
});
import {
  listValue,
  taskDependencies,
  workflowStep,
  filteredDocuments,
  filteredTasks,
  taskPayload,
  toggleId,
} from './workflow.js';

test('task link editing toggles IDs without mutating persisted values', () => {
  const original = ['A'];
  assert.deepEqual(toggleId(original, 'B'), ['A', 'B']);
  assert.deepEqual(toggleId('["A","B"]', 'A'), ['B']);
  assert.deepEqual(original, ['A']);
});
test('task updates normalize old JSON links and send only editable fields', () => {
  const value = taskPayload(
    {
      id: 'internal',
      project_id: 'P1',
      title: '页面联调',
      status: 'todo',
      dependencies: '["A"]',
      requirement_ids: '["R1"]',
    },
    'doing',
  );
  assert.equal(value.status, 'doing');
  assert.deepEqual(value.dependencies, ['A']);
  assert.deepEqual(value.requirement_ids, ['R1']);
  assert.equal('project_id' in value, false);
  assert.deepEqual(taskPayload({ title: '新任务' }).dependencies, []);
});
test('task search combines keyword, priority, and status', () => {
  const tasks = [
    {
      id: 'A',
      title: '发布表单',
      description: '处理错误',
      acceptance: '空输入不可提交',
      priority: 'high',
      status: 'doing',
    },
    { id: 'B', title: '发布表单设计', priority: 'medium', status: 'todo' },
  ];
  assert.deepEqual(
    filteredTasks(tasks, { query: '发布 错误', priority: 'high', status: 'doing' }).map(
      (t) => t.id,
    ),
    ['A'],
  );
  assert.equal(filteredTasks(tasks, { query: '不可提交' }).length, 1);
  assert.equal(filteredTasks(tasks, { priority: 'high', status: 'done' }).length, 0);
});

test('task dependencies accept both persisted JSON and decoded arrays', () => {
  const tasks = [
    { id: 'A', title: '接口准备', status: 'done' },
    { id: 'B', title: '页面联调', status: 'todo' },
  ];
  assert.deepEqual(listValue('not-json'), []);
  assert.deepEqual(taskDependencies({ dependencies: '["A","B"]' }, tasks), [
    { id: 'A', title: '接口准备', done: true },
    { id: 'B', title: '页面联调', done: false },
  ]);
  assert.equal(taskDependencies({ dependencies: ['missing'] }, tasks)[0].done, false);
});
test('project flow distinguishes unconfirmed requirements and candidate plans', () => {
  assert.equal(workflowStep([], [], []), 'requirements');
  assert.equal(workflowStep([{ id: 'R1' }], [], []), 'plan');
  assert.equal(workflowStep([{ id: 'R1' }], [{ status: 'proposed' }], []), 'confirm');
  assert.equal(workflowStep([{ id: 'R1' }], [{ status: 'applied' }], []), 'tasks');
  assert.equal(
    workflowStep([{ id: 'R1' }], [{ status: 'proposed' }, { status: 'applied' }], []),
    'confirm',
  );
});
test('document search matches all query terms across title and source', () => {
  const docs = [
    { id: 'A', title: 'React 状态', source: 'https://react.dev', kind: 'official' },
    { id: 'B', title: '任务模板', kind: 'guide' },
  ];
  assert.equal(filteredDocuments(docs, 'official', 'react 状态')[0].id, 'A');
  assert.equal(filteredDocuments(docs, 'guide', 'react').length, 0);
  assert.equal(filteredDocuments(docs, 'all', '   ').length, 2);
});
test('document topics combine with type and keyword filtering', () => {
  const docs = [
    { id: 'A', title: '表单', kind: 'official', category: 'frontend' },
    { id: 'B', title: '验收', kind: 'guide', category: 'planning' },
  ];
  assert.equal(filteredDocuments(docs, 'all', '组件', 'frontend')[0].id, 'A');
  assert.equal(filteredDocuments(docs, 'official', '', 'planning').length, 0);
  assert.equal(filteredDocuments(docs, 'guide', '', 'planning')[0].id, 'B');
});
test('ignores keepalive and reads CRLF events', () => {
  assert.equal(parseEventBlock(': heartbeat'), null);
  assert.deepEqual(parseEventBlock('event: test\r\ndata: {"text":"中文"}'), { text: '中文' });
});
test('preserves Chinese and JSON split across arbitrary network bytes', async () => {
  const input =
    ': heartbeat\n\nid: 1\nevent: message.delta\ndata: {"type":"message.delta","data":{"text":"你好，课题工坊"}}\n\nevent: run.completed\ndata: {"type":"run.completed"}\n\n';
  const bytes = new TextEncoder().encode(input);
  let cursor = 0;
  const stream = new ReadableStream({
    pull(controller) {
      if (cursor >= bytes.length) return controller.close();
      controller.enqueue(bytes.slice(cursor, cursor + 2));
      cursor += 2;
    },
  });
  const events = [];
  await consumeSSE(new Response(stream), (e) => events.push(e));
  assert.equal(events.length, 2);
  assert.equal(events[0].data.text, '你好，课题工坊');
  assert.equal(events[1].type, 'run.completed');
});
