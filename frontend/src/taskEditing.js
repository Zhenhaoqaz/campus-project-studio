import { listValue, taskPayload } from './workflow.js';

export const TASK_FIELDS = {
  title: '任务名称',
  description: '任务说明',
  status: '状态',
  priority: '优先级',
  acceptance: '验收标准',
  dependencies: '前置任务',
  requirement_ids: '关联要求',
};

function normalized(task) {
  const payload = taskPayload(task);
  return Object.fromEntries(Object.keys(TASK_FIELDS).map((field) => [field, payload[field]]));
}

function equal(field, left, right) {
  if (field === 'dependencies' || field === 'requirement_ids')
    return (
      JSON.stringify([...new Set(listValue(left))].sort()) ===
      JSON.stringify([...new Set(listValue(right))].sort())
    );
  return left === right;
}

export function analyzeTaskMerge(base, local, current) {
  return analyzeRecordMerge(base, local, current, TASK_FIELDS, normalized);
}

export function analyzeRecordMerge(base, local, current, labels, normalize) {
  const original = normalize(base),
    mine = normalize(local),
    latest = normalize(current);
  const fields = Object.entries(labels).map(([field, label]) => {
    const localChanged = !equal(field, original[field], mine[field]);
    const remoteChanged = !equal(field, original[field], latest[field]);
    return {
      field,
      label,
      original: original[field],
      local: mine[field],
      current: latest[field],
      localChanged,
      remoteChanged,
      conflict: localChanged && remoteChanged && !equal(field, mine[field], latest[field]),
    };
  });
  return { current: { ...current }, fields };
}

export function resolveTaskMerge(analysis, choices = {}) {
  const result = { ...analysis.current };
  for (const row of analysis.fields) {
    if (row.conflict && !['local', 'current'].includes(choices[row.field])) return null;
    const value = row.conflict
      ? row[choices[row.field]]
      : row.localChanged
        ? row.local
        : row.current;
    result[row.field] = Array.isArray(value) ? [...value] : value;
  }
  return result;
}
