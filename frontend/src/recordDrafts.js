import { TASK_FIELDS } from './taskEditing.js';
import { listValue } from './workflow.js';

export const FORM_FIELDS = {
  newProject: {
    name: '项目名称',
    course: '所属课程',
    brief: '项目想法',
    deadline: '截止日期',
    skills: '技术基础',
    budget: '时间与其他约束',
  },
  requirement: { text: '要求或约束', kind: '类型', source: '来源' },
  task: TASK_FIELDS,
};
FORM_FIELDS.editProject = FORM_FIELDS.newProject;

export function formKey(type, projectId, id) {
  if (!Object.hasOwn(FORM_FIELDS, type)) return null;
  const owner = type === 'newProject' ? 'workspace' : projectId;
  return ['campus-form-v1', type, owner, id || 'new'].map(encodeURIComponent).join(':');
}

export function formValues(type, record) {
  const values = Object.fromEntries(
    Object.keys(FORM_FIELDS[type]).map((field) => {
      const value = record[field];
      if (field === 'dependencies' || field === 'requirement_ids')
        return [field, listValue(value).filter((id) => typeof id === 'string')];
      const defaults = {
        course: '未指定课程',
        kind: 'personal',
        source: '用户确认',
        priority: 'medium',
        status: 'todo',
      };
      return [field, typeof value === 'string' ? value : (defaults[field] ?? '')];
    }),
  );
  return values;
}

export function dirtyForm(type, base, value) {
  return JSON.stringify(formValues(type, base)) !== JSON.stringify(formValues(type, value));
}

function parseDraft(raw, type, current) {
  try {
    const draft = JSON.parse(raw);
    if (!draft?.base || !draft?.value || draft.base.id !== (current.id || null)) return null;
    if (current.id && !/^[0-9a-f]{64}$/.test(draft.base.version)) return null;
    const base = { ...current, ...formValues(type, draft.base), version: draft.base.version };
    return { base, value: { ...base, ...formValues(type, draft.value) } };
  } catch {
    return null;
  }
}

export function openFormDraft(storage, key, type, current) {
  let observed;
  try {
    observed = storage.getItem(key);
  } catch {
    observed = undefined;
  }

  function update(next) {
    try {
      const actual = storage.getItem(key);
      if (actual === next) {
        observed = actual;
        return 'saved';
      }
      if (actual !== observed) return 'other-tab';
      if (next === null) storage.removeItem(key);
      else storage.setItem(key, next);
      observed = next;
      return 'saved';
    } catch {
      return 'unavailable';
    }
  }

  return {
    type,
    restored: parseDraft(observed, type, current),
    save(base, value) {
      return update(
        dirtyForm(type, base, value)
          ? JSON.stringify({
              base: { ...formValues(type, base), id: base.id || null, version: base.version },
              value: formValues(type, value),
            })
          : null,
      );
    },
    discard: () => update(null),
  };
}

export function deletePath(path, version) {
  return path + (version ? '?expected_version=' + encodeURIComponent(version) : '');
}
