import React from 'react';
import { Link2, ListChecks } from 'lucide-react';
import { listValue, toggleId } from './workflow';

const statusNames = { todo: '待开始', doing: '进行中', done: '已完成' };
const kindNames = { teacher: '老师要求', personal: '个人约束', suggestion: '方法建议' };

export default function TaskLinksEditor({ task, tasks, requirements, onChange }) {
  const candidates = tasks.filter((item) => item.id !== task.id);
  const dependencies = listValue(task.dependencies);
  const associations = listValue(task.requirement_ids);
  return (
    <div className="task-links-editor">
      <fieldset>
        <legend>
          <Link2 size={14} />
          前置任务 <span>{dependencies.length} 项已选</span>
        </legend>
        <p>选择必须先完成的任务。相互依赖的环路会在保存时提示。</p>
        <div className="link-options">
          {candidates.length ? (
            candidates.map((item) => (
              <label key={item.id}>
                <input
                  type="checkbox"
                  aria-label={'前置任务：' + item.title}
                  checked={dependencies.includes(item.id)}
                  onChange={() =>
                    onChange({ ...task, dependencies: toggleId(dependencies, item.id) })
                  }
                />
                <span>
                  <strong>{item.title}</strong>
                  <small>{statusNames[item.status] || '状态未知'}</small>
                </span>
              </label>
            ))
          ) : (
            <div className="link-options-empty">当前没有其他任务，可保存后继续添加。</div>
          )}
        </div>
      </fieldset>
      <fieldset>
        <legend>
          <ListChecks size={14} />
          关联要求 <span>{associations.length} 项已选</span>
        </legend>
        <p>说明这项任务落实了哪条已确认要求，便于后续检查覆盖。</p>
        <div className="link-options">
          {requirements.length ? (
            requirements.map((item) => (
              <label key={item.id}>
                <input
                  type="checkbox"
                  aria-label={'关联要求：' + item.text}
                  checked={associations.includes(item.id)}
                  onChange={() =>
                    onChange({ ...task, requirement_ids: toggleId(associations, item.id) })
                  }
                />
                <span>
                  <small className={'requirement-type ' + item.kind}>
                    {kindNames[item.kind] || '已确认要求'}
                  </small>
                  <strong>{item.text}</strong>
                </span>
              </label>
            ))
          ) : (
            <div className="link-options-empty">项目尚未确认要求，可以先保存任务，再补充要求。</div>
          )}
        </div>
      </fieldset>
    </div>
  );
}
