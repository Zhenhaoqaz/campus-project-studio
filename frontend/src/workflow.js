export function listValue(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function taskDependencies(task, tasks) {
  return listValue(task.dependencies).map((id) => {
    const found = tasks.find((item) => item.id === id);
    return { id, title: found?.title || '前置任务已移除', done: found?.status === 'done' };
  });
}

export function toggleId(current, id) {
  const values = listValue(current);
  return values.includes(id) ? values.filter((value) => value !== id) : [...values, id];
}

export function taskPayload(task, status = task.status) {
  return {
    title: task.title,
    description: task.description || '',
    status: status || 'todo',
    priority: task.priority || 'medium',
    acceptance: task.acceptance || '',
    dependencies: listValue(task.dependencies),
    requirement_ids: listValue(task.requirement_ids),
    ...(task.version ? { expected_version: task.version } : {}),
  };
}

export function filteredTasks(tasks, { query = '', priority = 'all', status = 'all' } = {}) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return tasks.filter((task) => {
    const text =
      `${task.title} ${task.description || ''} ${task.acceptance || ''}`.toLocaleLowerCase();
    return (
      (priority === 'all' || task.priority === priority) &&
      (status === 'all' || task.status === status) &&
      terms.every((term) => text.includes(term))
    );
  });
}

export function workflowStep(requirements, plans, tasks) {
  if (!requirements.length) return 'requirements';
  // The newest version is the next action, even if an earlier version was applied.
  if (plans[0]?.status === 'proposed') return 'confirm';
  if (plans[0]?.status === 'applied') return 'tasks';
  return tasks.length ? 'tasks' : 'plan';
}

export const categoryNames = {
  frontend: 'React 与组件',
  layout: 'CSS 与布局',
  api: '请求与通信',
  data: '存储与数据',
  quality: '质量与可访问性',
  delivery: '构建与交付',
  ai: '模型与检索',
  planning: '项目规划',
};

export function filteredDocuments(documents, kind, query, category = 'all') {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return documents.filter((doc) => {
    const text = [
      doc.title,
      doc.source,
      doc.category,
      categoryNames[doc.category],
      ...listValue(doc.tags),
    ]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase();
    return (
      (kind === 'all' || doc.kind === kind) &&
      (category === 'all' || doc.category === category) &&
      terms.every((term) => text.includes(term))
    );
  });
}
