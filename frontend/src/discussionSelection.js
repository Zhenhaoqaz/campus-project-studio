export function taskSelection(value, tasks) {
  const ids = new Set(tasks.map((task) => task.id));
  const selected = value === null ? ids : new Set(value);
  const available = [...selected].filter((id) => ids.has(id));
  return { selected, available, missing: selected.size - available.length };
}

export function previousTaskScope(messages, tasks) {
  const reply = messages.findLast((message) => message.task_scope);
  if (!reply) return undefined;
  if (!reply.task_scope.explicit) return { value: null, missing: 0, canReuse: true };

  const ids = (reply.evidence || [])
    .filter((item) => item.kind === 'task' && typeof item.doc_id === 'string')
    .map((item) => item.doc_id);
  // A historical receipt with no task IDs is reusable only if it actually read zero.
  if (new Set(ids).size !== reply.task_scope.used) return undefined;
  const { available, missing } = taskSelection(ids, tasks);
  return { value: available, missing, canReuse: ids.length === 0 || available.length > 0 };
}
