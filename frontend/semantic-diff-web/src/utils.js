export function contextSnippet(text, start, end, window = 120) {
  if (start == null || end == null) return null;
  const s = Math.max(0, start - window);
  const e = Math.min(text.length, end + window);
  const before = text.slice(s, start);
  const mid = text.slice(start, end);
  const after = text.slice(end, e);
  return { before, mid, after, s, e };
}