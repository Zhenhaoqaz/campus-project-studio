import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import {
  LayoutDashboard,
  MessagesSquare,
  Kanban,
  Library,
  Plus,
  ArrowUpRight,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Search,
  Settings2,
  MoreHorizontal,
  Check,
  CheckCheck,
  CheckCircle2,
  Clock3,
  CalendarDays,
  BookOpen,
  FileText,
  GraduationCap,
  Lightbulb,
  Sparkles,
  Send,
  Square,
  Download,
  ExternalLink,
  X,
  Trash2,
  Pencil,
  Target,
  Flag,
  Link2,
  PanelLeft,
  LoaderCircle,
  AlertCircle,
  RotateCcw,
  FolderOpen,
  ShieldCheck,
  ListChecks,
  MessageCircle,
  ArrowLeft,
} from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { consumeSSE } from './stream';
import { remarkCitations } from './citations';
import PlanReview from './PlanReview';
import RecordFields from './RecordFields';
import { DiscussionScope, ScopeReceipt } from './DiscussionScope';
import { previousTaskScope, taskSelection } from './discussionSelection';
import {
  formKey,
  formValues,
  dirtyForm,
  openFormDraft,
  deletePath,
} from './recordDrafts';
import RunRecovery from './RunRecovery';
import AgentJourney from './AgentJourney';
import { CHAT_MODES, normalizeMode, mentionedTaskRecords } from './chatModes';
import {
  readPreferences,
  writePreferences,
  normalizePreferences,
  shouldSendKey,
} from './preferences';
import { canRestoreQuestion, readDraft, runRecovery, writeDraft } from './recovery';
import { executionSummary, filterExecution, reviewQuestion, appendReviewDraft } from './execution';
import {
  workspaceStorage as localStore,
  readStoredValue,
  writeStoredValue,
  removeStoredValue,
  normalizeView,
} from './storage';
import { messageState } from './messageState';
import {
  categoryNames,
  filteredDocuments,
  filteredTasks,
  listValue,
  taskDependencies,
  workflowStep,
} from './workflow';
import './style.css';
import './workspace-final.css';

const WorkspaceSettings = lazy(() => import('./WorkspaceSettings'));
const ExecutionReview = lazy(() => import('./ExecutionReview'));
const PlanEditor = lazy(() => import('./PlanEditor'));
const TaskSnapshot = lazy(() => import('./TaskSnapshot'));
const TaskConflict = lazy(() => import('./TaskConflict'));
class PanelBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed
      ? this.props.fallback || (
          <p className="settings-intro settings-load-state" role="alert">
            {this.props.label || '设置'}
            暂时无法打开，请刷新页面后重新打开。已保存的项目记录仍会保留。
          </p>
        )
      : this.props.children;
  }
}

const navs = [
  ['overview', '项目总览', LayoutDashboard],
  ['chat', 'AI 协作', MessagesSquare],
  ['tasks', '任务看板', Kanban],
  ['library', '资料库', Library],
];
const roles = {
  assistant: ['资料助手', 'A'],
  planner: ['项目规划员', 'P'],
  reviewer: ['方案评审员', 'R'],
};
const kinds = {
  teacher: '老师要求',
  personal: '个人约束',
  suggestion: '方法建议',
  official: '官方文档',
  guide: '方法建议',
  task: '任务记录',
};
const statuses = { todo: '待开始', doing: '进行中', done: '已完成' };
async function api(path, options = {}) {
  const r = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    const detail = e.detail;
    const error = new Error(
      typeof detail === 'string' ? detail : detail?.message || '输入有误，请检查必填项',
    );
    error.status = r.status;
    error.code = detail?.code;
    error.current = detail?.current;
    throw error;
  }
  return r.json();
}
const post = (body) => ({ method: 'POST', body: JSON.stringify(body) });
function IconButton({ title, children, ...rest }) {
  return (
    <button className="icon-button" title={title} aria-label={title} {...rest}>
      {children}
    </button>
  );
}
function Brand() {
  return (
    <div className="brand">
      <span className="brand-icon">
        <i />
        <i />
        <i />
        <i />
      </span>
      <div>
        课题工坊<small>PROJECT STUDIO</small>
      </div>
    </div>
  );
}
function RichText({ children, onCitation }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm, remarkCitations]}
      components={{
        a: ({ href, children }) =>
          href?.startsWith('#evidence-') ? (
            <button className="citation" onClick={() => onCitation?.(href.slice(10))}>
              {children}
            </button>
          ) : (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
              <ExternalLink size={12} />
            </a>
          ),
      }}
    >
      {children || ''}
    </Markdown>
  );
}

function TaskReferences({ message, onSelect }) {
  const records = mentionedTaskRecords(message.content, message.evidence);
  return (
    records.length > 0 && (
      <div className="task-evidence-links">
        <span>提到的任务记录</span>
        {records.map((item) => (
          <button key={item.id} onClick={() => onSelect(item)}>
            {item.id} · {item.title.replace(/^任务记录 · /, '')}
          </button>
        ))}
      </div>
    )
  );
}

function ProjectFlow({ active, requirements, onRequirements, onPlan, onConfirm, onTasks }) {
  const steps = [
    [
      'requirements',
      '确认要求',
      requirements ? `${requirements} 项已确认` : '先记录课程原文',
      onRequirements,
    ],
    ['plan', '规划与评审', '两位伙伴一起思考', onPlan],
    ['confirm', '核对候选计划', '查覆盖、依赖与验收', onConfirm],
    ['tasks', '执行与更新', '用真实任务记录进展', onTasks],
  ];
  return (
    <nav className="project-flow" aria-label="项目推进流程">
      {steps.map(([key, label, note, action], index) => (
        <React.Fragment key={key}>
          {index > 0 && <ChevronRight size={14} className="flow-chevron" />}
          <button
            className={'flow-step ' + (active === key ? 'current' : '')}
            onClick={action}
            aria-current={active === key ? 'step' : undefined}
          >
            <span>{index + 1}</span>
            <div>
              <strong>{label}</strong>
              <small>{note}</small>
            </div>
          </button>
        </React.Fragment>
      ))}
    </nav>
  );
}

