import React from 'react';
import { CheckCircle2, Clock3 } from 'lucide-react';
import TaskLinksEditor from './TaskLinksEditor';
import { taskDependencies } from './workflow';

const statuses = { todo: '待开始', doing: '进行中', done: '已完成' };
const kinds = { teacher: '老师要求', personal: '个人约束', suggestion: '方法建议' };

export default function RecordFields({ modal, form, setForm, tasks, requirements }) {
  return (
    <>
      {['newProject', 'editProject'].includes(modal) && (
        <>
          <label>
            项目名称
            <input
              autoFocus
              required
              maxLength={80}
              value={form.name || ''}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="例如：校园失物招领"
            />
          </label>
          <label>
            所属课程
            <input
              maxLength={80}
              value={form.course || ''}
              onChange={(e) => setForm({ ...form, course: e.target.value })}
              placeholder="例如：Web 程序设计"
            />
          </label>
          <label>
            项目想法
            <textarea
              value={form.brief || ''}
              onChange={(e) => setForm({ ...form, brief: e.target.value })}
              placeholder="想帮助谁，解决什么问题？"
            />
          </label>
          <div className="form-columns">
            <label>
              技术基础
              <input
                value={form.skills || ''}
                onChange={(e) => setForm({ ...form, skills: e.target.value })}
                placeholder="例如：基础 JavaScript"
              />
            </label>
            <label>
              截止日期（可选）
              <input
                type="date"
                value={form.deadline || ''}
                onChange={(e) => setForm({ ...form, deadline: e.target.value })}
              />
            </label>
          </div>
          <label>
            时间与其他约束
            <input
              value={form.budget || ''}
              onChange={(e) => setForm({ ...form, budget: e.target.value })}
              placeholder="例如：每周 6 小时，先完成最小版本"
            />
          </label>
        </>
      )}
      {modal === 'requirement' && (
        <>
          <label>
            要求或约束
            <textarea
              autoFocus
              required
              value={form.text || ''}
              onChange={(e) => setForm({ ...form, text: e.target.value })}
              placeholder="粘贴原文，确认它的来源与类型。"
            />
          </label>
          <label>
            类型
            <select
              value={form.kind || 'personal'}
              onChange={(e) => setForm({ ...form, kind: e.target.value })}
            >
              {['teacher', 'personal', 'suggestion'].map((k) => (
                <option key={k} value={k}>
                  {kinds[k]}
                </option>
              ))}
            </select>
          </label>
          <label>
            来源
            <input
              value={form.source || ''}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
              placeholder="例如：教师验收说明"
            />
          </label>
          <p className="form-hint">
            {form.id
              ? '编辑会保留原要求编号及任务关联；已有候选计划需要重新核对。'
              : '保存即表示你已确认这条内容；AI 不会自动把建议写成老师要求。'}
          </p>
        </>
      )}
      {modal === 'task' && (
        <>
          <label>
            任务名称
            <input
              autoFocus
              required
              maxLength={160}
              value={form.title || ''}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <label>
            任务说明
            <textarea
              value={form.description || ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <div className="form-columns">
            <label>
              状态
              <select
                value={form.status || 'todo'}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                {Object.entries(statuses).map(([k, v]) => (
                  <option
                    key={k}
                    value={k}
                    disabled={
                      k === 'done' && taskDependencies(form, tasks).some((dep) => !dep.done)
                    }
                  >
                    {v}
                    {k === 'done' && taskDependencies(form, tasks).some((dep) => !dep.done)
                      ? '（先完成依赖）'
                      : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              优先级
              <select
                value={form.priority || 'medium'}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
              >
                <option value="high">高优先级</option>
                <option value="medium">中优先级</option>
                <option value="low">低优先级</option>
              </select>
            </label>
          </div>
          {taskDependencies(form, tasks).length > 0 && (
            <div className="task-dependency-detail">
              <strong>前置任务</strong>
              {taskDependencies(form, tasks).map((dep) => (
                <p key={dep.id}>
                  {dep.done ? <CheckCircle2 size={14} /> : <Clock3 size={14} />}
                  <span>{dep.title}</span>
                  <small>{dep.done ? '已完成' : '尚未完成'}</small>
                </p>
              ))}
              <small>先检查依赖，再更新当前任务的状态。</small>
            </div>
          )}
          <label>
            验收标准
            <textarea
              value={form.acceptance || ''}
              onChange={(e) => setForm({ ...form, acceptance: e.target.value })}
              placeholder="如何判断这件事已经做好？"
            />
          </label>
          <TaskLinksEditor
            task={form}
            tasks={tasks}
            requirements={requirements}
            onChange={setForm}
          />
          {form.status === 'done' && taskDependencies(form, tasks).some((dep) => !dep.done) && (
            <p className="form-error" role="status">
              所选前置任务尚未完成，请先调整本任务状态，或移除不适用的依赖。
            </p>
          )}
        </>
      )}
    </>
  );
}
