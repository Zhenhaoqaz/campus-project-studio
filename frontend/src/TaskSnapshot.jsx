import React from 'react';
import { ListChecks, ChevronDown } from 'lucide-react';

const states = { todo: '待开始', doing: '进行中', done: '已完成 · 用户记录' };
const kinds = { teacher: '老师要求', personal: '个人约束', suggestion: '方法建议' };

export default function TaskSnapshot({ evidence, onCitation }) {
  const records = evidence?.filter((item) => item.kind === 'task' && item.saved_task) || [];
  if (!records.length) return null;
  return (
    <details className="task-snapshot">
      <summary>
        <ListChecks size={15} />
        <span>系统读取的任务记录 · 本轮快照</span>
        <small>{records.length} 项</small>
        <ChevronDown size={14} />
      </summary>
      <p>
        下列字段直接取自本轮读取的记录，由程序整理。若 AI
        文字与此处不一致，请以记录为准并继续核对；用户保存的状态仍需实际验收。
      </p>
      <div className="snapshot-records">
        {records.map((item) => {
          const record = item.saved_task;
          return (
            <article key={item.id}>
              <div className="snapshot-heading">
                <button className="citation" onClick={() => onCitation(item.id)}>
                  {item.id}
                </button>
                <strong>{record.title}</strong>
                <small>{states[record.status] || '状态未知'}</small>
              </div>
              <dl>
                <div>
                  <dt>要求关联</dt>
                  <dd>
                    {record.requirements.length
                      ? record.requirements.map((requirement) => (
                          <button key={requirement.id} onClick={() => onCitation(requirement.id)}>
                            {requirement.id} · {kinds[requirement.kind]}
                          </button>
                        ))
                      : !record.unread_requirement_count
                        ? '未设置'
                        : null}
                    {record.unread_requirement_count > 0 && (
                      <span>
                        另有 {record.unread_requirement_count} 项关联未包含在本轮要求快照中
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>前置任务</dt>
                  <dd>
                    {record.dependencies.length
                      ? record.dependencies.map((dependency, index) => (
                          <span key={index}>
                            {dependency.title}（
                            {dependency.done ? '已完成 · 用户记录' : '尚未完成或记录缺失'}）
                          </span>
                        ))
                      : '未设置；列表顺序不代表依赖'}
                  </dd>
                </div>
                <div>
                  <dt>验收标准</dt>
                  <dd>{record.acceptance?.trim() || '未填写'}</dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>
    </details>
  );
}
