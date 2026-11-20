import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  LoaderCircle,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import {
  editablePlan,
  manualPlanPayload,
  manualPlanProblems,
  nextTaskKey,
  readPlanDraft,
  writePlanDraft,
  clearPlanDraft,
} from './planEditing';
import { toggleId } from './workflow';
import { workspaceStorage as localStore } from './storage';

const kinds = { teacher: '老师要求', personal: '个人约束', suggestion: '方法建议' };

export default function PlanEditor({ plan, projectId, initialRequirements, onClose, onSaved }) {
  const [recovered] = useState(() => readPlanDraft(localStore, projectId, plan.id));
  const [draft, setDraft] = useState(() => recovered?.draft || editablePlan(plan.content));
  const [draftSaveFailed, setDraftSaveFailed] = useState(false);
  const [expanded, setExpanded] = useState(plan.content.tasks?.[0]?.key);
  const [fingerprint, setFingerprint] = useState(null),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [errors, setErrors] = useState([]),
    [stale, setStale] = useState(false),
    [version, setVersion] = useState(0);
  const [requirements, setRequirements] = useState(initialRequirements),
    [needsRecheck, setNeedsRecheck] = useState(false);
  const root = useRef(null),
    errorBox = useRef(null),
    closeHandler = useRef(null),
    saved = useRef(false);
  const original = editablePlan(plan.content);
  const changed =
    JSON.stringify(manualPlanPayload(draft, '')) !==
    JSON.stringify(manualPlanPayload(original, ''));
  closeHandler.current = () => {
    if (saving) return;
    if (changed && !confirm('手动修订尚未保存，确认关闭并放弃这些修改？')) return;
    saved.current = true;
    clearPlanDraft(localStore, projectId, plan.id);
    onClose();
  };
  useEffect(() => {
    const persist = () => {
      if (saved.current) return true;
      const stored = changed
        ? writePlanDraft(localStore, projectId, plan.id, draft)
        : clearPlanDraft(localStore, projectId, plan.id);
      setDraftSaveFailed(!stored);
      return stored;
    };
    const timeout = setTimeout(persist, 250);
    const beforeUnload = (event) => {
      const stored = persist();
      if (changed && !saved.current && !stored) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [draft, changed, projectId, plan.id]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setErrors([]);
    fetch(`/api/projects/${projectId}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(typeof body.detail === 'string' ? body.detail : '无法核对当前项目要求');
        if (!body.context_fingerprint) throw new Error('暂未取得当前项目版本，请重试');
        if (controller.signal.aborted) return;
        setRequirements(body.requirements);
        setFingerprint(body.context_fingerprint);
        setNeedsRecheck(false);
        setStale(body.context_fingerprint !== plan.content.context_fingerprint);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setFingerprint(null);
          setErrors([error.message]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [projectId, plan.id, version]);
  useEffect(() => {
    const previous = document.activeElement,
      overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root.current?.querySelector('textarea')?.focus();
    const keyboard = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeHandler.current?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = [
        ...(root.current?.querySelectorAll(
          'button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled])',
        ) || []),
      ].filter((item) => item.offsetParent !== null);
      const first = elements[0],
        last = elements[elements.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first || !root.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', keyboard);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', keyboard);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    if (errors.length) errorBox.current?.focus();
  }, [errors]);
  function updateTask(key, patch) {
    setDraft((current) => ({
      ...current,
      tasks: current.tasks.map((task) => (task.key === key ? { ...task, ...patch } : task)),
    }));
  }
  function addTask() {
    const key = nextTaskKey(draft.tasks, original.tasks);
    setDraft((current) => ({
      ...current,
      tasks: [
        ...current.tasks,
        {
          key,
          title: '',
          description: '',
          acceptance: '',
          priority: 'medium',
          dependencies: [],
          requirement_ids: [],
        },
      ],
    }));
    setExpanded(key);
  }
  function removeTask(key) {
    setDraft((current) => ({
      ...current,
      tasks: current.tasks.filter((task) => task.key !== key),
    }));
    if (expanded === key) setExpanded(null);
  }
  async function save(event) {
    event.preventDefault();
    if (saving || loading || needsRecheck || !fingerprint) return;
    const problems = manualPlanProblems(original, draft, requirements);
    if (problems.length) {
      setErrors(problems);
      return;
    }
    setSaving(true);
    setErrors([]);
    try {
      const response = await fetch(`/api/projects/${projectId}/plans/${plan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(manualPlanPayload(draft, fingerprint)),
      });
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 409) setNeedsRecheck(true);
        throw new Error(
          typeof body.detail === 'string'
            ? body.detail
            : '修订内容未通过校验，请检查任务字段与依赖',
        );
      }
      saved.current = true;
      clearPlanDraft(localStore, projectId, plan.id);
      await onSaved(body);
      onClose();
    } catch (error) {
      setErrors([error.message]);
    } finally {
      setSaving(false);
    }
  }
  const associated = new Set(draft.tasks.flatMap((task) => task.requirement_ids));
  const missing = requirements.filter(
    (item) => item.kind === 'teacher' && !associated.has(item.id),
  );
  return (
    <div
      className="modal-backdrop plan-editor-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) closeHandler.current?.();
      }}
    >
      <section
        className="modal wide plan-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-plan-title"
        ref={root}
      >
        <div className="modal-heading">
          <div>
            <h2 id="manual-plan-title">手动修订候选计划</h2>
            <small>另存为人工修订版本，原模型草稿与已执行任务均保留</small>
          </div>
          <button
            className="icon-button"
            type="button"
            title="关闭修订窗口"
            aria-label="关闭修订窗口"
            onClick={() => closeHandler.current?.()}
            disabled={saving}
          >
            <X size={19} />
          </button>
        </div>
        <form className="modal-form plan-editor-form" onSubmit={save}>
          <fieldset className="plan-editor-inputs" disabled={saving}>
            {recovered && (
              <p className="manual-recovery-note">
                已恢复此计划尚未保存的人工修订，请重新核对当前要求后保存新版本。
              </p>
            )}
            {draftSaveFailed && (
              <p className="manual-stale-note" role="status">
                浏览器未能保存修订草稿，刷新前请先保存为候选版本。
              </p>
            )}
            <div className="manual-plan-notice">
              <Pencil size={16} />
              <p>
                <strong>这是人工修订，不是模型重新评审。</strong>
                要求编号的关联只用于检查遗漏，不代表方案质量已通过。新增关联时，请补充具体工作和验收标准，说明如何落实。
              </p>
            </div>
            {loading && (
              <p className="plan-checking">
                <LoaderCircle size={14} className="spin" />
                正在核对当前项目版本…
              </p>
            )}
            {stale && (
              <p className="manual-stale-note">
                <AlertCircle size={15} />
                源草稿使用的项目要求已有变化，请逐项对照当前要求，再保存新版本。
              </p>
            )}
            {errors.length > 0 && (
              <div className="manual-plan-errors" role="alert" tabIndex={-1} ref={errorBox}>
                <strong>修改尚未保存，输入内容已保留</strong>
                <ul>
                  {errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
                {(!fingerprint || needsRecheck) && !loading && (
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => setVersion((value) => value + 1)}
                  >
                    <RotateCcw size={13} />
                    重新读取当前要求，保留我的修改
                  </button>
                )}
              </div>
            )}
            <label>
              计划概述
              <textarea
                required
                maxLength={1500}
                value={draft.summary}
                onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
              />
            </label>
            <details className="manual-extra-fields">
              <summary>
                调整里程碑与评审提醒 <ChevronDown size={13} />
              </summary>
              <label>
                里程碑（每行一项，最多 6 项）
                <textarea
                  value={draft.milestones.join('\n')}
                  onChange={(event) =>
                    setDraft({ ...draft, milestones: event.target.value.split('\n') })
                  }
                />
              </label>
              <label>
                假设与提醒（每行一项，最多 10 项）
                <textarea
                  value={draft.risks.join('\n')}
                  onChange={(event) =>
                    setDraft({ ...draft, risks: event.target.value.split('\n') })
                  }
                />
              </label>
            </details>
            <div className="manual-tasks-heading">
              <strong>候选任务 · {draft.tasks.length} 项</strong>
              <span>
                {missing.length
                  ? `还有 ${missing.length} 条老师要求未关联`
                  : '老师要求均有编号关联，仍需人工核对内容'}
              </span>
            </div>
            {draft.tasks.map((task, index) => {
              const unknownRequirements = task.requirement_ids.filter(
                (id) => !requirements.some((item) => item.id === id),
              );
              const unknownDependencies = task.dependencies.filter(
                (key) => !draft.tasks.some((item) => item.key === key),
              );
              return (
                <section className="manual-task" key={task.key}>
                  <div className="manual-task-heading">
                    <button
                      type="button"
                      onClick={() => setExpanded((value) => (value === task.key ? null : task.key))}
                      aria-expanded={expanded === task.key}
                    >
                      {expanded === task.key ? (
                        <ChevronDown size={15} />
                      ) : (
                        <ChevronRight size={15} />
                      )}
                      <span>{index + 1}</span>
                      <strong>{task.title || '新候选任务'}</strong>
                      <small>{task.key}</small>
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={'移除此候选任务：' + (task.title || task.key)}
                      title="移除此候选任务"
                      onClick={() => removeTask(task.key)}
                      disabled={draft.tasks.length <= 1 || saving}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {expanded === task.key && (
                    <div className="manual-task-fields">
                      <label>
                        任务名称
                        <input
                          required
                          maxLength={120}
                          value={task.title}
                          onChange={(event) => updateTask(task.key, { title: event.target.value })}
                        />
                      </label>
                      <label>
                        具体工作
                        <textarea
                          required
                          maxLength={1600}
                          value={task.description}
                          onChange={(event) =>
                            updateTask(task.key, { description: event.target.value })
                          }
                          placeholder="写清要做什么，以及如何落实所关联的要求。"
                        />
                      </label>
                      <label>
                        验收标准
                        <textarea
                          required
                          maxLength={1000}
                          value={task.acceptance}
                          onChange={(event) =>
                            updateTask(task.key, { acceptance: event.target.value })
                          }
                          placeholder="写出能观察或检查的完成标准。"
                        />
                      </label>
                      <label>
                        优先级
                        <select
                          value={task.priority}
                          onChange={(event) =>
                            updateTask(task.key, { priority: event.target.value })
                          }
                        >
                          <option value="high">高优先级</option>
                          <option value="medium">中优先级</option>
                          <option value="low">低优先级</option>
                        </select>
                      </label>
                      <fieldset className="manual-associations">
                        <legend>关联当前已确认要求</legend>
                        <p>先核对原文，再选择这项任务真正落实的内容。</p>
                        <div className="link-options">
                          {requirements.map((item) => (
                            <label key={item.id}>
                              <input
                                type="checkbox"
                                aria-label={task.key + '关联要求：' + item.text}
                                checked={task.requirement_ids.includes(item.id)}
                                onChange={() =>
                                  updateTask(task.key, {
                                    requirement_ids: toggleId(task.requirement_ids, item.id),
                                  })
                                }
                              />
                              <span>
                                <small className={'requirement-type ' + item.kind}>
                                  {kinds[item.kind]}
                                </small>
                                <strong>{item.text}</strong>
                              </span>
                            </label>
                          ))}
                          {unknownRequirements.map((id) => (
                            <label key={id}>
                              <input
                                type="checkbox"
                                checked
                                onChange={() =>
                                  updateTask(task.key, {
                                    requirement_ids: toggleId(task.requirement_ids, id),
                                  })
                                }
                              />
                              <span>
                                <strong>已移除的要求：{id}</strong>
                                <small>取消此关联后再保存。</small>
                              </span>
                            </label>
                          ))}
                          {!requirements.length && !unknownRequirements.length && (
                            <div className="link-options-empty">当前项目没有已确认要求。</div>
                          )}
                        </div>
                      </fieldset>
                      <fieldset className="manual-associations">
                        <legend>前置候选任务</legend>
                        <div className="link-options">
                          {draft.tasks
                            .filter((item) => item.key !== task.key)
                            .map((item) => (
                              <label key={item.key}>
                                <input
                                  type="checkbox"
                                  aria-label={task.key + '前置任务：' + (item.title || item.key)}
                                  checked={task.dependencies.includes(item.key)}
                                  onChange={() =>
                                    updateTask(task.key, {
                                      dependencies: toggleId(task.dependencies, item.key),
                                    })
                                  }
                                />
                                <span>
                                  <strong>{item.title || '未命名任务'}</strong>
                                  <small>{item.key}</small>
                                </span>
                              </label>
                            ))}
                          {unknownDependencies.map((key) => (
                            <label key={key}>
                              <input
                                type="checkbox"
                                checked
                                onChange={() =>
                                  updateTask(task.key, {
                                    dependencies: toggleId(task.dependencies, key),
                                  })
                                }
                              />
                              <span>
                                <strong>已移除的前置任务：{key}</strong>
                                <small>取消此依赖后再保存。</small>
                              </span>
                            </label>
                          ))}
                          {draft.tasks.length === 1 && !unknownDependencies.length && (
                            <div className="link-options-empty">
                              目前只有一项任务，无需前置依赖。
                            </div>
                          )}
                        </div>
                      </fieldset>
                    </div>
                  )}
                </section>
              );
            })}
            <button
              className="btn small"
              type="button"
              onClick={addTask}
              disabled={draft.tasks.length >= 12 || saving}
            >
              <Plus size={14} />
              添加候选任务
            </button>
            <p className="manual-save-note">
              允许先保存尚未完整的修订草稿，应用时仍会核对要求与依赖。同名任务会保留原执行内容，需要落实为新任务时请使用清楚的新标题。
            </p>
            <div className="modal-footer manual-editor-footer">
              <button
                type="button"
                className="btn"
                onClick={() => closeHandler.current?.()}
                disabled={saving}
              >
                取消
              </button>
              <button
                className="btn primary"
                disabled={saving || loading || needsRecheck || !fingerprint || !changed}
              >
                {saving ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}
                保存新候选版本
              </button>
            </div>
          </fieldset>
        </form>
      </section>
    </div>
  );
}
