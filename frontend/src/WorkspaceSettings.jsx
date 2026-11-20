import React, { useState } from 'react';
import {
  Settings2,
  ShieldCheck,
  RotateCcw,
  LoaderCircle,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { DEFAULT_PREFERENCES } from './preferences';
export default function WorkspaceSettings({
  preferences,
  onChange,
  storageFailed,
  health,
  onRefresh,
}) {
  const [checking, setChecking] = useState(false);
  async function refresh() {
    setChecking(true);
    try {
      await onRefresh();
    } finally {
      setChecking(false);
    }
  }
  return (
    <div className="workspace-settings">
      <p className="settings-intro">调整这个浏览器中的阅读与对话习惯，偏好会自动保存。</p>
      <section className="settings-section">
        <h3>
          <Settings2 size={16} />
          阅读与对话
        </h3>
        <div className="settings-grid">
          <label>
            正文大小
            <select
              aria-label="正文大小"
              value={preferences.readingSize}
              onChange={(event) => onChange({ readingSize: event.target.value })}
            >
              <option value="standard">标准字号</option>
              <option value="large">大字号 · 更便于阅读与展示</option>
            </select>
          </label>
          <label>
            文字对比
            <select
              aria-label="文字对比"
              value={preferences.contrast}
              onChange={(event) => onChange({ contrast: event.target.value })}
            >
              <option value="clear">清晰 · 加深正文与说明</option>
              <option value="soft">柔和 · 原有浅色风格</option>
            </select>
          </label>
          <label className="settings-full">
            发送快捷键
            <select
              aria-label="发送快捷键"
              value={preferences.sendShortcut}
              onChange={(event) => onChange({ sendShortcut: event.target.value })}
            >
              <option value="enter">Enter 发送，Shift + Enter 换行</option>
              <option value="mod-enter">Ctrl / ⌘ + Enter 发送，Enter 换行</option>
            </select>
          </label>
        </div>
        <div className="settings-switches">
          {[
            ['autoScroll', '生成时自动跟随新内容', '手动向上翻阅时仍会暂停跟随。'],
            ['sourcesVisible', '桌面默认展开资料依据', '窄屏通过“资料依据”按钮打开。'],
            ['reduceMotion', '减少界面动效', '关闭平滑滚动与装饰动画；同时尊重系统偏好。'],
          ].map(([key, label, note]) => (
            <label key={key}>
              <span>
                <strong>{label}</strong>
                <small>{note}</small>
              </span>
              <input
                type="checkbox"
                aria-label={label}
                checked={preferences[key]}
                onChange={(event) => onChange({ [key]: event.target.checked })}
              />
            </label>
          ))}
        </div>
      </section>
      <section className="settings-section">
        <div className="settings-section-heading">
          <h3>
            <ShieldCheck size={16} />
            连接与资料状态
          </h3>
          <button className="btn small" onClick={refresh} disabled={checking}>
            {checking ? <LoaderCircle size={14} className="spin" /> : <RotateCcw size={14} />}
            重新检查
          </button>
        </div>
        <div className={'settings-connection ' + (health?.ollama ? 'connected' : 'disconnected')}>
          {health?.ollama ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}
          <span>{health?.detail || '尚未取得服务状态'}</span>
        </div>
        <dl className="settings-facts">
          <div>
            <dt>生成模型</dt>
            <dd>{health?.model || '待连接后读取'}</dd>
          </div>
          <div>
            <dt>资料嵌入模型</dt>
            <dd>{health?.knowledge?.model || '待连接后读取'}</dd>
          </div>
          <div>
            <dt>校园资料</dt>
            <dd>
              {health?.knowledge
                ? `${health.knowledge.documents} 份 · ${health.knowledge.chunks} 个片段`
                : '待连接后读取'}
            </dd>
          </div>
          <div>
            <dt>应用版本</dt>
            <dd>{health?.application_version || '待连接后读取'}</dd>
          </div>
        </dl>
        <p className="settings-hint">使用本项目独立资料索引。模型连接由本机启动配置管理。</p>
      </section>
      <div className="settings-save-state" role="status">
        {storageFailed
          ? '浏览器暂时无法保存偏好；本次页面仍按当前选择显示。'
          : '偏好保存在当前浏览器，刷新后继续使用。'}
      </div>
      <div className="settings-reset">
        <span>恢复阅读与交互的默认选择。</span>
        <button className="btn small" onClick={() => onChange({ ...DEFAULT_PREFERENCES })}>
          <RotateCcw size={14} />
          恢复默认偏好
        </button>
      </div>
    </div>
  );
}
