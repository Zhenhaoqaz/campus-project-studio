import React from 'react';
import { ArrowRight, CheckCircle2, Clock3, ListChecks, Plus, MessageCircle } from 'lucide-react';

export default function ExecutionReview({
  summary,
  onFilter,
  onEdit,
  onAdd,
  onRequirements,
  onReview,
  disabled,
  error,
}) {
  return (
    <div className="execution-review">
      <p className="execution-note">
        从当前已保存的任务检查落实情况。要求关联、前置状态与验收文字可以核对，实际功能仍需运行验证。
      </p>
      <div className="execution-metrics">
        <button onClick={() => onFilter({ readiness: 'ready' })}>
          <CheckCircle2 size={18} />
          <strong>{summary.ready.length}</strong>
          <span>前置已满足的未完成任务</span>
        </button>
        <button onClick={() => onFilter({ readiness: 'blocked' })}>
          <Clock3 size={18} />
          <strong>{summary.blocked.length}</strong>
          <span>等待前置的任务</span>
        </button>
        <button onClick={() => onFilter({ readiness: 'acceptance' })}>
          <ListChecks size={18} />
          <strong>{summary.missingAcceptance.length}</strong>
          <span>未填写验收标准的任务</span>
        </button>
      </div>
      <div className="execution-heading">
        <h3>老师要求如何落实</h3>
        <span>
          {summary.linked} / {summary.teachers.length} 项已有任务关联
        </span>
      </div>
      <p className="execution-note">
        这里只统计执行任务；未应用的候选计划不计入。关联不代表任务内容已充分满足要求。
      </p>
      {!summary.teachers.length && (
        <div className="execution-empty">
          <p>还没有确认老师要求，暂时无法检查关联情况。</p>
          <button className="btn small" onClick={onRequirements}>
            确认项目要求 <ArrowRight size={14} />
          </button>
        </div>
      )}
      <div className="execution-requirements">
        {summary.teachers.map((requirement) => (
          <article key={requirement.id}>
            <div className="execution-requirement-title">
              <span
                className={'execution-tag ' + (requirement.tasks.length ? 'linked' : 'missing')}
              >
                {requirement.tasks.length ? '已有任务关联' : '尚未关联任务'}
              </span>
              <small>来源：{requirement.source || '用户确认'}</small>
            </div>
            <p>{requirement.text}</p>
            <div className="execution-task-links">
              {requirement.tasks.map((task) => (
                <button key={task.id} onClick={() => onEdit(task)}>
                  {task.status === 'done' ? <CheckCircle2 size={13} /> : <ListChecks size={13} />}
                  {task.title}
                  <small>
                    {task.status === 'done'
                      ? '已完成 · 用户记录'
                      : task.status === 'doing'
                        ? '进行中'
                        : '待开始'}
                  </small>
                </button>
              ))}
            </div>
            <div className="execution-row-actions">
              {requirement.tasks.length > 0 && (
                <button
                  className="text-button"
                  onClick={() => onFilter({ requirementId: requirement.id })}
                >
                  查看这些任务 <ArrowRight size={13} />
                </button>
              )}
              <button className="text-button" onClick={() => onAdd(requirement.id)}>
                <Plus size={13} />
                添加关联任务
              </button>
            </div>
          </article>
        ))}
      </div>
      {summary.missingAcceptance.length > 0 && (
        <section className="execution-missing">
          <h3>补充可观察的验收标准</h3>
          <p className="execution-note">包括已经标为完成的任务。补充文字后仍需核对实际行为。</p>
          <div className="execution-task-links">
            {summary.missingAcceptance.map((task) => (
              <button key={task.id} onClick={() => onEdit(task)}>
                <ListChecks size={13} />
                {task.title}
                <small>去补充</small>
              </button>
            ))}
          </div>
        </section>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="execution-footer">
        <p>
          {disabled
            ? '当前会话仍在运行或恢复，请完成后再带入评审。'
            : '让评审员结合这些记录讨论下一步，提问先放入草稿供你检查。'}
        </p>
        <button className="btn primary small" disabled={disabled} onClick={() => onReview()}>
          <MessageCircle size={15} />
          带入评审员对话
        </button>
      </div>
    </div>
  );
}
