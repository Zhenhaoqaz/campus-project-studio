export function draftKey(projectId, conversationId) {
  return `campus-draft-v1:${encodeURIComponent(projectId)}:${conversationId ? 'conversation-' + encodeURIComponent(conversationId) : 'new'}`;
}

export function readDraft(storage, projectId, conversationId) {
  if (!projectId) return null;
  try {
    const value = JSON.parse(storage.getItem(draftKey(projectId, conversationId)) || 'null');
    if (!value || typeof value.text !== 'string') return null;
    return {
      text: value.text,
      mode: normalizeMode(value.mode),
      ...(Array.isArray(value.taskIds) && {
        taskIds: value.taskIds.filter((id) => typeof id === 'string'),
      }),
    };
  } catch {
    return null;
  }
}

export function writeDraft(storage, projectId, conversationId, draft) {
  if (!projectId) return false;
  try {
    storage.setItem(
      draftKey(projectId, conversationId),
      JSON.stringify({
        text: draft.text || '',
        mode: normalizeMode(draft.mode),
        taskIds: draft.taskIds,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export function runRecovery(messages, runs) {
  const latest = runs[0];
  if (!latest) return null;
  const user = [...messages]
    .reverse()
    .find((message) => message.run_id === latest.id && message.role === 'user');
  const base = {
    runId: latest.id,
    mode: normalizeMode(latest.mode),
    text: user?.content || '',
    status: latest.status,
    ...(Object.hasOwn(latest, 'task_ids') && { taskIds: latest.task_ids }),
  };
  if (['queued', 'running'].includes(latest.status)) return { ...base, kind: 'resume' };
  if (['failed', 'cancelled'].includes(latest.status) && user?.content?.trim())
    return { ...base, kind: 'retry' };
  return null;
}

export function canRestoreQuestion(currentDraft, previousQuestion) {
  return !currentDraft.trim() || currentDraft.trim() === previousQuestion.trim();
}
import { normalizeMode } from './chatModes.js';
