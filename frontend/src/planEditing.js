import { listValue } from './workflow.js';

export function planDraftKey(projectId, planId) {
  return `campus-plan-draft:${encodeURIComponent(projectId)}:${encodeURIComponent(planId)}`;
}

export function readPlanDraft(storage, projectId, planId) {
  try {
    const text = storage.getItem(planDraftKey(projectId, planId));
    if (!text || text.length > 100000) return null;
    const saved = JSON.parse(text),
      value = saved.draft;
    const strings = (items, max) =>
      Array.isArray(items) &&
      items.length <= max &&
      items.every((item) => typeof item === 'string');
    if (
      saved.version !== 1 ||
      typeof saved.updatedAt !== 'string' ||
      !value ||
      typeof value.summary !== 'string' ||
      !strings(value.milestones, 6) ||
      !strings(value.risks, 10) ||
      !Array.isArray(value.tasks) ||
      value.tasks.length > 12 ||
      !value.tasks.every(
        (task) =>
          task &&
          ['key', 'title', 'description', 'acceptance'].every(
            (key) => typeof task[key] === 'string',
          ) &&
          ['high', 'medium', 'low'].includes(task.priority) &&
          strings(task.requirement_ids, 80) &&
          strings(task.dependencies, 80),
      )
    )
      return null;
    return { draft: editablePlan(value), updatedAt: saved.updatedAt };
  } catch {
    return null;
  }
}

export function writePlanDraft(storage, projectId, planId, draft) {
  try {
    const value = JSON.stringify({
      version: 1,
      updatedAt: new Date().toISOString(),
      draft: editablePlan(draft),
    });
    if (value.length > 100000) return false;
    storage.setItem(planDraftKey(projectId, planId), value);
    return true;
  } catch {
    return false;
  }
}

export function clearPlanDraft(storage, projectId, planId) {
  try {
    storage.removeItem(planDraftKey(projectId, planId));
    return true;
  } catch {
    return false;
  }
}

export function editablePlan(content) {
  return {
    summary: content.summary || '',
    milestones: [...(content.milestones || [])],
    risks: [...(content.risks || [])],
    tasks: (content.tasks || []).map((task) => ({
      key: task.key,
      title: task.title || '',
      description: task.description || '',
      priority: task.priority || 'medium',
      acceptance: task.acceptance || '',
      requirement_ids: [...listValue(task.requirement_ids)],
      dependencies: [...listValue(task.dependencies)],
    })),
  };
}

export function nextTaskKey(tasks, reserved = []) {
  const used = new Set([...tasks, ...reserved].map((task) => task.key));
  let index = 1;
  while (used.has('T' + index)) index += 1;
  return 'T' + index;
}

export function manualPlanPayload(draft, fingerprint) {
  const value = editablePlan(draft);
  value.summary = value.summary.trim();
  value.milestones = value.milestones.map((text) => text.trim()).filter(Boolean);
  value.risks = value.risks.map((text) => text.trim()).filter(Boolean);
  value.tasks = value.tasks.map((task) => ({
    ...task,
    title: task.title.trim(),
    description: task.description.trim(),
    acceptance: task.acceptance.trim(),
  }));
  return { ...value, context_fingerprint: fingerprint };
}

const compact = (text) => (text || '').replace(/\s/g, '').toLocaleLowerCase();

export function manualPlanProblems(original, draft, requirements) {
  const problems = [];
  const value = manualPlanPayload(draft, '');
  if (!value.summary) problems.push('请写出修订后的计划概述。');
  if (value.milestones.length < 1 || value.milestones.length > 6)
    problems.push('请保留 1—6 项里程碑。');
  if (value.risks.length > 10) problems.push('评审提醒最多保留 10 项，请合并重复内容。');
  if (value.tasks.length < 1 || value.tasks.length > 12) problems.push('候选任务需为 1—12 项。');
  const ids = new Set(requirements.map((item) => item.id));
  const keys = new Set(value.tasks.map((task) => task.key));
  if (keys.size !== value.tasks.length) problems.push('任务编号重复，请调整任务列表。');
  for (const task of value.tasks) {
    const name = task.title || task.key;
    if (!task.title || !task.description || !task.acceptance)
      problems.push(`任务“${name}”需要填写名称、具体工作和验收标准。`);
    if (task.requirement_ids.some((id) => !ids.has(id)))
      problems.push(`任务“${name}”仍关联已移除的要求，请取消该关联。`);
    if (task.dependencies.some((id) => !keys.has(id) || id === task.key))
      problems.push(`任务“${name}”存在无效或自指的前置任务。`);
    const before =
      (original.tasks || []).find((item) => item.key === task.key) ||
      (original.tasks || []).find((item) => compact(item.title) === compact(task.title));
    const added =
      before && task.requirement_ids.some((id) => !listValue(before.requirement_ids).includes(id));
    if (
      added &&
      compact(task.description) === compact(before.description) &&
      compact(task.acceptance) === compact(before.acceptance)
    )
      problems.push(
        `任务“${name}”新增了要求关联，请补充工作说明或验收标准，说明如何落实，不能只补编号。`,
      );
  }
  return problems;
}
