import React, { useState } from 'react';
import { AlertCircle, GitMerge, ArrowLeft } from 'lucide-react';
import { analyzeRecordMerge, resolveTaskMerge } from './taskEditing';

import { FORM_FIELDS, formValues } from './recordDrafts';

const states = { todo: '待开始', doing: '进行中', done: '已完成' };
const priorities = { high: '高优先级', medium: '中优先级', low: '低优先级' };

export default function TaskConflict({
  type = 'task',
  conflict,
  tasks,
  requirements,
  onMerge,
  onContinue,
}) {
  const [choices, setChoices] = useState({});
  const analysis = analyzeRecordMerge(
    conflict.base,
    conflict.local,
    conflict.current,
    FORM_FIELDS[type],
    (record) => formValues(type, record),
  );
  const changed = analysis.fields.filter((row) => row.localChanged || row.remoteChanged);
  const merged = resolveTaskMerge(analysis, choices);
  const unresolved = analysis.fields.filter((row) => row.conflict && !choices[row.field]).length;
  function display(field, value) {
    if (field === 'status') return states[value] || value;
    if (field === 'priority') return priorities[value] || value;
    if (Array.isArray(value)) {
      const collection = field === 'dependencies' ? tasks : requirements;
      return (
        value
          .map((id) => {
            const item = collection.find((record) => record.id === id);
            return item?.title || item?.text || '当前列表中没有此关联（' + id + '）';
          })
          .join('\n') || '未设置'
      );
    }
    return value || '未填写';
  }
  return (
    <section className="task-conflict" aria-label="记录更新冲突处理">
      <div className="task-conflict-intro" role="alert">
        <AlertCircle size={20} />
        <div>
          <strong>记录在其他位置更新了</strong>
          <p>你的输入仍然保留。比较改动后，把选定内容放回表单复核。</p>
        </div>
      </div>
      {changed.map((row) => (
        <fieldset
          key={row.field}
          className={'task-merge-field ' + (row.conflict ? 'conflicting' : '')}
        >
          <legend>
            {row.label}
            <span>
              {row.conflict
                ? '双方修改，请选择'
                : row.localChanged && row.remoteChanged
                  ? '双方内容一致'
                  : row.localChanged
                    ? '仅我的输入有改动'
                    : '仅当前记录有改动'}
            </span>
          </legend>
          <dl className="task-merge-values">
            <div>
              <dt>原先读取</dt>
              <dd>{display(row.field, row.original)}</dd>
            </div>
            <div>
              <dt>我的输入</dt>
              <dd>{display(row.field, row.local)}</dd>
            </div>
            <div>
              <dt>当前保存</dt>
              <dd>{display(row.field, row.current)}</dd>
            </div>
          </dl>
          {row.conflict && (
            <div className="task-merge-choices">
              {[
                ['local', '使用我的输入'],
                ['current', '保留当前保存'],
              ].map(([value, label]) => (
                <label key={value}>
                  <input
                    type="radio"
                    aria-label={row.label + '：' + label}
                    name={'task-merge-' + row.field}
                    checked={choices[row.field] === value}
                    onChange={() => setChoices((previous) => ({ ...previous, [row.field]: value }))}
                  />
                  {label}
                </label>
              ))}
            </div>
          )}
        </fieldset>
      ))}
      {!changed.length && <p>记录版本已变化，字段内容暂时一致。可重新载入当前版本后继续核对。</p>}
      <p className="task-merge-note">
        未发生冲突的字段会保留双方各自的改动。
        {unresolved ? `还有 ${unresolved} 处需要选择。` : '合并后仍需点击表单的“保存”。'}{' '}
        提交时会再次核对最新版本和关联。
      </p>
      <div className="task-merge-actions">
        <button type="button" className="btn small" onClick={onContinue}>
          <ArrowLeft size={14} />
          返回我的输入
        </button>
        <button
          type="button"
          className="btn primary small"
          disabled={!merged}
          onClick={() => onMerge(merged, conflict.current)}
        >
          <GitMerge size={14} />
          合并到表单并复核
        </button>
      </div>
    </section>
  );
}
