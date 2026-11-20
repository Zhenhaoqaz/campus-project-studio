import React, { useId, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { taskSelection } from './discussionSelection.js';

function selectionText(value, count, total) {
  return value === null ? `全部 ${total} 项` : `已选 ${count} / ${total} 项`;
}

export function DiscussionScope({ tasks, value, previous, onChange, disabled }) {
  const dialog = useRef(null);
  const trigger = useRef(null);
  const title = useId();
  const [draft, setDraft] = useState(null);
  const [query, setQuery] = useState('');
  const current = taskSelection(value, tasks);
  const { selected, available, missing } = taskSelection(draft, tasks);
  const matches = tasks.filter((task) =>
    task.title.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const different =
    previous &&
    (value === null || previous.value === null
      ? value !== previous.value
      : previous.value.length !== current.selected.size ||
        previous.value.some((id) => !current.selected.has(id)));

  function open() {
    setDraft(value);
    setQuery('');
    dialog.current.showModal();
  }

  function confirm() {
    if (disabled || missing) return;
    onChange(draft);
    dialog.current.close();
  }

  return (
    <div className="discussion-scope">
      <div className="discussion-scope-bar">
        <button
          type="button"
          ref={trigger}
          className="scope-trigger"
          aria-haspopup="dialog"
          disabled={disabled}
          onClick={open}
        >
          下一轮读取 · {selectionText(value, current.available.length, tasks.length)}
          {current.missing > 0 && <span> · {current.missing} 项已失效</span>}
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        {previous?.canReuse && different && (
          <button
            type="button"
            className="scope-reuse"
            disabled={disabled}
            onClick={() => {
              onChange(previous.value);
              trigger.current?.focus();
            }}
          >
            沿用上次范围{previous.missing > 0 ? '（仅保留现有任务）' : ''}
          </button>
        )}
      </div>
      <dialog
        className="scope-dialog"
        ref={dialog}
        aria-labelledby={title}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current.close();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' || ((event.ctrlKey || event.metaKey) && event.key === 'k'))
            event.stopPropagation();
        }}
      >
        <div className="scope-dialog-layout">
          <header className="scope-dialog-heading">
            <div>
              <h2 id={title}>选择下一轮任务</h2>
              <p>每轮都保留已确认要求。任务较多时，可以只选这次要讨论的几项。</p>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="关闭任务选择"
              onClick={() => dialog.current.close()}
            >
              <X size={18} />
            </button>
          </header>
          <div className="discussion-scope-controls">
            <div className="scope-actions">
              <button
                type="button"
                className="btn small"
                disabled={draft === null}
                onClick={() => setDraft(null)}
              >
                使用全部
              </button>
              <button
                type="button"
                className="btn small"
                disabled={draft?.length === 0}
                onClick={() => setDraft([])}
              >
                清空选择
              </button>
              {missing > 0 && (
                <button type="button" className="btn small" onClick={() => setDraft(available)}>
                  移除失效选择
                </button>
              )}
            </div>
            {missing > 0 && (
              <p className="scope-warning" role="alert">
                有 {missing} 项已移出项目，请先移除失效选择。
              </p>
            )}
            {previous && !previous.canReuse && (
              <p className="scope-warning">上次所选任务已移出项目，请重新选择。</p>
            )}
            <label className="scope-search">
              筛选任务
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="输入任务名称"
              />
            </label>
            <div className="scope-list">
              {matches.map((task) => (
                <label key={task.id}>
                  <input
                    type="checkbox"
                    checked={selected.has(task.id)}
                    onChange={(event) => {
                      const next = event.target.checked
                        ? [...selected, task.id]
                        : [...selected].filter((id) => id !== task.id);
                      setDraft(next);
                    }}
                  />
                  {task.title}
                </label>
              ))}
              {!matches.length && <p>{tasks.length ? '没有匹配任务。' : '当前项目还没有任务。'}</p>}
            </div>
          </div>
          <footer className="scope-dialog-footer">
            <span aria-live="polite">{selectionText(draft, available.length, tasks.length)}</span>
            <button type="button" className="btn small" onClick={() => dialog.current.close()}>
              取消
            </button>
            <button
              type="button"
              className="btn small primary"
              disabled={disabled || missing > 0}
              onClick={confirm}
            >
              确认范围
            </button>
          </footer>
        </div>
      </dialog>
    </div>
  );
}

export function ScopeReceipt({ scope }) {
  if (!scope) return null;
  const limited = scope.used < scope.total;
  const trimmed =
    scope.history_used < scope.history_total || scope.sources_used < scope.sources_total;
  return (
    <p className="scope-receipt">
      {limited ? '局部讨论' : '全部任务'} · 已读取 {scope.used} / {scope.total} 项任务。
      {trimmed &&
        ` 为适配模型窗口，采用历史 ${scope.history_used}/${scope.history_total} 条、技术资料 ${scope.sources_used}/${scope.sources_total} 段。`}
    </p>
  );
}
