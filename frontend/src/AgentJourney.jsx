import React from 'react';
import { Check, LoaderCircle, AlertCircle, Clock3, Square } from 'lucide-react';
import { CHAT_MODES, normalizeMode, collaborationStages } from './chatModes';
const stateNames = {
  done: '回复已保存',
  active: '进行中',
  waiting: '未开始',
  attention: '待核对',
  stopped: '已停止',
  failed: '未完成',
};
export default function AgentJourney({ run, messages, plans }) {
  if (!run) return null;
  const stages = collaborationStages(run, messages, plans);
  return (
    <details
      className="agent-journey"
      aria-label="本轮协作进度"
      open={['running', 'queued'].includes(run.status)}
    >
      <summary className="journey-heading">
        <strong>协作进度 · {CHAT_MODES[normalizeMode(run.mode)].label}</strong>
        <span>
          {run.status === 'running'
            ? '正在进行'
            : run.status === 'completed'
              ? '查看运行记录'
              : run.status === 'cancelled'
                ? '已停止'
                : '未完成'}
        </span>
      </summary>
      <ol>
        {stages.map((stage) => {
          const Icon =
            stage.state === 'done'
              ? Check
              : stage.state === 'active'
                ? LoaderCircle
                : ['attention', 'failed'].includes(stage.state)
                  ? AlertCircle
                  : stage.state === 'stopped'
                    ? Square
                    : Clock3;
          return (
            <li key={stage.key} className={'stage-' + stage.state}>
              <span className="journey-stage-icon">
                <Icon size={14} className={stage.state === 'active' ? 'spin' : ''} />
              </span>
              <div>
                <strong>{stage.label}</strong>
                <small>
                  {stage.key === 'retrieval' && stage.state === 'done'
                    ? '已读取'
                    : stage.key === 'candidate' && stage.state === 'done'
                      ? stage.label === '候选已应用'
                        ? '已确认应用'
                        : '已生成，仍需核对'
                      : stateNames[stage.state]}
                </small>
              </div>
            </li>
          );
        })}
      </ol>
      <p>
        {run.mode === 'plan'
          ? '进度来自实际输出；候选生成后仍需核对与确认。'
          : '本次仅讨论，不会创建候选计划或修改任务。'}
      </p>
    </details>
  );
}