function App() {
  const [preferences, setPreferences] = useState(() => readPreferences(localStore)),
    [preferencesSaveFailed, setPreferencesSaveFailed] = useState(false);
  function updatePreferences(patch) {
    const next = normalizePreferences({ ...preferences, ...patch });
    setPreferences(next);
    setPreferencesSaveFailed(!writePreferences(localStore, next));
  }
  const [projects, setProjects] = useState([]),
    [pid, setPid] = useState(readStoredValue(localStore, 'campus-project', 'campus-demo')),
    [project, setProject] = useState(null),
    [view, setView] = useState(
      normalizeView(readStoredValue(localStore, 'campus-view', 'overview')),
    ),
    [loadingProject, setLoadingProject] = useState(true);
  const [health, setHealth] = useState(null),
    [docs, setDocs] = useState([]),
    [modal, setModal] = useState(null),
    [form, setForm] = useState({}),
    [error, setError] = useState(''),
    [toast, setToast] = useState(''),
    [saving, setSaving] = useState(false),
    [mobile, setMobile] = useState(false);
  const [cid, setCid] = useState(null),
    [messages, setMessages] = useState([]),
    [input, setInput] = useState(''),
    [mode, setMode] = useState('chat'),
    [taskIds, setTaskIds] = useState(null),
    [busy, setBusy] = useState(false),
    [run, setRun] = useState(null),
    [phase, setPhase] = useState(''),
    [conversationRuns, setConversationRuns] = useState([]),
    [loadingConversation, setLoadingConversation] = useState(false),
    [failureAttempt, setFailureAttempt] = useState(null),
    [draftSaveFailed, setDraftSaveFailed] = useState(false),
    [evidence, setEvidence] = useState([]),
    [selectedEvidence, setSelectedEvidence] = useState(null),
    [showSources, setShowSources] = useState(false),
    [search, setSearch] = useState(''),
    [taskFilter, setTaskFilter] = useState('all'),
    [taskSearch, setTaskSearch] = useState(''),
    [taskStateFilter, setTaskStateFilter] = useState('all'),
    [taskReadiness, setTaskReadiness] = useState('all'),
    [taskRequirement, setTaskRequirement] = useState(''),
    [docFilter, setDocFilter] = useState('all'),
    [docSearch, setDocSearch] = useState(''),
    [docCategory, setDocCategory] = useState('all');
  const [editingPlan, setEditingPlan] = useState(null),
    [selectedPlanId, setSelectedPlanId] = useState(null),
    [conversationSearch, setConversationSearch] = useState(''),
    [taskConflict, setTaskConflict] = useState(null),
    [pendingTasks, setPendingTasks] = useState([]);
  const initialForm = useRef(null);
  const formPending = useRef(false);
  const modalKeyboard = useRef(null);
  const [formDraft, setFormDraft] = useState(null);
  const [formDraftNotice, setFormDraftNotice] = useState('');
  const [leaveForm, setLeaveForm] = useState(false);
  const [formStorageFailed, setFormStorageFailed] = useState(false);
  const abort = useRef(null),
    bottom = useRef(null),
    autoScroll = useRef(true),
    currentCid = useRef(null),
    cursor = useRef(0),
    projectId = useRef(pid),
    selection = useRef(0),
    sending = useRef(false),
    draftContext = useRef({ projectId: null, conversationId: null }),
    draftValues = useRef({ text: input, mode }),
    evidenceCards = useRef(new Map()),
    composerInput = useRef(null);
  draftValues.current = { text: input, mode, taskIds };
  const notify = (text) => {
    setToast(text);
    setTimeout(() => setToast(''), 3500);
  };
  async function refresh(id = projectId.current) {
    const [ps, p] = await Promise.all([
      api('/projects'),
      id ? api('/projects/' + id) : Promise.resolve(null),
    ]);
    setProjects(ps);
    if (projectId.current === id) setProject(p);
    return p;
  }
  async function loadHealth() {
    try {
      setHealth(await api('/health'));
    } catch {
      setHealth({ status: 'degraded', detail: '接口层暂时不可用' });
    }
  }
  async function refreshKnowledge() {
    const data = await api('/documents');
    setDocs(data.documents);
    await loadHealth();
    notify(`资料已更新：${data.documents.length} 份资料`);
  }
  useEffect(() => {
    api('/projects')
      .then((ps) => {
        setProjects(ps);
        if (!ps.some((p) => p.id === pid)) setPid(ps[0]?.id || '');
      })
      .catch((e) => setError(e.message));
    loadHealth();
    api('/documents')
      .then((d) => setDocs(d.documents))
      .catch(() => {});
    const t = setInterval(loadHealth, 30000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    projectId.current = pid;
    activateDraft(pid, null);
    selection.current += 1;
    currentCid.current = null;
    setCid(null);
    setMessages([]);
    setEvidence([]);
    setSelectedEvidence(null);
    setRun(null);
    setConversationRuns([]);
    setFailureAttempt(null);
    setLoadingConversation(false);
    setBusy(false);
    setPhase('');
    setError('');
    setShowSources(false);
    setTaskSearch('');
    setTaskStateFilter('all');
    setTaskFilter('all');
    setTaskReadiness('all');
    setTaskRequirement('');
    setEditingPlan(null);
    setSelectedPlanId(null);
    setProject(null);
    setLoadingProject(true);
    abort.current?.abort();
    writeStoredValue(localStore, 'campus-project', pid);
    if (pid) {
      refresh(pid)
        .then((p) => {
          if (projectId.current !== pid) return;
          const stored = readStoredValue(localStore, 'campus-conversation-' + pid);
          if (
            readStoredValue(localStore, 'campus-view') === 'chat' &&
            p?.conversations?.some((c) => c.id === stored)
          ) {
            selectConversation(stored).catch((e) => setError(e.message));
          }
        })
        .catch((e) => {
          if (projectId.current === pid) setError(e.message);
        })
        .finally(() => {
          if (projectId.current === pid) setLoadingProject(false);
        });
    } else setLoadingProject(false);
  }, [pid]);
  useEffect(() => {
    setDraftSaveFailed(!persistCurrentDraft());
  }, [input, mode, taskIds]);
  useEffect(() => {
    const save = () => persistCurrentDraft();
    window.addEventListener('beforeunload', save);
    return () => {
      save();
      window.removeEventListener('beforeunload', save);
    };
  }, []);
  useEffect(() => {
    writeStoredValue(localStore, 'campus-view', view);
  }, [view]);
  useEffect(() => {
    if (
      taskRequirement &&
      project &&
      !project.requirements.some((item) => item.id === taskRequirement)
    )
      setTaskRequirement('');
  }, [project, taskRequirement]);
  useEffect(() => {
    if (preferences.autoScroll && autoScroll.current)
      bottom.current?.scrollIntoView({
        behavior:
          preferences.reduceMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
      });
  }, [messages, phase, preferences.autoScroll, preferences.reduceMotion]);
  useEffect(() => {
    if (selectedEvidence)
      evidenceCards.current.get(selectedEvidence)?.scrollIntoView({
        block: 'nearest',
        behavior:
          preferences.reduceMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
      });
  }, [selectedEvidence, evidence, showSources, preferences.reduceMotion]);
  useEffect(() => {
    const fn = (e) => {
      if (document.querySelector('.plan-editor')) return;
      if (e.key === 'Escape') {
        modalKeyboard.current.close();
        setMobile(false);
        setShowSources(false);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (!modalKeyboard.current.editing) {
          setModal('search');
          setSearch('');
        }
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);
  useEffect(() => {
    if (!modal) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = document.querySelector('.modal');
    const selector =
      'button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href]';
    const focusables = () =>
      [...(dialog?.querySelectorAll(selector) || [])].filter(
        (element) => element.offsetParent !== null,
      );
    const inputs = dialog?.querySelector('input,textarea,select');
    (inputs || focusables()[0])?.focus();
    const trap = (event) => {
      if (event.key !== 'Tab') return;
      const elements = focusables();
      if (!elements.length) return;
      const first = elements[0],
        last = elements[elements.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first || !dialog?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !dialog?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', trap);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [modal]);
  const safe =
    (fn) =>
    async (...args) => {
      setError('');
      try {
        return await fn(...args);
      } catch (e) {
        setError(e.message);
      }
    };
  function navigate(v) {
    setView(v);
    setMobile(false);
  }
  function openModal(name, value = {}) {
    setTaskConflict(null);
    setLeaveForm(false);
    setFormDraftNotice('');
    setFormStorageFailed(false);
    const key = formKey(name, pid, value.id);
    if (key) {
      const current = { ...value, ...formValues(name, value) };
      const draft = openFormDraft(localStore, key, name, current);
      const { restored } = draft;
      initialForm.current = restored?.base || current;
      setForm(restored?.value || current);
      setFormDraft(draft);
      if (restored) {
        setFormDraftNotice('已恢复此记录的草稿，请核对后保存。');
        if (current.id && restored.base.version !== current.version) {
          setTaskConflict({ base: restored.base, local: restored.value, current });
        }
      }
    } else {
      setForm(value);
      setFormDraft(null);
    }
    setModal(name);
    setError('');
  }
  function finishFormClose() {
    setFormDraft(null);
    setLeaveForm(false);
    setTaskConflict(null);
    setModal(modal === 'requirement' ? 'requirements' : null);
    setError('');
  }
  function requestModalClose() {
    if (formPending.current) return;
    if (formDraft && dirtyForm(formDraft.type, initialForm.current, form)) {
      setLeaveForm(true);
      return;
    }
    if (formDraft) finishFormClose();
    else setModal(null);
  }
  function keepFormDraft() {
    const result = formDraft.save(initialForm.current, form);
    setFormStorageFailed(result !== 'saved');
    if (result === 'saved') finishFormClose();
  }
  function discardFormDraft() {
    if (formDraft.discard() === 'unavailable') {
      setFormStorageFailed(true);
      setError('无法清除浏览器中已保存的草稿。请保留此窗口并检查浏览器存储。');
      return;
    }
    finishFormClose();
  }
  modalKeyboard.current = { close: requestModalClose, editing: !!formDraft };
  useEffect(() => {
    if (!formDraft) return;
    setFormStorageFailed(formDraft.save(initialForm.current, form) !== 'saved');
    const beforeUnload = (event) => {
      if (!formPending.current && !dirtyForm(formDraft.type, initialForm.current, form)) return;
      if (!formPending.current && formDraft.save(initialForm.current, form) === 'saved') return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [formDraft, form]);
  function prepareReview(task) {
    if (busy || loadingConversation) return;
    const prepared = appendReviewDraft(draftValues.current.text, reviewQuestion(task));
    if (!prepared.ok) {
      setError(
        '现有输入草稿较长，追加评审问题会超过 4,000 字。请先发送或整理草稿，再带入评审。原草稿已保留。',
      );
      return;
    }
    const next = { text: prepared.text, mode: 'reviewer', taskIds: task?.id ? [task.id] : null };
    draftValues.current = next;
    setInput(next.text);
    setMode(next.mode);
    setTaskIds(next.taskIds);
    setModal(null);
    navigate('chat');
    requestAnimationFrame(() => composerInput.current?.focus({ preventScroll: true }));
    setDraftSaveFailed(!persistCurrentDraft());
    notify('评审问题已加入输入草稿，检查后发送');
  }
  function inspectTasks({ readiness = 'all', requirementId = '' } = {}) {
    setTaskSearch('');
    setTaskFilter('all');
    setTaskStateFilter('all');
    setTaskReadiness(readiness);
    setTaskRequirement(requirementId);
    setModal(null);
    navigate('tasks');
  }
  function persistCurrentDraft() {
    const context = draftContext.current;
    if (!context.projectId) return true;
    return writeDraft(localStore, context.projectId, context.conversationId, draftValues.current);
  }
  function activateDraft(nextProject, nextConversation, fallback = null) {
    persistCurrentDraft();
    const restored = readDraft(localStore, nextProject, nextConversation);
    const chosen = restored || fallback || { text: '', mode: 'chat' };
    draftContext.current = { projectId: nextProject, conversationId: nextConversation };
    draftValues.current = chosen;
    setInput(chosen.text);
    setMode(chosen.mode);
    setTaskIds(chosen.taskIds ?? null);
    return restored;
  }
  async function submitForm(e) {
    e.preventDefault();
    if (formPending.current || taskConflict || leaveForm || !formDraft) return;
    formPending.current = true;
    setSaving(true);
    setError('');
    try {
      const values = formValues(modal, form);
      const payload = { ...values, expected_version: form.version };
      let targetProject = pid;
      if (modal === 'newProject' || modal === 'editProject') {
        payload.deadline = payload.deadline || null;
        const result = await api(
          modal === 'newProject' ? '/projects' : '/projects/' + pid,
          modal === 'newProject' ? post(payload) : { method: 'PUT', body: JSON.stringify(payload) },
        );
        targetProject = result.id;
      } else {
        const collection = modal === 'requirement' ? 'requirements' : 'tasks';
        const path = '/projects/' + pid + '/' + collection;
        await api(
          form.id ? path + '/' + form.id : path,
          form.id ? { method: 'PUT', body: JSON.stringify(payload) } : post(payload),
        );
      }
      const removed = formDraft.discard() === 'saved';
      finishFormClose();
      notify(removed ? '已保存' : '记录已保存，浏览器暂未能清除旧草稿');
      if (modal === 'newProject') {
        setPid(targetProject);
        setView('overview');
      }
      await refresh(targetProject).catch(() => notify('记录已保存，请重新打开项目同步列表'));
    } catch (error) {
      if (
        ['task_changed', 'project_changed', 'requirement_changed'].includes(error.code) &&
        error.current?.id === form.id
      ) {
        setTaskConflict({ base: initialForm.current, local: { ...form }, current: error.current });
        await refresh().catch(() => {});
      }
      setError(error.message);
    } finally {
      formPending.current = false;
      setSaving(false);
    }
  }
  async function deleteRecord(path, version) {
    try {
      await api(deletePath(path, version), { method: 'DELETE' });
    } catch (error) {
      if (error.code === 'delete_changed') await refresh().catch(() => {});
      throw error;
    }
  }
  async function removeTask(task) {
    if (formPending.current || !confirm('删除任务“' + task.title + '”？')) return;
    formPending.current = true;
    setSaving(true);
    try {
      await deleteRecord('/projects/' + pid + '/tasks/' + task.id, task.version);
      removeStoredValue(localStore, formKey('task', pid, task.id));
      finishFormClose();
      await refresh().catch(() => {});
      notify('任务已删除');
    } finally {
      formPending.current = false;
      setSaving(false);
    }
  }
  async function updateTask(t, status) {
    const originalProject = pid;
    if (pendingTasks.includes(t.id)) return;
    setPendingTasks((items) => [...items, t.id]);
    try {
      await api(`/projects/${originalProject}/tasks/${t.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, expected_version: t.version }),
      });
      await refresh(originalProject);
    } catch (e) {
      if (e.code === 'task_changed') {
        await refresh(originalProject);
        if (projectId.current === originalProject)
          setError('这项任务已更新，已重新读取看板。原操作没有覆盖新内容，请核对后再切换状态。');
      } else throw e;
    } finally {
      setPendingTasks((items) => items.filter((id) => id !== t.id));
    }
  }
  async function newConversation() {
    const originalProject = projectId.current;
    abort.current?.abort();
    selection.current += 1;
    const c = await api(`/projects/${originalProject}/conversations`, post({ title: '新的对话' }));
    if (projectId.current !== originalProject) return null;
    const carry = !currentCid.current ? { ...draftValues.current } : null;
    activateDraft(originalProject, c.id, carry);
    currentCid.current = c.id;
    writeStoredValue(localStore, 'campus-conversation-' + originalProject, c.id);
    setCid(c.id);
    setMessages([]);
    setEvidence([]);
    setSelectedEvidence(null);
    setRun(null);
    setConversationRuns([]);
    setFailureAttempt(null);
    setLoadingConversation(false);
    setBusy(false);
    setPhase('');
    await refresh();
    return c.id;
  }
  async function selectConversation(id) {
    abort.current?.abort();
    const selected = ++selection.current;
    const originalProject = projectId.current;
    const restoredDraft = activateDraft(originalProject, id);
    setBusy(false);
    setLoadingConversation(true);
    setFailureAttempt(null);
    setConversationRuns([]);
    setMessages([]);
    setEvidence([]);
    setRun(null);
    setPhase('正在恢复会话记录');
    currentCid.current = id;
    setCid(id);
    navigate('chat');
    let d;
    try {
      d = await api(`/conversations/${id}/messages`);
    } catch (error) {
      if (selected === selection.current) {
        setLoadingConversation(false);
        setPhase('记录加载失败，可重新打开会话');
      }
      throw error;
    }
    if (selected !== selection.current || originalProject !== projectId.current) return;
    setLoadingConversation(false);
    writeStoredValue(localStore, 'campus-conversation-' + originalProject, id);
    setMessages(d.messages);
    setConversationRuns(d.runs);
    const last = [...d.messages].reverse().find((m) => m.evidence?.length);
    setEvidence(last?.evidence || []);
    setSelectedEvidence(null);
    const active = d.runs.find((r) => ['running', 'queued'].includes(r.status));
    const latest = d.runs[0];
    if (
      latest &&
      !restoredDraft &&
      !draftValues.current.text.trim() &&
      draftValues.current.mode === 'chat'
    )
      setMode(latest.mode);
    setPhase(
      active
        ? '运行仍在进行，正在同步结果'
        : latest?.status === 'failed'
          ? '上次运行未完成'
          : latest?.status === 'cancelled'
            ? '上次运行已停止'
            : latest
              ? '已恢复历史记录'
              : '',
    );
    setRun(active?.id || null);
    if (active) {
      setBusy(true);
      cursor.current = 0;
      const controller = new AbortController();
      abort.current = controller;
      try {
        const response = await fetch(
          `/api/runs/${active.id}/events?after=${d.last_event_id || 0}`,
          { signal: controller.signal },
        );
        await consumeSSE(response, (e) => {
          if (selected === selection.current) handleEvent(e, id);
        });
      } catch (e) {
        if (e.name !== 'AbortError' && selected === selection.current)
          setError('连接已中断，可以同步已有运行；不会自动重复提交问题');
      } finally {
        if (currentCid.current === id && selected === selection.current) {
          setBusy(false);
          const h = await api(`/conversations/${id}/messages`);
          if (selected === selection.current) {
            setMessages(h.messages);
            setConversationRuns(h.runs);
          }
          await refresh(originalProject);
        }
      }
    }
  }
  function updateRunState(id, changes) {
    setConversationRuns((runs) => [
      { ...runs.find((item) => item.id === id), id, ...changes },
      ...runs.filter((item) => item.id !== id),
    ]);
  }
  function handleEvent(e, id, replay = false) {
    if (currentCid.current !== id) return;
    cursor.current = e.event_id;
    const d = e.data;
    if (e.type === 'run.started') {
      setRun(e.run_id);
      updateRunState(e.run_id, { status: 'running', mode: d.mode });
      setPhase('任务已开始');
    }
    if (e.type === 'status') setPhase(d.text);
    if (e.type === 'retrieval.completed') {
      setEvidence(d.evidence);
      setPhase('资料已找到，开始生成');
    }
    if (e.type === 'role.started') {
      setPhase((roles[d.role]?.[0] || '助手') + '正在生成');
      setMessages((ms) =>
        ms.some((m) => m.id === d.message_id)
          ? ms
          : [
              ...ms,
              {
                id: d.message_id,
                role: d.role,
                content: '',
                status: 'streaming',
                evidence: d.evidence,
                task_scope: d.task_scope,
                run_id: e.run_id,
              },
            ],
      );
    }
    if (e.type === 'message.delta' && !replay)
      setMessages((ms) =>
        ms.map((m) => (m.id === d.message_id ? { ...m, content: m.content + d.text } : m)),
      );
    if (e.type === 'role.completed')
      setMessages((ms) =>
        ms.map((m) => (m.id === d.message_id ? { ...m, content: d.content, status: d.status } : m)),
      );
    if (e.type === 'plan.proposed') {
      notify('候选计划已生成，请检查后确认');
      refresh().catch(() => {});
    }
    if (e.type === 'run.failed') {
      updateRunState(e.run_id, { status: 'failed', error: d.text });
      setPhase('运行未完成');
      setError(d.text);
    }
    if (e.type === 'run.cancelled') {
      updateRunState(e.run_id, { status: 'cancelled' });
      setPhase('已停止');
    }
    if (e.type === 'run.completed') {
      updateRunState(e.run_id, { status: 'completed' });
      setPhase('本次协作已完成');
    }
  }
  async function send(
    text = input,
    selectedMode = mode,
    { preserveDraft = false, selectedTasks = taskIds } = {},
  ) {
    const requestedTasks = ['planner', 'reviewer'].includes(selectedMode) ? selectedTasks : null;
    text = text.trim();
    if (!text || busy || sending.current || loadingConversation) return;
    if (requestedTasks && taskSelection(requestedTasks, tasks).missing) {
      setError('部分任务已移出项目。请调整下一轮读取范围后再发送。');
      return;
    }
    if (recovery?.kind === 'resume') {
      setError('这次运行仍未结束，请先同步已有运行或停止它。');
      return;
    }
    sending.current = true;
    const originalProject = projectId.current;
    const fromNewDraft = !cid;
    setError('');
    autoScroll.current = true;
    setView('chat');
    let id = cid;
    try {
      if (!id) id = await newConversation();
    } catch (error) {
      sending.current = false;
      throw error;
    }
    if (!id || originalProject !== projectId.current) {
      sending.current = false;
      return;
    }
    currentCid.current = id;
    const sendSelection = selection.current;
    if (!preserveDraft && canRestoreQuestion(draftValues.current.text, text)) setInput('');
    setFailureAttempt(null);
    setBusy(true);
    setPhase('正在连接资料与模型');
    const localMessageId = 'local-' + Date.now();
    setMessages((ms) => [
      ...ms,
      { id: localMessageId, role: 'user', content: text, status: 'complete' },
    ]);
    const controller = new AbortController();
    abort.current = controller;
    const requestId = crypto.randomUUID();
    let acceptedRun = null;
    try {
      const response = await fetch(`/api/conversations/${id}/chat/stream`, {
        ...post({ text, mode: selectedMode, request_id: requestId, task_ids: requestedTasks }),
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });
      const rid = response.headers.get('X-Run-ID');
      if (rid) {
        acceptedRun = rid;
        setRun(rid);
        updateRunState(rid, { status: 'running', mode: selectedMode, request_id: requestId });
        setMessages((items) =>
          items.map((item) => (item.id === localMessageId ? { ...item, run_id: rid } : item)),
        );
        if (fromNewDraft)
          writeDraft(localStore, originalProject, null, { text: '', mode: selectedMode });
      }
      await consumeSSE(response, (e) => {
        if (sendSelection === selection.current) handleEvent(e, id);
      });
    } catch (e) {
      if (
        e.name !== 'AbortError' &&
        currentCid.current === id &&
        sendSelection === selection.current
      ) {
        setError(e.message || '连接中断，可同步已有运行或查看记录后重试');
        if (!acceptedRun)
          setFailureAttempt({
            kind: 'retry',
            status: 'not_started',
            text,
            mode: selectedMode,
            taskIds: requestedTasks,
            runId: null,
          });
        if (!acceptedRun && !preserveDraft && !draftValues.current.text.trim()) setInput(text);
      }
    } finally {
      sending.current = false;
      if (currentCid.current === id && sendSelection === selection.current) {
        setBusy(false);
        try {
          const d = await api(`/conversations/${id}/messages`);
          if (sendSelection === selection.current) {
            setMessages(d.messages);
            setConversationRuns(d.runs);
            const known = d.runs.find((item) => item.request_id === requestId);
            if (known) {
              setFailureAttempt(null);
              if (known.status === 'completed') {
                setError('');
                setPhase('本次结果已保存');
              }
            }
          }
          await refresh();
        } catch {}
      }
      loadHealth();
    }
  }
  async function stop() {
    if (run) await api(`/runs/${run}/cancel`, post({}));
    setPhase('正在停止');
    if (!busy && cid) await selectConversation(cid);
  }
  function restoreQuestion() {
    if (!recovery?.text) return;
    if (!canRestoreQuestion(input, recovery.text)) {
      notify('输入框已有其他草稿，已保留；直接重试不会清空它。');
      return;
    }
    setInput(recovery.text);
    setMode(recovery.mode);
    setTaskIds(recovery.taskIds ?? null);
    composerInput.current?.focus();
  }
  async function applyPlan(plan) {
    const result = await api(`/projects/${pid}/plans/${plan.id}/apply`, post({}));
    await refresh();
    notify(`${result.message}，新增 ${result.added} 项`);
  }
  async function savedPlanRevision(proposal) {
    if (projectId.current !== proposal.project_id) return;
    setProject(
      (current) =>
        current && {
          ...current,
          plans: [proposal, ...(current.plans || []).filter((item) => item.id !== proposal.id)],
        },
    );
    setSelectedPlanId(proposal.id);
    notify('人工修订已另存为新版本，请核对后再应用');
    try {
      await refresh(proposal.project_id);
    } catch {
      notify('新版本已保存，项目列表暂未刷新；可稍后重新打开');
    }
  }
  async function openLatestPlan() {
    const plan = project?.plans?.[0];
    if (!plan) {
      navigate('chat');
      setMode('plan');
      return;
    }
    const result = await api('/runs/' + plan.run_id);
    await selectConversation(result.conversation_id);
  }
  async function renameConversation(c) {
    const title = prompt('会话名称', c.title);
    if (!title?.trim()) return;
    try {
      await api(`/conversations/${c.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title, expected_version: c.version }),
      });
    } catch (error) {
      if (error.code === 'conversation_changed') await refresh().catch(() => {});
      throw error;
    }
    await refresh();
  }
  async function removeConversation(c) {
    if (!confirm('删除这段会话及其运行记录？')) return;
    await deleteRecord('/conversations/' + c.id, c.delete_version);
    if (cid === c.id) {
      activateDraft(projectId.current, null, { ...draftValues.current });
      currentCid.current = null;
      setCid(null);
      setMessages([]);
      setConversationRuns([]);
      setFailureAttempt(null);
      setRun(null);
      removeStoredValue(localStore, 'campus-conversation-' + projectId.current);
    }
    await refresh();
  }
  function exportProject(format = 'md') {
    window.location.href = `/api/projects/${pid}/export?format=${format}`;
  }
  const tasks = project?.tasks || [],
    requirements = project?.requirements || [],
    done = tasks.filter((t) => t.status === 'done').length,
    doing = tasks.filter((t) => t.status === 'doing').length,
    progress = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const conversationPlans = (project?.plans || []).filter((p) =>
    messages.some((m) => m.run_id === p.run_id),
  );
  const latestPlan = conversationPlans.find((p) => p.id === selectedPlanId) || conversationPlans[0];
  const historyRecovery = runRecovery(messages, conversationRuns);
  const recovery =
    historyRecovery?.kind === 'resume' ? historyRecovery : failureAttempt || historyRecovery;
  const currentStep = workflowStep(requirements, project?.plans || [], tasks);
  const execution = executionSummary(requirements, tasks);
  const visibleDocs = filteredDocuments(docs, docFilter, docSearch, docCategory);
  const visibleTasks = filterExecution(
    filteredTasks(tasks, {
      query: taskSearch,
      priority: taskFilter,
      status: taskStateFilter,
    }),
    tasks,
    { readiness: taskReadiness, requirementId: taskRequirement },
  );
  const hasTaskFilter =
    !!taskSearch.trim() ||
    taskFilter !== 'all' ||
    taskStateFilter !== 'all' ||
    taskReadiness !== 'all' ||
    !!taskRequirement;
  const documentCategories = [...new Set(docs.map((doc) => doc.category).filter(Boolean))];
  const sharedSearch = (t) =>
    `${t.title || t.name} ${t.description || ''}`.toLowerCase().includes(search.toLowerCase());
  const chatMode = CHAT_MODES[normalizeMode(mode)];
  function toggleSources() {
    if (window.matchMedia('(min-width: 801px)').matches) {
      updatePreferences({ sourcesVisible: !(preferences.sourcesVisible || showSources) });
      setShowSources(false);
    } else setShowSources((value) => !value);
  }
  function closeSources() {
    setShowSources(false);
    if (window.matchMedia('(min-width: 801px)').matches)
      updatePreferences({ sourcesVisible: false });
  }

  return (
    <div
      className={`app-shell reading-${preferences.readingSize} contrast-${preferences.contrast}${preferences.reduceMotion ? ' reduce-motion' : ''}`}
    >
      {mobile && <div className="sidebar-scrim" onClick={() => setMobile(false)} />}
      <aside className={'sidebar ' + (mobile ? 'open' : '')}>
        <Brand />
        <div className="space-caption">
          我的学习空间 <span>个人版</span>
        </div>
        <button className="workspace-picker" onClick={() => openModal('switchProject')}>
          <span className="project-mini">
            <FolderOpen size={18} />
          </span>
          <span>
            {project?.name || '选择项目'}
            <small>{project?.course || '开始新的探索'}</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <nav>
          {navs.map(([key, label, Icon]) => (
            <button
              key={key}
              className={view === key ? 'active' : ''}
              onClick={() => navigate(key)}
            >
              <Icon size={19} />
              {label}
              {key === 'chat' && <span className="new-label">AI</span>}
              {key === 'tasks' && (
                <span className="nav-count">{tasks.filter((t) => t.status !== 'done').length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-divider" />
        <div className="section-caption">
          最近对话{' '}
          <IconButton
            title="新建对话"
            onClick={safe(async () => {
              navigate('chat');
              await newConversation();
            })}
          >
            <Plus size={15} />
          </IconButton>
        </div>
        <div className="recent-conversations">
          {project?.conversations?.slice(0, 6).map((c) => (
            <div className={'conversation-row ' + (cid === c.id ? 'selected' : '')} key={c.id}>
              <button onClick={safe(() => selectConversation(c.id))}>
                <MessageCircle size={14} />
                <span>{c.title}</span>
              </button>
              <IconButton title="重命名会话" onClick={safe(() => renameConversation(c))}>
                <Pencil size={12} />
              </IconButton>
              <IconButton title="删除会话" onClick={safe(() => removeConversation(c))}>
                <X size={12} />
              </IconButton>
            </div>
          ))}
          {!project?.conversations?.length && (
            <p className="sidebar-empty">你的好想法，会从这里开始。</p>
          )}
        </div>
        {!!project?.conversations?.length && (
          <button
            className="all-conversations"
            onClick={() => {
              setConversationSearch('');
              openModal('conversations');
            }}
          >
            全部会话 <span>{project.conversations.length}</span>
            <ChevronRight size={13} />
          </button>
        )}
        <div className="sidebar-bottom">
          <div className="knowledge-tip">
            <span className="tiny-spark">
              <Sparkles size={16} />
            </span>
            <strong>让每一步都有依据</strong>
            <p>
              连接课程要求与技术资料，
              <br />
              把模糊想法变成清晰行动。
            </p>
            <button onClick={() => navigate('library')}>
              探索资料库 <ArrowUpRight size={14} />
            </button>
          </div>
          <button
            className="user-profile"
            aria-label="工作空间设置"
            onClick={() => openModal('settings')}
          >
            <span className="avatar">同</span>
            <span>
              我的工作空间<small>阅读与对话设置</small>
            </span>
            <Settings2 size={17} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <IconButton
              title="打开导航"
              className="icon-button mobile-menu"
              onClick={() => setMobile(true)}
            >
              <PanelLeft size={20} />
            </IconButton>
            <span>工作空间</span>
            <ChevronRight size={13} />
            <strong>{navs.find((n) => n[0] === view)?.[1]}</strong>
          </div>
          <div className="topbar-actions">
            <button
              className="search-trigger"
              aria-label="搜索工作空间"
              onClick={() => {
                setSearch('');
                setModal('search');
              }}
            >
              <Search size={16} />
              <span>搜索项目、任务或资料</span>
              <kbd>⌘ K</kbd>
            </button>
            <span
              className={'service-indicator ' + (health?.status === 'ok' ? 'online' : '')}
              title={health?.detail}
            >
              <i />
              {!health ? '服务检查中' : health.ollama ? '服务已连接' : '模型未连接'}
            </span>
            <button className="help-link" onClick={() => openModal('about')}>
              使用指南
            </button>
            <IconButton title="工作空间设置" onClick={() => openModal('settings')}>
              <Settings2 size={17} />
            </IconButton>
          </div>
        </header>
        {error && (
          <div className="error-banner" role="alert">
            <AlertCircle size={17} />
            <span>{error}</span>
            <IconButton title="关闭提示" onClick={() => setError('')}>
              <X size={16} />
            </IconButton>
          </div>
        )}
        {loadingProject ? (
          <div className="empty-project" role="status">
            <LoaderCircle size={32} className="spin" />
            <h1>正在打开你的项目</h1>
            <p>恢复要求、任务和最近记录…</p>
          </div>
        ) : !project ? (
          <div className="empty-project">
            <FolderOpen size={45} />
            <h1>从一个新项目开始</h1>
            <p>记录你的目标，让下一步变得清晰。</p>
            <button
              className="btn primary"
              onClick={() =>
                openModal('newProject', { name: '', course: '', brief: '', skills: '', budget: '' })
              }
            >
              <Plus size={17} />
              新建项目
            </button>
          </div>
        ) : (
          <>
            {view === 'overview' && (
              <main className="page overview-page">
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">从想法到行动 / YOUR NEXT STEP</div>
                    <h1>
                      好项目，从清晰的下一步开始<span className="heading-dot">.</span>
                    </h1>
                    <p>整理要求、一起思考，再把计划变成真正的进展。</p>
                  </div>
                  <button
                    className="btn"
                    onClick={() =>
                      openModal('newProject', {
                        name: '',
                        course: '',
                        brief: '',
                        skills: '',
                        budget: '',
                      })
                    }
                  >
                    <Plus size={17} />
                    新建项目
                  </button>
                </div>
                <ProjectFlow
                  active={currentStep}
                  requirements={requirements.length}
                  onRequirements={() => openModal('requirements')}
                  onPlan={() => {
                    navigate('chat');
                    setMode('plan');
                  }}
                  onConfirm={safe(openLatestPlan)}
                  onTasks={() => navigate('tasks')}
                />
                <section className="project-hero">
                  <div className="hero-copy">
                    <div className="hero-kicker">
                      <span className="pill-dot" /> 当前项目{' '}
                      {project.id === 'campus-demo' && (
                        <span className="hero-course">示例项目</span>
                      )}
                      <span className="hero-course">{project.course}</span>
                    </div>
                    <h2>{project.name}</h2>
                    <p>{project.brief || '还没有项目简介，先记录你的想法吧。'}</p>
                    <div className="hero-meta">
                      <span>
                        <CalendarDays size={15} />
                        {project.deadline ? '截止 ' + project.deadline : '截止日期待确认'}
                      </span>
                      <span>
                        <Flag size={15} />
                        {requirements.length} 项已确认要求
                      </span>
                    </div>
                    <div className="hero-buttons">
                      <button
                        className="btn dark"
                        onClick={() => {
                          navigate('chat');
                          setMode('plan');
                          setInput(
                            '请根据已确认的要求，为这个项目制定最小可演示版本，评审可行性并拆解任务。',
                          );
                        }}
                      >
                        和 AI 一起规划 <ArrowUpRight size={17} />
                      </button>
                      <button
                        className="hero-edit"
                        onClick={() => openModal('editProject', project)}
                      >
                        编辑项目 <Pencil size={13} />
                      </button>
                    </div>
                  </div>
                  <div className="hero-art" aria-hidden="true">
                    <div className="orbit orbit-one" />
                    <div className="orbit orbit-two" />
                    <span className="art-star">✳</span>
                    <div className="art-note">
                      <div className="art-note-head">
                        <span className="art-target">
                          <Target size={19} />
                        </span>
                        <b>从这里开始</b>
                        <MoreHorizontal size={17} />
                      </div>
                      <div className="art-line long" />
                      <div className="art-line" />
                      <div className="art-note-task">
                        <span>
                          <Check size={10} />
                        </span>
                        理解项目要求
                      </div>
                      <div className="art-note-task">
                        <span>
                          <Check size={10} />
                        </span>
                        找到关键资料
                      </div>
                      <div className="art-note-task unfinished">
                        <span />
                        迈出下一步
                      </div>
                      <div className="art-note-foot">
                        <i />
                        <i />
                        <i />
                        <small>让好想法落地</small>
                      </div>
                    </div>
                    <div className="art-float">
                      <Sparkles size={17} />
                      <span>一点灵感，一步进展</span>
                    </div>
                    <span className="art-plus">+</span>
                  </div>
                </section>
                <section className="stats-grid">
                  <div className="stat-card">
                    <span className="stat-icon lavender">
                      <ListChecks size={21} />
                    </span>
                    <div>
                      <span>项目任务</span>
                      <strong>
                        {tasks.length}
                        <small>项</small>
                      </strong>
                    </div>
                    <span className="stat-detail">一步一步，有迹可循</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-icon blue">
                      <Clock3 size={21} />
                    </span>
                    <div>
                      <span>正在推进</span>
                      <strong>
                        {doing}
                        <small>项</small>
                      </strong>
                    </div>
                    <span className="stat-detail">专注当下这一步</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-icon green">
                      <CheckCheck size={21} />
                    </span>
                    <div>
                      <span>已完成</span>
                      <strong>
                        {done}
                        <small>项</small>
                      </strong>
                    </div>
                    <span className="stat-detail">每一小步，都算数</span>
                  </div>
                  <div className="stat-card progress-stat">
                    <div className="progress-ring" style={{ '--progress': progress + '%' }}>
                      <span>
                        {progress}
                        <small>%</small>
                      </span>
                    </div>
                    <div>
                      <span>整体进度</span>
                      <strong className="progress-label">
                        {progress === 100 ? '任务已全部标记完成' : '持续向前中'}
                      </strong>
                      <small>按用户记录计算，仍需实际验收</small>
                    </div>
                  </div>
                </section>
                <button className="execution-banner" onClick={() => openModal('execution')}>
                  <span className="execution-banner-icon">
                    <ListChecks size={22} />
                  </span>
                  <span>
                    <strong>看看要求有没有落实到任务</strong>
                    <small>
                      {execution.teachers.length
                        ? `${execution.linked} / ${execution.teachers.length} 项老师要求已有任务关联`
                        : '尚未确认老师要求'}{' '}
                      · {execution.missingAcceptance.length} 项任务待补验收标准
                    </small>
                  </span>
                  <span className="execution-banner-action">
                    执行检查 <ArrowRight size={16} />
                  </span>
                </button>
                <div className="overview-columns">
                  <section className="panel focus-panel">
                    <div className="panel-heading">
                      <div>
                        <h3>
                          接下来，做什么<span className="heading-dot">?</span>
                        </h3>
                        <p>前置已满足的任务中，优先展示进行中和高优先级。</p>
                      </div>
                      <button className="text-button" onClick={() => navigate('tasks')}>
                        全部任务 <ArrowRight size={15} />
                      </button>
                    </div>
                    <div className="focus-tasks">
                      {execution.focus.slice(0, 4).map((t) => (
                        <button
                          className="focus-task"
                          key={t.id}
                          onClick={() => openModal('task', t)}
                        >
                          <span className={'task-circle ' + t.status}>
                            {t.status === 'doing' && <span />}
                          </span>
                          <span className="focus-task-body">
                            <strong>{t.title}</strong>
                            <small>{t.description}</small>
                          </span>
                          <span className={'status-pill ' + t.status}>{statuses[t.status]}</span>
                          <ChevronRight size={15} />
                        </button>
                      ))}
                      {!execution.focus.length && (
                        <div className="small-empty">
                          <CheckCircle2 size={25} />
                          <p>
                            {execution.blocked.length
                              ? '未完成任务都在等待前置，请到执行检查查看。'
                              : tasks.length
                                ? '任务已全部标记完成，请继续核对实际验收。'
                                : '还没有执行任务，可以添加任务或先讨论计划。'}
                          </p>
                        </div>
                      )}
                    </div>
                    <button
                      className="add-task-line"
                      onClick={() =>
                        openModal('task', {
                          title: '',
                          description: '',
                          status: 'todo',
                          priority: 'medium',
                          acceptance: '',
                        })
                      }
                    >
                      <Plus size={16} />
                      添加一个小任务
                    </button>
                  </section>
                  <section className="panel requirements-panel">
                    <div className="panel-heading">
                      <div>
                        <h3>先把要求看清楚</h3>
                        <p>好计划，始于明确的边界。</p>
                      </div>
                      <IconButton title="管理项目要求" onClick={() => openModal('requirements')}>
                        <ArrowUpRight size={18} />
                      </IconButton>
                    </div>
                    <div className="requirements-list">
                      {requirements.slice(0, 3).map((r) => (
                        <div key={r.id}>
                          <span className={'requirement-type ' + r.kind}>{kinds[r.kind]}</span>
                          <p>{r.text}</p>
                        </div>
                      ))}
                      {!requirements.length && (
                        <p className="muted">还没有要求，添加老师的说明或你的个人约束。</p>
                      )}
                    </div>
                    <button
                      className="requirements-footer"
                      onClick={() => openModal('requirements')}
                    >
                      <ShieldCheck size={15} />
                      {requirements.length} 项要求 · 来源清晰可查
                      <ChevronRight size={14} />
                    </button>
                  </section>
                </div>
                <section className="bottom-grid">
                  <button
                    className="quick-card"
                    onClick={() => {
                      navigate('chat');
                      setMode('chat');
                      setInput('根据当前课程要求，我必须做哪些功能？哪些只是建议？');
                    }}
                  >
                    <span className="quick-icon">
                      <MessagesSquare size={23} />
                    </span>
                    <div>
                      <strong>卡住的时候，问一问</strong>
                      <p>带着来源回答，让每个决定有依据。</p>
                    </div>
                    <ArrowUpRight size={19} />
                  </button>
                  <button className="quick-card warm" onClick={() => navigate('library')}>
                    <span className="quick-icon">
                      <BookOpen size={23} />
                    </span>
                    <div>
                      <strong>为项目，找一点灵感</strong>
                      <p>
                        {health?.knowledge?.documents || docs.length}{' '}
                        份技术资料与方法模板，按需探索。
                      </p>
                    </div>
                    <ArrowUpRight size={19} />
                  </button>
                </section>
                <footer className="page-footer">
                  课题工坊 <span>·</span> 把想法落地，把成长留下。
                  <button onClick={() => exportProject()}>
                    导出项目记录 <Download size={13} />
                  </button>
                </footer>
              </main>
            )}

            {view === 'chat' && (
              <main className="chat-page">
                <section className="conversation-main">
                  <div className="chat-header">
                    <div>
                      <h2>
                        想清楚，再向前一步 <Sparkles size={19} />
                      </h2>
                      <p>
                        {project.name} · {requirements.length} 项已确认要求 · {tasks.length}{' '}
                        项真实任务
                      </p>
                    </div>
                    <div className="chat-header-actions">
                      <button
                        className="btn small"
                        onClick={toggleSources}
                        aria-label="切换资料依据面板"
                      >
                        <BookOpen size={15} />
                        资料依据
                      </button>
                      <button className="btn small" onClick={safe(newConversation)}>
                        <Plus size={15} />
                        新对话
                      </button>
                    </div>
                  </div>
                  <div className="chat-workflow-note">
                    <ShieldCheck size={14} />
                    <span>
                      {mode === 'plan'
                        ? '先确认要求，再生成草稿和评审；候选计划经过核对后才会加入任务。'
                        : '回复依据当前项目要求与技术资料，角色讨论不会自动修改任务。'}
                    </span>
                    <button onClick={() => openModal('requirements')}>
                      查看要求 <ChevronRight size={12} />
                    </button>
                  </div>
                  <div className="mode-tabs">
                    {Object.entries(CHAT_MODES).map(([key, item]) => {
                      const ModeIcon = {
                        chat: BookOpen,
                        planner: Target,
                        reviewer: ShieldCheck,
                        plan: Sparkles,
                      }[key];
                      return (
                        <button
                          key={key}
                          className={mode === key ? 'selected' : ''}
                          aria-pressed={mode === key}
                          disabled={busy || loadingConversation}
                          onClick={() => setMode(key)}
                        >
                          <ModeIcon size={14} />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mode-description">{chatMode.description}</p>
                  <AgentJourney
                    run={conversationRuns[0]}
                    messages={messages}
                    plans={project.plans || []}
                  />
                  <div
                    className="messages-scroll"
                    onScroll={(e) => {
                      autoScroll.current =
                        e.currentTarget.scrollHeight -
                          e.currentTarget.scrollTop -
                          e.currentTarget.clientHeight <
                        100;
                    }}
                  >
                    {!messages.length ? (
                      <div className="chat-empty">
                        <div className="chat-empty-logo">
                          <Sparkles size={30} />
                        </div>
                        <span className="eyebrow">YOUR PROJECT, TOGETHER</span>
                        <h2>{chatMode.heading}</h2>
                        <p>可以在同一会话中切换角色，讨论记录会保留。</p>
                        <div className="role-intros">
                          <button
                            className={mode === 'planner' ? 'selected' : ''}
                            onClick={() => {
                              setMode('planner');
                              composerInput.current?.focus();
                            }}
                          >
                            <span className="role-avatar planner">P</span>
                            <strong>项目规划员</strong>
                            <p>理清目标，拆出可执行的下一步。</p>
                          </button>
                          <button
                            className={mode === 'reviewer' ? 'selected' : ''}
                            onClick={() => {
                              setMode('reviewer');
                              composerInput.current?.focus();
                            }}
                          >
                            <span className="role-avatar reviewer">R</span>
                            <strong>方案评审员</strong>
                            <p>检查范围、依赖与遗漏的要求。</p>
                          </button>
                        </div>
                        <div className="suggestion-grid">
                          {chatMode.suggestions.map((q) => (
                            <button
                              key={q}
                              onClick={() => {
                                setInput(q);
                                composerInput.current?.focus();
                              }}
                            >
                              {q}
                              <ArrowUpRight size={14} />
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      messages.map((m) => (
                        <article className={'message ' + m.role} key={m.id}>
                          {m.role === 'user' ? (
                            <div className="user-message">
                              <p>{m.content}</p>
                              <span className="avatar">我</span>
                            </div>
                          ) : (
                            <>
                              <div className="message-head">
                                <span className={'role-avatar ' + m.role}>
                                  {roles[m.role]?.[1] || 'A'}
                                </span>
                                <strong>{roles[m.role]?.[0] || '资料助手'}</strong>
                                <span>{messageState(m).label}</span>
                                <button
                                  className="text-button copy-button"
                                  onClick={() =>
                                    navigator.clipboard
                                      .writeText(m.content)
                                      .then(() => notify('已复制'))
                                      .catch(() => setError('浏览器未允许复制'))
                                  }
                                >
                                  复制
                                </button>
                              </div>
                              <ScopeReceipt scope={m.task_scope} />
                              {messageState(m).note && (
                                <p
                                  className={'answer-state-note ' + messageState(m).tone}
                                  role="status"
                                >
                                  <AlertCircle size={15} />
                                  <span>{messageState(m).note}</span>
                                </p>
                              )}
                              {m.evidence?.some(
                                (item) => item.kind === 'task' && item.saved_task,
                              ) && (
                                <>
                                  <PanelBoundary label="任务记录快照">
                                    <Suspense
                                      fallback={
                                        <p className="snapshot-loading" role="status">
                                          正在打开本轮任务记录…
                                        </p>
                                      }
                                    >
                                      <TaskSnapshot
                                        evidence={m.evidence}
                                        onCitation={(id) => {
                                          setEvidence(m.evidence);
                                          setSelectedEvidence(id);
                                          setShowSources(true);
                                        }}
                                      />
                                    </Suspense>
                                  </PanelBoundary>
                                  <p className="review-generation-label">
                                    AI 讨论与建议 · 请对照上方记录核对
                                  </p>
                                </>
                              )}
                              <div
                                className="message-content"
                                onClick={() => {
                                  if (m.evidence?.length) setEvidence(m.evidence);
                                }}
                              >
                                <RichText
                                  onCitation={(id) => {
                                    setEvidence(m.evidence || []);
                                    setSelectedEvidence(id);
                                    setShowSources(true);
                                  }}
                                >
                                  {m.content}
                                </RichText>
                                {m.status === 'streaming' && <span className="typing-cursor" />}
                              </div>
                              <TaskReferences
                                message={m}
                                onSelect={(item) => {
                                  setEvidence(m.evidence);
                                  setSelectedEvidence(item.id);
                                  setShowSources(true);
                                }}
                              />
                              {m.evidence?.length > 0 && (
                                <button
                                  className="source-link"
                                  onClick={() => {
                                    setEvidence(m.evidence);
                                    setSelectedEvidence(null);
                                    setShowSources(true);
                                  }}
                                >
                                  <Link2 size={13} />
                                  查看本轮 {m.evidence.length} 条依据
                                </button>
                              )}
                            </>
                          )}
                        </article>
                      ))
                    )}
                    {conversationPlans.length > 1 && (
                      <label className="plan-version-picker">
                        候选计划版本
                        <select
                          value={latestPlan.id}
                          onChange={(event) => setSelectedPlanId(event.target.value)}
                        >
                          {conversationPlans.map((plan, index) => (
                            <option key={plan.id} value={plan.id}>
                              {index === 0 ? '最新 · ' : ''}
                              {plan.content.edited_by === 'user' ? '人工修订' : 'AI 草稿'}
                              {' · ' +
                                new Date(plan.created_at).toLocaleString('zh-CN', {
                                  month: 'numeric',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                })}
                              {plan.status === 'applied' ? ' · 已应用' : ' · 待核对'}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {latestPlan && (
                      <PlanReview
                        plan={latestPlan}
                        projectId={pid}
                        requirements={requirements}
                        existingTasks={tasks}
                        onApply={safe(applyPlan)}
                        onViewTasks={() => navigate('tasks')}
                        onEdit={() => setEditingPlan(latestPlan)}
                        onReplan={() => {
                          setMode('plan');
                          setInput(
                            '请根据评审提醒和未覆盖的课程要求修订计划，保留已完成任务，明确每项要求对应的任务与验收标准。',
                          );
                        }}
                      />
                    )}
                    <div ref={bottom} />
                  </div>
                  <div className="composer-area">
                    {['planner', 'reviewer'].includes(mode) && (
                      <DiscussionScope
                        key={`${pid}/${cid || ''}`}
                        tasks={tasks}
                        value={taskIds}
                        previous={previousTaskScope(messages, tasks)}
                        onChange={setTaskIds}
                        disabled={busy || loadingConversation}
                      />
                    )}
                    {!busy && !loadingConversation && recovery && (
                      <RunRecovery
                        recovery={recovery}
                        draft={input}
                        onRestore={restoreQuestion}
                        onRetry={safe(() =>
                          send(recovery.text, recovery.mode, {
                            preserveDraft: true,
                            selectedTasks: recovery.taskIds ?? null,
                          }),
                        )}
                        onResume={safe(() => selectConversation(cid))}
                        onStop={safe(stop)}
                      />
                    )}
                    {phase && (
                      <div className="run-status">
                        {busy || loadingConversation ? (
                          <LoaderCircle size={13} className="spin" />
                        ) : recovery ? (
                          <AlertCircle size={13} />
                        ) : (
                          <CheckCircle2 size={13} />
                        )}
                        <span>{phase}</span>
                        {run && !busy && (
                          <button onClick={safe(() => selectConversation(cid))}>同步记录</button>
                        )}
                      </div>
                    )}
                    <form
                      className="composer"
                      onSubmit={(e) => {
                        e.preventDefault();
                        safe(send)();
                      }}
                    >
                      <textarea
                        ref={composerInput}
                        aria-label="对话输入"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={chatMode.placeholder}
                        onKeyDown={(e) => {
                          if (shouldSendKey(e, preferences)) {
                            e.preventDefault();
                            safe(send)();
                          }
                        }}
                      />
                      <div className="composer-bottom">
                        <span>
                          <span className={'dot ' + (health?.ollama ? 'green-dot' : '')} />
                          {chatMode.label}{' '}
                          <span className="composer-model">· {health?.model || '本地模型'}</span>
                        </span>
                        {busy ? (
                          <button
                            type="button"
                            className="send-button stop"
                            onClick={safe(stop)}
                            disabled={!run}
                            aria-label="停止生成"
                          >
                            <Square size={16} />
                          </button>
                        ) : (
                          <button
                            className="send-button"
                            disabled={
                              !input.trim() || loadingConversation || recovery?.kind === 'resume'
                            }
                            aria-label="发送消息"
                          >
                            <ArrowRight size={20} />
                          </button>
                        )}
                      </div>
                    </form>
                    <p className="composer-note">
                      {preferences.sendShortcut === 'mod-enter'
                        ? 'Ctrl / ⌘ + Enter 发送，Enter 换行。'
                        : 'Enter 发送，Shift + Enter 换行。'}{' '}
                      AI 建议与引用内容仍需核对。
                    </p>
                    {draftSaveFailed && (
                      <p className="draft-save-warning" role="status">
                        浏览器未能保存草稿，请暂时保留此页面，或手动复制输入内容。
                      </p>
                    )}
                  </div>
                </section>
                {showSources && (
                  <div className="source-scrim" onClick={() => setShowSources(false)} />
                )}
                <aside
                  className={
                    'evidence-panel ' +
                    (!preferences.sourcesVisible ? 'desktop-hidden ' : '') +
                    (showSources ? 'mobile-open' : '')
                  }
                >
                  <div className="evidence-heading">
                    <BookOpen size={17} />
                    <strong>回答依据</strong>
                    <span>{evidence.length}</span>
                    <IconButton
                      title="关闭来源面板"
                      className="icon-button close-sources"
                      onClick={closeSources}
                    >
                      <X size={17} />
                    </IconButton>
                  </div>
                  <p className="evidence-note">
                    保留本条消息的依据快照。要求、资料与任务记录分开展示。
                  </p>
                  {evidence.length ? (
                    evidence.map((e) => (
                      <div
                        key={e.id}
                        ref={(node) => {
                          if (node) evidenceCards.current.set(e.id, node);
                          else evidenceCards.current.delete(e.id);
                        }}
                        className={
                          'evidence-card ' + (selectedEvidence === e.id ? 'highlight' : '')
                        }
                      >
                        <div>
                          <span className="source-id">{e.id}</span>
                          <span className={'requirement-type ' + e.kind}>
                            {kinds[e.kind] || '参考资料'}
                          </span>
                        </div>
                        <h4>{e.title}</h4>
                        {e.heading && (
                          <div className="source-section">
                            <FileText size={11} />
                            <span>{e.heading}</span>
                          </div>
                        )}
                        <p>
                          {e.text.slice(0, selectedEvidence === e.id ? 1800 : 240)}
                          {e.text.length > 240 && selectedEvidence !== e.id ? '…' : ''}
                        </p>
                        <button
                          className="text-button"
                          onClick={() =>
                            setSelectedEvidence(selectedEvidence === e.id ? null : e.id)
                          }
                        >
                          {selectedEvidence === e.id ? '收起片段' : '展开片段'}
                          <ChevronDown size={12} />
                        </button>
                        {e.source && (
                          <a href={e.source} target="_blank" rel="noreferrer">
                            {e.heading ? '打开对应章节' : '来源'} <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="evidence-empty">
                      <FileText size={30} />
                      <p>
                        开始提问后，
                        <br />
                        相关资料会出现在这里。
                      </p>
                    </div>
                  )}
                  <div className="evidence-bottom">
                    <ShieldCheck size={15} />
                    只展示实际检索到的资料
                  </div>
                </aside>
              </main>
            )}

            {view === 'tasks' && (
              <main className="page tasks-page">
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">SMALL STEPS, REAL PROGRESS</div>
                    <h1>
                      把计划，变成进展<span className="heading-dot">.</span>
                    </h1>
                    <p>每完成一小步，项目就更靠近你的目标。</p>
                  </div>
                  <button
                    className="btn primary"
                    onClick={() =>
                      openModal('task', {
                        title: '',
                        description: '',
                        status: 'todo',
                        priority: 'medium',
                        acceptance: '',
                      })
                    }
                  >
                    <Plus size={16} />
                    添加任务
                  </button>
                </div>
                <button className="execution-banner" onClick={() => openModal('execution')}>
                  <span className="execution-banner-icon">
                    <ListChecks size={22} />
                  </span>
                  <span>
                    <strong>执行检查</strong>
                    <small>
                      {execution.ready.length} 项前置已满足 · {execution.blocked.length} 项等待前置
                      · {execution.missingAcceptance.length} 项待补验收
                    </small>
                  </span>
                  <span className="execution-banner-action">
                    查看要求关联 <ArrowRight size={16} />
                  </span>
                </button>
                <div className="board-toolbar">
                  <span>
                    {project.name} <ChevronRight size={13} /> {tasks.length} 项任务
                  </span>
                  <div>
                    <button
                      className={'filter-pill ' + (taskFilter === 'all' ? 'selected' : '')}
                      onClick={() => setTaskFilter('all')}
                    >
                      全部优先级
                    </button>
                    <button
                      className={'filter-pill ' + (taskFilter === 'high' ? 'selected' : '')}
                      onClick={() => setTaskFilter('high')}
                    >
                      高优先级
                    </button>
                    <button
                      className="text-button"
                      onClick={() => {
                        setMode('plan');
                        navigate('chat');
                        setInput('结合当前任务和项目要求，帮我检查遗漏并提出下一步任务。');
                      }}
                    >
                      <Sparkles size={15} />
                      AI 帮我拆解
                    </button>
                  </div>
                </div>
                <div className="task-filters">
                  <div className="inline-search">
                    <Search size={15} />
                    <input
                      aria-label="搜索任务"
                      placeholder="搜索任务、说明或验收标准…"
                      value={taskSearch}
                      onChange={(e) => setTaskSearch(e.target.value)}
                    />
                    {taskSearch && (
                      <IconButton title="清空任务搜索" onClick={() => setTaskSearch('')}>
                        <X size={13} />
                      </IconButton>
                    )}
                  </div>
                  <select
                    aria-label="按任务状态筛选"
                    value={taskStateFilter}
                    onChange={(e) => setTaskStateFilter(e.target.value)}
                  >
                    <option value="all">全部状态</option>
                    {Object.entries(statuses).map(([value, label]) => (
                      <option value={value} key={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="按执行检查筛选"
                    value={taskReadiness}
                    onChange={(e) => setTaskReadiness(e.target.value)}
                  >
                    <option value="all">全部执行情况</option>
                    <option value="ready">前置已满足 · 未完成</option>
                    <option value="blocked">等待前置</option>
                    <option value="acceptance">待补验收标准</option>
                  </select>
                  <select
                    aria-label="按关联要求筛选"
                    value={taskRequirement}
                    onChange={(e) => setTaskRequirement(e.target.value)}
                  >
                    <option value="">全部要求关联</option>
                    {requirements.map((r) => (
                      <option value={r.id} key={r.id}>
                        {kinds[r.kind]} · {r.text.slice(0, 36)}
                        {r.text.length > 36 ? '…' : ''}
                      </option>
                    ))}
                  </select>
                  <span>
                    显示 {visibleTasks.length} / {tasks.length} 项
                  </span>
                  {hasTaskFilter && (
                    <button
                      className="text-button"
                      onClick={() => {
                        setTaskSearch('');
                        setTaskFilter('all');
                        setTaskStateFilter('all');
                        setTaskReadiness('all');
                        setTaskRequirement('');
                      }}
                    >
                      清除筛选
                    </button>
                  )}
                </div>
                {hasTaskFilter && !visibleTasks.length && (
                  <div className="task-filter-empty">
                    <Search size={16} />
                    <span>没有匹配的任务。可以换个关键词，或清除筛选查看全部。</span>
                  </div>
                )}
                <div className="kanban-board">
                  {Object.entries(statuses).map(([status, label]) => (
                    <section
                      className={'kanban-column ' + status}
                      key={status}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const task = tasks.find(
                          (t) => t.id === e.dataTransfer.getData('text/plain'),
                        );
                        if (task) safe(() => updateTask(task, status))();
                      }}
                    >
                      <div className="column-heading">
                        <span className="column-dot" />
                        <h3>{label}</h3>
                        <span>{visibleTasks.filter((t) => t.status === status).length}</span>
                        <IconButton
                          title={'添加' + label + '任务'}
                          onClick={() =>
                            openModal('task', {
                              title: '',
                              description: '',
                              status,
                              priority: 'medium',
                              acceptance: '',
                            })
                          }
                        >
                          <Plus size={17} />
                        </IconButton>
                      </div>
                      <div className="column-cards">
                        {visibleTasks
                          .filter((t) => t.status === status)
                          .map((t) => (
                            <article
                              className="task-card"
                              draggable={!pendingTasks.includes(t.id)}
                              onDragStart={(e) => e.dataTransfer.setData('text/plain', t.id)}
                              key={t.id}
                            >
                              <div className="task-card-top">
                                <span className={'priority ' + t.priority}>
                                  <i />
                                  {t.priority === 'high'
                                    ? '高优先级'
                                    : t.priority === 'medium'
                                      ? '中优先级'
                                      : '低优先级'}
                                </span>
                                <IconButton title="编辑任务" onClick={() => openModal('task', t)}>
                                  <MoreHorizontal size={17} />
                                </IconButton>
                              </div>
                              <button className="task-title" onClick={() => openModal('task', t)}>
                                {t.title}
                              </button>
                              <p>{t.description || '添加任务说明，让下一步更清晰。'}</p>
                              {taskDependencies(t, tasks).some((dep) => !dep.done) && (
                                <div className="task-blocked-label">
                                  <Clock3 size={12} />
                                  {
                                    taskDependencies(t, tasks).filter((dep) => !dep.done).length
                                  }{' '}
                                  项前置尚未完成
                                </div>
                              )}
                              {t.acceptance && (
                                <div className="acceptance-hint">
                                  <CheckCircle2 size={12} />
                                  <span>{t.acceptance}</span>
                                </div>
                              )}
                              {taskDependencies(t, tasks).length > 0 && (
                                <div className="task-dependencies">
                                  <Link2 size={12} />
                                  <div>
                                    {taskDependencies(t, tasks).map((dep) => (
                                      <span
                                        key={dep.id}
                                        className={dep.done ? 'done' : 'pending'}
                                        title={dep.title}
                                      >
                                        {dep.done ? '✓ ' : '先完成：'}
                                        {dep.title}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <div className="task-card-footer">
                                <select
                                  aria-label={'任务状态：' + t.title}
                                  value={t.status}
                                  disabled={pendingTasks.includes(t.id)}
                                  onChange={(e) => safe(() => updateTask(t, e.target.value))()}
                                >
                                  {Object.entries(statuses).map(([k, v]) => (
                                    <option
                                      value={k}
                                      key={k}
                                      disabled={
                                        k === 'done' &&
                                        taskDependencies(t, tasks).some((dep) => !dep.done)
                                      }
                                    >
                                      {v}
                                      {k === 'done' &&
                                      taskDependencies(t, tasks).some((dep) => !dep.done)
                                        ? '（先完成依赖）'
                                        : ''}
                                    </option>
                                  ))}
                                </select>
                                <span>
                                  {t.plan_id ? (
                                    <>
                                      <Sparkles size={12} />
                                      计划任务
                                    </>
                                  ) : (
                                    <>
                                      <Pencil size={12} />
                                      手动任务
                                    </>
                                  )}
                                </span>
                              </div>
                              {listValue(t.requirement_ids).length > 0 && (
                                <button
                                  className="task-requirement-link"
                                  onClick={() => openModal('task', t)}
                                >
                                  <ListChecks size={12} />
                                  关联 {listValue(t.requirement_ids).length} 项要求
                                  <ChevronRight size={12} />
                                </button>
                              )}
                              <button
                                className="task-review-link"
                                disabled={busy || loadingConversation}
                                onClick={() => prepareReview(t)}
                              >
                                <MessageCircle size={13} />
                                带入评审员对话
                                <ArrowUpRight size={13} />
                              </button>
                            </article>
                          ))}
                        <button
                          className="board-add"
                          onClick={() =>
                            openModal('task', {
                              title: '',
                              description: '',
                              status,
                              priority: 'medium',
                              acceptance: '',
                            })
                          }
                        >
                          <Plus size={15} />
                          添加任务
                        </button>
                      </div>
                    </section>
                  ))}
                </div>
                <div className="board-note">
                  <Lightbulb size={16} />
                  任务可拖动，也可通过卡片底部菜单切换状态。重新规划会先产生候选计划，确认后才添加任务。
                </div>
              </main>
            )}

            {view === 'library' && (
              <main className="page library-page">
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">GOOD IDEAS START WITH GOOD SOURCES</div>
                    <h1>
                      让每个决定，都有依据<span className="heading-dot">.</span>
                    </h1>
                    <p>精选技术资料与项目方法。老师要求归属于各自项目，不混用。</p>
                  </div>
                  <div className="library-heading-actions">
                    <span className="library-count">
                      <BookOpen size={19} />
                      {docs.length} 份资料
                    </span>
                    <button className="btn small" onClick={safe(refreshKnowledge)}>
                      <RotateCcw size={14} />
                      刷新资料
                    </button>
                  </div>
                </div>
                <div className="library-banner">
                  <span className="stat-icon lavender">
                    <Library size={25} />
                  </span>
                  <div>
                    <h3>校园项目资料包</h3>
                    <p>
                      独立资料索引 · {health?.knowledge?.chunks || 0} 个片段 · 保留来源与资料类型
                    </p>
                  </div>
                  <span className="tag">本地独立</span>
                </div>
                <div className="library-toolbar">
                  <div>
                    {[
                      ['all', '全部资料'],
                      ['official', '官方文档'],
                      ['guide', '方法建议'],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        className={'filter-pill ' + (docFilter === key ? 'selected' : '')}
                        onClick={() => setDocFilter(key)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="inline-search">
                    <Search size={15} />
                    <input
                      aria-label="筛选资料"
                      placeholder="搜索标题、来源或主题…"
                      value={docSearch}
                      onChange={(e) => setDocSearch(e.target.value)}
                    />
                  </div>
                </div>
                {documentCategories.length > 0 && (
                  <nav className="library-topics" aria-label="按资料主题筛选">
                    <button
                      className={docCategory === 'all' ? 'selected' : ''}
                      onClick={() => setDocCategory('all')}
                    >
                      全部主题<span>{docs.length}</span>
                    </button>
                    {documentCategories.map((category) => (
                      <button
                        key={category}
                        className={docCategory === category ? 'selected' : ''}
                        onClick={() => setDocCategory(category)}
                      >
                        {categoryNames[category] || category}
                        <span>{docs.filter((doc) => doc.category === category).length}</span>
                      </button>
                    ))}
                  </nav>
                )}
                <div className="library-results">
                  <span>
                    找到 {visibleDocs.length} 份资料{' '}
                    {docSearch.trim() && '· “' + docSearch.trim() + '”'}
                  </span>
                  {(docSearch || docFilter !== 'all' || docCategory !== 'all') && (
                    <button
                      onClick={() => {
                        setDocSearch('');
                        setDocFilter('all');
                        setDocCategory('all');
                      }}
                    >
                      清除筛选
                    </button>
                  )}
                </div>
                <div className="documents-grid">
                  {visibleDocs.map((d) => (
                    <button
                      key={d.id}
                      className="document-card"
                      onClick={safe(async () => {
                        const chunks = await api(`/documents/${d.id}/chunks`);
                        openModal('document', { ...d, chunks });
                      })}
                    >
                      <span className={'doc-icon ' + d.kind}>
                        {d.kind === 'official' ? <BookOpen size={23} /> : <Lightbulb size={23} />}
                      </span>
                      <span className={'requirement-type ' + d.kind}>{kinds[d.kind]}</span>
                      <h3>{d.title}</h3>
                      <p>
                        {d.category && (
                          <span className="document-topic">
                            {categoryNames[d.category] || d.category} ·{' '}
                          </span>
                        )}
                        {d.kind === 'official'
                          ? '保留原文片段及官方链接，按需检索技术依据。'
                          : '项目范围、任务拆解与交付建议，使用时结合实际要求。'}
                      </p>
                      <div>
                        <span>{d.chunks} 个片段</span>
                        <ArrowUpRight size={16} />
                      </div>
                    </button>
                  ))}
                </div>
                {docs.length > 0 && !visibleDocs.length && (
                  <div className="small-empty">
                    <Search size={28} />
                    <p>没有找到匹配的资料，试试 React、表单、请求或任务等关键词。</p>
                    <button
                      className="btn small"
                      onClick={() => {
                        setDocSearch('');
                        setDocFilter('all');
                        setDocCategory('all');
                      }}
                    >
                      查看全部资料
                    </button>
                  </div>
                )}
                {!docs.length && (
                  <div className="small-empty">
                    <Library size={30} />
                    <p>资料索引尚未准备好，请运行资料包构建脚本。</p>
                  </div>
                )}
                <div className="library-disclaimer">
                  <ShieldCheck size={16} />
                  <p>方法模板是建议，不是教师评分规则。当前项目的要求可在项目总览中管理。</p>
                </div>
              </main>
            )}
          </>
        )}
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={17} />
          {toast}
        </div>
      )}
      {editingPlan && (
        <PanelBoundary
          key={editingPlan.id}
          fallback={
            <div className="modal-backdrop">
              <section
                className="modal"
                role="dialog"
                aria-modal="true"
                aria-label="修订窗口加载失败"
              >
                <p className="settings-load-state" role="alert">
                  修订窗口暂时无法打开，请刷新后重新打开。原计划与已保存草稿保留。
                </p>
                <button className="btn" onClick={() => setEditingPlan(null)}>
                  关闭
                </button>
              </section>
            </div>
          }
        >
          <Suspense
            fallback={
              <div className="modal-backdrop">
                <section
                  className="modal"
                  role="dialog"
                  aria-modal="true"
                  aria-label="正在打开修订窗口"
                >
                  <p className="settings-load-state" role="status">
                    正在打开修订窗口…
                  </p>
                  <button className="btn" onClick={() => setEditingPlan(null)}>
                    关闭
                  </button>
                </section>
              </div>
            }
          >
            <PlanEditor
              key={editingPlan.id}
              plan={editingPlan}
              projectId={pid}
              initialRequirements={requirements}
              onClose={() => setEditingPlan(null)}
              onSaved={savedPlanRevision}
            />
          </Suspense>
        </PanelBoundary>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) requestModalClose();
          }}
        >
          <section
            className={
              'modal ' +
              ([
                'requirements',
                'document',
                'search',
                'settings',
                'conversations',
                'execution',
              ].includes(modal)
                ? 'wide'
                : '')
            }
            role="dialog"
            aria-modal="true"
            aria-labelledby="workspace-dialog-title"
          >
            <div className="modal-heading">
              <h2 id="workspace-dialog-title">
                {
                  {
                    newProject: '开始一个新项目',
                    editProject: '编辑项目简报',
                    requirement: form.id ? '编辑已确认要求' : '确认一项要求',
                    requirements: '已确认的项目要求',
                    task: form.id ? '编辑任务' : '添加一个小任务',
                    switchProject: '我的项目',
                    document: form.title,
                    search: '搜索工作空间',
                    about: '关于课题工坊',
                    settings: '工作空间设置',
                    conversations: '会话记录',
                    execution: '项目执行检查',
                  }[modal]
                }
              </h2>
              <IconButton title="关闭窗口" onClick={requestModalClose}>
                <X size={20} />
              </IconButton>
            </div>
            {modal === 'execution' && (
              <PanelBoundary label="执行检查">
                <Suspense
                  fallback={
                    <p className="settings-load-state" role="status">
                      正在打开执行检查…
                    </p>
                  }
                >
                  <ExecutionReview
                    summary={execution}
                    onFilter={inspectTasks}
                    onEdit={(task) => openModal('task', task)}
                    onAdd={(rid) =>
                      openModal('task', {
                        title: '',
                        description: '',
                        acceptance: '',
                        status: 'todo',
                        priority: 'medium',
                        requirement_ids: [rid],
                      })
                    }
                    onRequirements={() => openModal('requirements')}
                    onReview={prepareReview}
                    disabled={busy || loadingConversation}
                    error={error}
                  />
                </Suspense>
              </PanelBoundary>
            )}
            {modal === 'settings' && (
              <PanelBoundary>
                <Suspense
                  fallback={
                    <p className="settings-intro settings-load-state" role="status">
                      正在打开工作空间设置…
                    </p>
                  }
                >
                  <WorkspaceSettings
                    preferences={preferences}
                    onChange={updatePreferences}
                    storageFailed={preferencesSaveFailed}
                    health={health}
                    onRefresh={loadHealth}
                  />
                </Suspense>
              </PanelBoundary>
            )}
            {modal === 'conversations' && (
              <div className="conversation-library">
                <p>当前项目：{project.name}。打开历史会话后可以继续提问。</p>
                <div className="inline-search">
                  <Search size={16} />
                  <input
                    aria-label="筛选会话"
                    placeholder="按会话名称搜索…"
                    value={conversationSearch}
                    onChange={(event) => setConversationSearch(event.target.value)}
                  />
                </div>
                <div className="conversation-library-list">
                  {project.conversations
                    .filter((item) =>
                      item.title
                        .toLocaleLowerCase()
                        .includes(conversationSearch.trim().toLocaleLowerCase()),
                    )
                    .map((item) => (
                      <button
                        key={item.id}
                        onClick={safe(async () => {
                          await selectConversation(item.id);
                          setModal(null);
                        })}
                      >
                        <MessageCircle size={17} />
                        <span>
                          <strong>{item.title}</strong>
                          <small>
                            {new Date(item.created_at).toLocaleString('zh-CN')}
                            {item.id === cid ? ' · 当前会话' : ''}
                          </small>
                        </span>
                        <ChevronRight size={15} />
                      </button>
                    ))}
                </div>
                {!project.conversations.some((item) =>
                  item.title
                    .toLocaleLowerCase()
                    .includes(conversationSearch.trim().toLocaleLowerCase()),
                ) && <p className="history-empty">没有找到匹配的会话，试试其他关键词。</p>}
              </div>
            )}
            {['newProject', 'editProject', 'requirement', 'task'].includes(modal) && (
              <form className="modal-form" onSubmit={submitForm}>
                {formDraftNotice && (
                  <p className="form-hint" role="status">
                    {formDraftNotice}
                  </p>
                )}
                {formStorageFailed && (
                  <p className="form-error" role="alert">
                    草稿无法写入浏览器，或已在另一窗口更新。当前输入仍可编辑并保存到项目。
                  </p>
                )}
                {leaveForm && (
                  <section className="form-leave" aria-label="处理未保存的表单">
                    <strong>这份表单还有未保存的修改</strong>
                    <p>可以保留草稿供下次恢复，也可以放弃改动。</p>
                    <div className="scope-actions">
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => setLeaveForm(false)}
                      >
                        继续编辑
                      </button>
                      <button type="button" className="btn small" onClick={discardFormDraft}>
                        放弃草稿
                      </button>
                      <button type="button" className="btn small primary" onClick={keepFormDraft}>
                        保留草稿并关闭
                      </button>
                    </div>
                  </section>
                )}
                <fieldset className="record-fields" disabled={saving || leaveForm}>
                  {taskConflict ? (
                    <PanelBoundary label="记录更新比较">
                      <Suspense fallback={<p role="status">正在打开记录比较…</p>}>
                        <TaskConflict
                          key={taskConflict.current.version}
                          type={modal}
                          conflict={taskConflict}
                          tasks={tasks}
                          requirements={requirements}
                          onContinue={() => {
                            setTaskConflict(null);
                            setError('草稿已保留，保存时会再次核对当前版本。');
                          }}
                          onMerge={(merged, current) => {
                            initialForm.current = current;
                            setForm(merged);
                            setTaskConflict(null);
                            setError('');
                            notify('已合并到表单，请核对后保存');
                          }}
                        />
                      </Suspense>
                    </PanelBoundary>
                  ) : (
                    <RecordFields
                      modal={modal}
                      form={form}
                      setForm={setForm}
                      tasks={tasks}
                      requirements={requirements}
                    />
                  )}
                </fieldset>
                {error && <p className="form-error">{error}</p>}
                <div className="modal-footer">
                  {modal === 'task' && form.id && !taskConflict && !leaveForm && (
                    <button
                      type="button"
                      className="text-button danger"
                      disabled={saving}
                      onClick={safe(() => removeTask(form))}
                    >
                      <Trash2 size={15} />
                      删除任务
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn"
                    disabled={saving}
                    onClick={requestModalClose}
                  >
                    取消
                  </button>
                  <button className="btn primary" disabled={saving || !!taskConflict || leaveForm}>
                    {saving ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}保存
                  </button>
                </div>
              </form>
            )}
            {modal === 'switchProject' && (
              <div className="project-switch-list">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setPid(p.id);
                      setModal(null);
                      navigate('overview');
                    }}
                  >
                    <span className="project-mini">
                      <FolderOpen size={20} />
                    </span>
                    <span>
                      <strong>{p.name}</strong>
                      <small>
                        {p.course} · {p.task_count} 项任务
                      </small>
                    </span>
                    {p.id === pid ? <Check size={18} /> : <ChevronRight size={18} />}
                  </button>
                ))}
                <button
                  className="btn"
                  onClick={() =>
                    openModal('newProject', {
                      name: '',
                      course: '',
                      brief: '',
                      skills: '',
                      budget: '',
                    })
                  }
                >
                  <Plus size={17} />
                  新建项目
                </button>
              </div>
            )}
            {modal === 'requirements' && (
              <div className="requirements-modal">
                <p className="muted">
                  分别保存老师要求、个人约束和方法建议。修改要求后，请重新规划或人工修订旧候选计划，再核对应用。
                </p>
                {requirements.map((r) => (
                  <div className="requirement-detail" key={r.id}>
                    <span className={'requirement-type ' + r.kind}>{kinds[r.kind]}</span>
                    <p>{r.text}</p>
                    <small>来源：{r.source}</small>
                    <div className="requirement-actions">
                      <IconButton title="编辑这项要求" onClick={() => openModal('requirement', r)}>
                        <Pencil size={15} />
                      </IconButton>
                      <IconButton
                        title="删除这项要求"
                        onClick={safe(async () => {
                          const count = r.linked_task_count || 0;
                          if (confirm('删除这项要求？将解除 ' + count + ' 项任务的关联。')) {
                            await deleteRecord(
                              '/projects/' + pid + '/requirements/' + r.id,
                              r.delete_version,
                            );
                            removeStoredValue(localStore, formKey('requirement', pid, r.id));
                            await refresh();
                          }
                        })}
                      >
                        <Trash2 size={15} />
                      </IconButton>
                    </div>
                  </div>
                ))}
                <button
                  className="btn primary"
                  onClick={() =>
                    openModal('requirement', { text: '', kind: 'personal', source: '用户确认' })
                  }
                >
                  <Plus size={16} />
                  添加并确认要求
                </button>
              </div>
            )}
            {modal === 'document' && (
              <div className="document-modal">
                <div className="document-modal-meta">
                  <span className={'requirement-type ' + form.kind}>{kinds[form.kind]}</span>
                  <span>{form.chunks?.length} 个片段</span>
                  {form.category && <span>{categoryNames[form.category] || form.category}</span>}
                  {form.source && (
                    <a href={form.source} target="_blank" rel="noreferrer">
                      访问原文 <ExternalLink size={13} />
                    </a>
                  )}
                </div>
                {form.chunks?.map((c) => (
                  <div className="doc-chunk" key={c.id}>
                    <small>
                      {c.ordinal !== undefined ? `片段 ${Number(c.ordinal) + 1}` : c.id}
                      {c.heading && ` · ${c.heading}`}
                    </small>
                    <p>{c.text}</p>
                  </div>
                ))}
              </div>
            )}
            {modal === 'search' && (
              <div className="search-modal">
                <div className="search-box">
                  <Search size={19} />
                  <input
                    autoFocus
                    placeholder="搜索项目、任务或资料标题…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <h4>项目</h4>
                {projects.filter(sharedSearch).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setPid(p.id);
                      setModal(null);
                      navigate('overview');
                    }}
                  >
                    <FolderOpen size={17} />
                    {p.name}
                    <ChevronRight size={15} />
                  </button>
                ))}
                <h4>当前项目任务</h4>
                {tasks.filter(sharedSearch).map((t) => (
                  <button key={t.id} onClick={() => openModal('task', t)}>
                    <ListChecks size={17} />
                    {t.title}
                    <span>{statuses[t.status]}</span>
                  </button>
                ))}
                <h4>资料</h4>
                {docs
                  .filter((d) => d.title.toLowerCase().includes(search.toLowerCase()))
                  .slice(0, 8)
                  .map((d) => (
                    <button
                      key={d.id}
                      onClick={() => {
                        setDocSearch(search);
                        setModal(null);
                        navigate('library');
                      }}
                    >
                      <BookOpen size={17} />
                      {d.title}
                      <ArrowUpRight size={15} />
                    </button>
                  ))}
              </div>
            )}
            {modal === 'about' && (
              <div className="about-modal">
                <div className="chat-empty-logo">
                  <GraduationCap size={30} />
                </div>
                <h3>把作业要求，变成能执行的计划。</h3>
                <p>
                  课题工坊连接独立的校园资料库与两位项目伙伴，帮助你查询资料、制定和评审计划、管理真实任务。
                </p>
                <ol>
                  <li>编辑项目简报，添加并确认老师要求。</li>
                  <li>在 AI 协作中提问，或选择“规划与评审”。</li>
                  <li>检查候选计划，确认后添加到任务看板。</li>
                  <li>更新任务状态，随时回看对话与导出记录。</li>
                </ol>
                <div className="about-note">
                  本地个人工作空间。AI
                  建议以资料与实际课程要求为依据，时间估计不代表成绩或完成承诺。
                </div>
                <div className="modal-footer">
                  <button className="btn" onClick={() => exportProject('json')}>
                    <Download size={15} />
                    导出 JSON
                  </button>
                  <button className="btn primary" onClick={() => exportProject()}>
                    <Download size={15} />
                    导出 Markdown
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
