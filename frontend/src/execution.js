import { listValue, taskDependencies } from './workflow.js';

// These checks describe saved records, never implementation quality or grades.
export function executionState(task, tasks) {
  if (task.status === 'done') return 'done';
  return taskDependencies(task, tasks).some((item) => !item.done) ? 'blocked' : 'ready';
}

export function executionSummary(requirements, tasks) {
  const teachers = requirements
    .filter((item) => item.kind === 'teacher')
    .map((item) => ({
      ...item,
      tasks: tasks.filter((task) => listValue(task.requirement_ids).includes(item.id)),
    }));
  const ready = tasks.filter((task) => executionState(task, tasks) === 'ready');
  const blocked = tasks.filter((task) => executionState(task, tasks) === 'blocked');
  const missingAcceptance = tasks.filter((task) => !task.acceptance?.trim());
  const priority = { high: 0, medium: 1, low: 2 };
  // Sort a copy, prioritizing active work without inferring dependency order.
  const focus = [...ready].sort(
    (a, b) =>
      Number(b.status === 'doing') - Number(a.status === 'doing') ||
      (priority[a.priority] ?? 1) - (priority[b.priority] ?? 1),
  );
  return {
    teachers,
    linked: teachers.filter((item) => item.tasks.length > 0).length,
    ready,
    blocked,
    missingAcceptance,
    focus,
  };
}

export function filterExecution(tasks, allTasks, { readiness = 'all', requirementId = '' } = {}) {
  return tasks.filter(
    (task) =>
      (!requirementId || listValue(task.requirement_ids).includes(requirementId)) &&
      (readiness === 'all' ||
        (readiness === 'acceptance'
          ? !task.acceptance?.trim()
          : executionState(task, allTasks) === readiness)),
  );
}

export function reviewQuestion(task) {
  const scope = task
    ? `重点检查当前已保存的任务「${task.title}」`
    : '检查当前项目已保存的要求与执行任务';
  return `请${scope}：说明老师要求与任务的已保存关联、尚未完成的前置以及验收标准缺口。先列记录事实并引用 R/T 依据，再给修改建议；没有关联不等于功能没做，已标完成不等于已通过验收。不要创建或修改任务。`;
}

export function appendReviewDraft(draft, question, limit = 4000) {
  const original = typeof draft === 'string' ? draft : '';
  if (original.includes(question)) return { text: original, ok: true };
  const text = original.trim() ? `${original}\n\n${question}` : question;
  return text.length <= limit ? { text, ok: true } : { text: original, ok: false };
}
