import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronRight,
  ListChecks,
  LoaderCircle,
  Plus,
  Pencil,
  RotateCcw,
} from 'lucide-react';
import { listValue } from './workflow';

export default function PlanReview({
  plan,
  projectId,
  requirements,
  existingTasks = [],
  onApply,
  onReplan,
  onViewTasks,
  onEdit,
}) {
  const [previewResult, setPreviewResult] = useState(null);
  const [failure, setFailure] = useState('');
  const [applying, setApplying] = useState(false);
  const [version, setVersion] = useState(0);
  const context = JSON.stringify({ requirements, existingTasks });
  const reviewKey = JSON.stringify([projectId, plan.id, plan.status, context, version]);
  const preview = previewResult?.key === reviewKey ? previewResult.value : null;
  useEffect(() => {
    const controller = new AbortController();
    setPreviewResult(null);
    setFailure('');
    fetch(`/api/projects/${projectId}/plans/${plan.id}/preview`, { signal: controller.signal })
      .then(async (response) => {
        const value = await response.json();
        if (!response.ok)
          throw new Error(typeof value.detail === 'string' ? value.detail : '暂时无法核对计划');
        if (!controller.signal.aborted) setPreviewResult({ key: reviewKey, value });
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setFailure(error.message);
      });
    return () => controller.abort();
  }, [plan.id, plan.status, projectId, context, version]);

  const tasks = plan.content.tasks || [];
  const titleFor = (key) => tasks.find((task) => task.key === key)?.title || key;
  const blockers = preview?.blockers || [];
  const warnings = [...new Set([...(plan.content.risks || []), ...(preview?.warnings || [])])];
  const applied = plan.status === 'applied';
  async function apply() {
    setApplying(true);
    try {
      await onApply(plan);
    } finally {
      setApplying(false);
    }
  }
  return (
    <section className="plan-card" aria-label="候选计划核对">
      <div className="plan-card-heading">
        <span className="stat-icon lavender">
          <ListChecks size={20} />
        </span>
        <div>
          <h3>{applied ? '这份计划已进入执行' : '先核对，再加入任务'}</h3>
          <p>
            {applied ? '原有任务与完成状态已保留' : '检查要求覆盖、前置依赖和验收标准，再确认计划'}
          </p>
        </div>
        <span className="tag">{tasks.length} 项候选任务</span>
      </div>
      <p>{plan.content.summary}</p>
      {plan.content.edited_by === 'user' && (
        <p className="manual-version-note">
          <Pencil size={14} />
          人工修订版本 · 原 AI 草稿已保留；此版本未经过新的模型评审。
        </p>
      )}
      {plan.content.milestones?.length > 0 && (
        <div className="plan-milestones" aria-label="建议里程碑">
          {plan.content.milestones.map((item, index) => (
            <span key={index}>
              <b>{index + 1}</b>
              {item}
            </span>
          ))}
        </div>
      )}
      {!preview && !failure && (
        <p className="plan-checking">
          <LoaderCircle size={14} className="spin" />
          正在核对计划与当前项目要求…
        </p>
      )}
      {failure && (
        <div className="plan-blockers">
          <AlertCircle size={16} />
          <div>
            <strong>核对暂未完成</strong>
            <p>{failure}</p>
            <button className="text-button" onClick={() => setVersion((v) => v + 1)}>
              <RotateCcw size={13} />
              重新核对
            </button>
          </div>
        </div>
      )}
      {preview && (
        <>
          <div className="plan-change-summary">
            <span>
              <Plus size={13} />
              新增 {preview.summary?.added || 0} 项
            </span>
            <span>
              <Check size={13} />
              保留 {preview.summary?.existing || 0} 项同名任务
            </span>
            <span>
              老师要求覆盖 {preview.summary?.teacher_covered || 0}/
              {preview.summary?.teacher_total || 0}
            </span>
          </div>
          {blockers.length > 0 && !applied && (
            <div className="plan-blockers">
              <AlertCircle size={17} />
              <div>
                <strong>暂时不能应用，请先处理这些问题</strong>
                <ul>
                  {blockers.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          {preview.coverage?.length > 0 && (
            <details className="coverage-details" open={blockers.length > 0}>
              <summary>
                逐条核对已确认要求 <ChevronRight size={13} />
              </summary>
              <div>
                {preview.coverage.map((item) => (
                  <div
                    key={item.requirement_id}
                    className={'coverage-row ' + (item.covered ? 'covered' : 'uncovered')}
                  >
                    <span>
                      {item.covered ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                    </span>
                    <div>
                      <p>{item.text}</p>
                      <small>
                        {item.covered
                          ? '关联任务：' + item.task_keys.map(titleFor).join('、')
                          : item.unapplied_task_keys?.length
                            ? '仅草稿中关联，同名旧任务未保存该关联'
                            : '尚未关联可执行任务'}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      )}
      <div className="plan-task-preview">
        {tasks.map((task) => {
          const reused = preview?.existing_tasks?.some((item) => item.key === task.key);
          return (
            <details className="candidate-task" key={task.key}>
              <summary>
                <strong>{task.title}</strong>
                <span>
                  {reused ? '保留已有任务' : task.priority === 'high' ? '高优先级' : '新增任务'}
                </span>
              </summary>
              <p>{task.description}</p>
              <p>
                <b>验收：</b>
                {task.acceptance}
              </p>
              <div className="candidate-context">
                <small>
                  前置任务：
                  {listValue(task.dependencies).length
                    ? listValue(task.dependencies).map(titleFor).join('、')
                    : '无，可直接开始'}
                </small>
                <small>
                  对应要求：
                  {listValue(task.requirement_ids)
                    .map((id) => requirements.find((r) => r.id === id)?.text || id)
                    .join('；') || '通用项目任务'}
                </small>
              </div>
            </details>
          );
        })}
      </div>
      {warnings.length > 0 && (
        <details className="plan-warnings">
          <summary>假设与评审提醒（{warnings.length}）</summary>
          <ul>
            {warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </details>
      )}
      <div className="plan-actions">
        <button
          className="btn primary"
          disabled={applying || (!applied && (!preview?.can_apply || !!failure))}
          onClick={applied ? onViewTasks : apply}
        >
          {applying ? (
            <LoaderCircle size={16} className="spin" />
          ) : applied ? (
            <Check size={16} />
          ) : (
            <Plus size={16} />
          )}
          {applied ? '查看任务看板' : applying ? '正在加入任务…' : '确认并添加任务'}
        </button>
        {!applied && (
          <button className="btn" onClick={onReplan}>
            <RotateCcw size={14} />
            带着问题重新规划
          </button>
        )}
        <button className="btn" onClick={onEdit}>
          <Pencil size={14} />
          {applied ? '基于此计划另存修订' : '手动修订计划'}
        </button>
      </div>
      {!applied && (
        <p className="plan-apply-note">只追加新任务；同名任务和已完成状态不会被覆盖。</p>
      )}
    </section>
  );
}
