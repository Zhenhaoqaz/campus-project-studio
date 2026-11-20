export function parseEventBlock(block) {
  const fields = block.split(/\r?\n/);
  const data = fields
    .filter((x) => x.startsWith('data:'))
    .map((x) => x.slice(5).trimStart())
    .join('\n');
  return data ? JSON.parse(data) : null;
}
export async function consumeSSE(response, onEvent) {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.detail === 'string' ? body.detail : '请求失败，请检查输入后重试');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let match;
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        const block = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        const event = parseEventBlock(block);
        if (event) onEvent(event);
      }
      if (done) {
        if (buffer.trim()) {
          const event = parseEventBlock(buffer);
          if (event) onEvent(event);
        }
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
