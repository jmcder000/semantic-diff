import React from 'react';

// function scoreToColor(score) {
//   if (score == null || Number.isNaN(score)) {
//     return 'hsla(210, 8%, 70%, 0.35)'; // neutral
//   }
//   const s = Math.min(1, Math.max(0, score));
//   const boosted = Math.pow(s, 0.5);
//   const hue = boosted * 120;             // 0 red → 120 green
//   const saturation = 100;
//   const lightness = 60 - boosted * 15;
//   const alpha = 0.85;
//   return `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;
// }
// function scoreToStroke(score) {
//   if (score == null || Number.isNaN(score)) return 'hsla(210, 8%, 45%, 0.5)';
//   const s = Math.min(1, Math.max(0, score));
//   const boosted = Math.pow(s, 0.65);
//   const hue = boosted * 120;
//   return `hsla(${hue}, 90%, 30%, 0.7)`;
// }

// Normalize to a 0..100 percentage, accepting 0..1, 0..100, or strings.
function toPercent(score) {
  if (score == null) return null;
  const n = typeof score === 'number' ? score : Number(score);
  if (!Number.isFinite(n)) return null;
  if (n <= 1) return Math.max(0, Math.min(1, n)) * 100; // assume 0..1
  return Math.max(0, Math.min(100, n));                  // assume 0..100
}

// Background color: <50 = very dark red; 50..100 = red→green ramp
function scoreToColor(score) {
  const pct = toPercent(score);
  if (pct == null) return 'hsla(210, 8%, 70%, 0.35)'; // neutral

  if (pct < 50) {
    // "very very dark red"
    return 'hsla(0, 95%, 22%, 0.90)';
  }

  // Map 50..100 to 0..1 and ramp hue 0→120 (red→green)
  const tRaw = (pct - 50) / 50;          // 0..1
  const t = Math.pow(tRaw, 0.6);         // gamma for extra punch
  const hue = t * 120;                   // 0 (red) → 120 (green)
  const saturation = 95;
  const lightness = 48;                  // fixed for stronger, consistent look
  const alpha = 0.9;

  return `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;
}

// Outline stroke to match hue, darker for contrast
function scoreToStroke(score) {
  const pct = toPercent(score);
  if (pct == null) return 'hsla(210, 8%, 45%, 0.6)';

  if (pct < 50) {
    return 'hsla(0, 90%, 18%, 0.9)';     // very dark red stroke
  }

  const tRaw = (pct - 50) / 50;
  const t = Math.pow(tRaw, 0.6);
  const hue = t * 120;
  return `hsla(${hue}, 90%, 28%, 0.85)`;
}

/**
 * spans: [{ charStart, charEnd, tooltip?, score?, bucket?, meta? }, ...]
 */
export default function HighlightedText({ text, spans = [], onSpanClick, debug }) {
  if (!text) return null;

  const cleaned = (spans || [])
    .filter(s => s && Number.isInteger(s.charStart) && Number.isInteger(s.charEnd) && s.charEnd > s.charStart)
    .sort((a, b) => a.charStart - b.charStart);

  if (debug) console.log('[HighlightedText] mount/render, spans:', cleaned.length);

  const segments = [];
  let cursor = 0;

  cleaned.forEach((s, i) => {
    const start = Math.max(0, Math.min(text.length, s.charStart));
    const end = Math.max(0, Math.min(text.length, s.charEnd));
    if (start > cursor) {
      segments.push({ type: 'text', key: `t-${i}-${cursor}`, content: text.slice(cursor, start) });
    }
    segments.push({
      type: 'mark',
      key: `m-${i}-${start}`,
      content: text.slice(start, end),
      tooltip: s.tooltip || '',
      score: s.score ?? s.meta?.score ?? null,
      bucket: s.bucket ?? s.meta?.bucket ?? null,
      meta: s.meta ?? null,
      idx: i,
    });
    cursor = end;
  });

  if (cursor < text.length) {
    segments.push({ type: 'text', key: `t-final-${cursor}`, content: text.slice(cursor) });
  }

  const handleClick = (seg) => onSpanClick?.(seg, seg.idx);

  return (
    <p className="whitespace-pre-wrap leading-relaxed">
      {segments.map(seg =>
        seg.type === 'mark' ? (
          <mark
            key={seg.key}
            role="button"
            tabIndex={0}
            title={seg.tooltip}
            onMouseDown={(e) => { e.stopPropagation(); }}
            onClick={(e) => { e.stopPropagation(); handleClick(seg); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(seg); } }}
            style={{
              backgroundColor: scoreToColor(seg.score),
              boxShadow: `inset 0 0 0 2px ${scoreToStroke(seg.score)}`
            }}
            className="px-0.5 rounded cursor-pointer transition"
          >
            {seg.content}
          </mark>
        ) : (
          <span key={seg.key}>{seg.content}</span>
        )
      )}
    </p>
  );
}
