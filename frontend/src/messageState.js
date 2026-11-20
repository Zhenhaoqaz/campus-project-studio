export function messageState(message) {
  if (message.status === 'streaming') return { label: '正在生成', tone: 'pending', note: '' };
  if (message.status === 'complete')
    return { label: '已保存 · 内容需核对', tone: 'saved', note: '' };
  if (message.status === 'unverified')
    return {
      label: '待核验',
      tone: 'unverified',
      note: '这条回答未通过引用检查，可能缺少正式引用或存在无法对应的编号。请展开本轮依据核对，再决定如何使用。',
    };
  if (message.status === 'interrupted')
    return {
      label: '已中断',
      tone: 'interrupted',
      note: '这条回复只保留了部分输出，不能按完整结论使用。可查看已保存内容，并通过会话恢复入口决定是否重试。',
    };
  return {
    label: '状态待确认',
    tone: 'unknown',
    note: '暂时无法确认这条消息的完成状态，请同步会话记录后核对。',
  };
}
