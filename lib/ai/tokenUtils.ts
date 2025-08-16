export function estimateTokens(text: string): number {
  if (!text) return 0;
  // Simple heuristic: ~4 chars per token
  return Math.ceil(text.length / 4);
}

export function estimateMessagesTokens(messages: Array<{ content: any }>): number {
  let total = 0;
  for (const m of messages) {
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '');
    total += estimateTokens(content);
  }
  return total;
}

