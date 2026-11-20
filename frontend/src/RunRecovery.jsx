import React from 'react';
import { AlertCircle, ArrowDownToLine, RotateCcw, Square } from 'lucide-react';
import { canRestoreQuestion } from './recovery';
import { CHAT_MODES, normalizeMode } from './chatModes';

export default function RunRecovery({ recovery, draft, onRestore, onRetry, onResume, onStop }) {
  if (!recovery) return null;
  const receiving = recovery.kind === 'resume';
  const hasOtherDraft = !canRestoreQuestion(draft, recovery.text);
  return (
    <section
      className={'run-recovery ' + (receiving ? 'resume' : 'retry')}
      aria-label="本次运行恢复"
    >
      <div className="recovery-title">
        <AlertCircle size={15} />
        <strong>
          {receiving
            ? '这次运行仍在后台执行'
            : recovery.status === 'cancelled'
              ? '上次运行已停止'
              : recovery.status === 'not_started'
                ? '这次问题未成功提交'
                : '上次运行未完成'}
        </strong>
        <span>{CHAT_MODES[normalizeMode(recovery.mode)].label}</span>
      </div>
      {recovery.text && (
        <details>
          <summary>查看原问题</summary>
          <p>{recovery.text}</p>
        </details>
      )}
      <p>
        {receiving
          ? '同步只会继续接收这次运行的结果，不会重复提交问题。'
          : '重试会创建一次新运行，不会续写中断的回答；现有记录和输入框草稿都会保留。'}
      </p>
      <div className="recovery-actions">
        {receiving ? (
          <>
            <button className="btn small" onClick={onResume}>
              <RotateCcw size={13} />
              同步已有运行
            </button>
            <button className="text-button" onClick={onStop}>
              <Square size={12} />
              停止后台运行
            </button>
          </>
        ) : (
          <>
            <button className="btn small" onClick={onRetry}>
              <RotateCcw size={13} />
              重试本次提问
            </button>
            <button
              className="text-button"
              onClick={onRestore}
              disabled={hasOtherDraft}
              title={
                hasOtherDraft
                  ? '输入框已有其他草稿；直接重试会保留它'
                  : '把原问题和对应模式填回输入框'
              }
            >
              <ArrowDownToLine size={13} />
              填回输入框
            </button>
          </>
        )}
      </div>
      {!receiving && hasOtherDraft && (
        <small>当前输入框有另一份草稿，已保留；“重试本次提问”不会清空它。</small>
      )}
    </section>
  );
}
