export const CHAT_MODES = {
  chat: {
    label: '资料问答',
    role: 'assistant',
    heading: '带着具体问题，找到可靠依据。',
    description: '查询技术资料与课程原文，展开引用查看依据。',
    placeholder: '关于项目、要求或技术，你想了解什么？',
    suggestions: [
      '老师原文要求必须使用数据库吗？',
      'Fetch 返回 404，为什么没有进入 catch？',
      'React 页面可以如何划分组件？',
      '如何为发布表单设计可观察的验收标准？',
    ],
  },
  planner: {
    label: '规划员对话',
    role: 'planner',
    heading: '先和规划员，把方向聊清楚。',
    description: '多轮讨论目标、范围和开发顺序；讨论不会创建候选或任务。',
    placeholder: '说说你的目标、取舍或卡住的下一步…',
    suggestions: [
      '先聊聊当前项目的最小功能范围，暂不生成计划。',
      '我时间有限，哪些功能可以先放一放？',
      '参考已有任务，下一步应该先做什么？',
      '怎样把技术实现安排进八分钟以内的展示？',
    ],
  },
  reviewer: {
    label: '评审员对话',
    role: 'reviewer',
    heading: '把方案交给评审员，一起找遗漏。',
    description: '检查方案、任务依赖与验收标准；修改建议需要你确认后落实。',
    placeholder: '贴出方案，或请评审员检查当前项目与任务…',
    suggestions: [
      '评审当前项目范围，指出最需要处理的两项风险。',
      '目前任务的验收标准是否足够清楚？',
      '已有任务有没有漏掉确认过的课程要求？',
      '请从现场演示的角度检查这个项目。',
    ],
  },
  plan: {
    label: '规划与评审',
    role: 'planner',
    heading: '让两位伙伴，把方向整理成候选。',
    description: '规划员 → 评审员 → 候选计划；核对并确认后才加入任务。',
    placeholder: '描述你的目标，让两位伙伴一起帮你规划…',
    suggestions: [
      '根据当前项目与要求，整理最小可演示版本及候选任务。',
      '重新安排剩余工作，保留已有完成状态。',
      '请补齐展示、报告和验收准备的工作。',
      '根据评审意见修订计划，明确依赖与验收标准。',
    ],
  },
};

export function normalizeMode(mode) {
  return Object.hasOwn(CHAT_MODES, mode) ? mode : 'chat';
}

export function mentionedTaskRecords(text, evidence = []) {
  return evidence.filter(
    (item) =>
      item.kind === 'task' &&
      /^T\d+$/.test(item.id) &&
      new RegExp('(?:^|[^A-Za-z0-9])' + item.id + '(?!\\d)').test(text || ''),
  );
}

export function collaborationStages(run, messages, plans = []) {
  if (!run) return [];
  const mode = normalizeMode(run.mode),
    active = ['running', 'queued'].includes(run.status);
  const responses = messages.filter(
    (message) => message.run_id === run.id && message.role !== 'user',
  );
  const candidate = plans.find((plan) => plan.run_id === run.id);
  const roleState = (role) => {
    const message = responses.find((item) => item.role === role);
    if (!message) return 'waiting';
    return (
      { complete: 'done', streaming: 'active', unverified: 'attention', interrupted: 'stopped' }[
        message.status
      ] || 'waiting'
    );
  };
  const stages = [
    {
      key: 'retrieval',
      label: '读取要求与资料',
      state: responses.length || candidate ? 'done' : active ? 'active' : 'waiting',
    },
  ];
  if (mode === 'plan') {
    stages.push(
      { key: 'planner', label: '项目规划员', state: roleState('planner') },
      { key: 'reviewer', label: '方案评审员', state: roleState('reviewer') },
    );
    stages.push({
      key: 'candidate',
      label: candidate?.status === 'applied' ? '候选已应用' : '生成候选计划',
      state: candidate ? 'done' : active && roleState('reviewer') === 'done' ? 'active' : 'waiting',
    });
  } else {
    const role = CHAT_MODES[mode].role;
    stages.push({
      key: role,
      label: { assistant: '资料助手', planner: '项目规划员', reviewer: '方案评审员' }[role],
      state: roleState(role),
    });
  }
  if (active && !stages.some((stage) => stage.state === 'active')) {
    const pending = stages.find((stage) => stage.state === 'waiting');
    if (pending) pending.state = 'active';
  }
  if (['failed', 'cancelled'].includes(run.status)) {
    const interrupted =
      stages.find((stage) => ['active', 'stopped', 'attention'].includes(stage.state)) ||
      stages.find((stage) => stage.state === 'waiting');
    if (interrupted) interrupted.state = run.status === 'failed' ? 'failed' : 'stopped';
    for (const stage of stages) if (stage.state === 'active') stage.state = 'waiting';
  }
  return stages;
}
