import React from 'react';


function scoreToColor(score) {
  if (score == null || Number.isNaN(score)) {
    // neutral for NO_ANSWER / missing
    return 'hsla(210, 8%, 70%, 0.35)'; // cool gray, subtle
  }
  const s = Math.min(1, Math.max(0, score));

  // Nonlinear boost: gamma < 1 expands highs & lows (more contrast).
  // Try 0.65 for punchy; 0.5 for even stronger; 0.8 for milder.
  const boosted = Math.pow(s, 0.65);

  // Hue: 0 (red) → 120 (green)
  const hue = boosted * 120;

  // Higher saturation, darker greens so they "pop" more
  const saturation = 100;            // was ~90
  const lightness = 60 - boosted * 15; // ~60% at low (red), ~45% at high (green)

  // More visible alpha
  const alpha = 0.78;                // was 0.55

  return `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;
}

function scoreToStroke(score) {
  if (score == null || Number.isNaN(score)) {
    return 'hsla(210, 8%, 45%, 0.5)'; // darker neutral
  }
  const s = Math.min(1, Math.max(0, score));
  const boosted = Math.pow(s, 0.65);
  const hue = boosted * 120;
  // darker outline for contrast
  return `hsla(${hue}, 90%, 30%, 0.7)`;
}

/**
 * Renders `text` with highlights.
 * spans: [{ charStart, charEnd, tooltip?, meta? }, ...] — 0-based [start,end)
 * onSpanClick?: (segment, index) => void
 */
export default function HighlightedText({ text, spans = [], onSpanClick, debug }) {
  if (!text) return null;

  const cleaned = (spans || [])
    .filter(s =>
      s &&
      Number.isInteger(s.charStart) &&
      Number.isInteger(s.charEnd) &&
      s.charEnd > s.charStart
    )
    .sort((a, b) => a.charStart - b.charStart);

  if (debug) {
    console.log('[HighlightedText] mount/render, spans:', cleaned.length);
  }

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
      score: s.score ?? s.meta?.score ?? null,  // <— carry score forward
      bucket: s.bucket ?? s.meta?.bucket ?? null,
      meta: s.meta ?? null,
      idx: i
    });
    cursor = end;
  });

  if (cursor < text.length) {
    segments.push({ type: 'text', key: `t-final-${cursor}`, content: text.slice(cursor) });
  }

  const handleClick = (seg) => {
    onSpanClick?.(seg, seg.idx);
  };

  return (
    <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
      {segments.map(seg =>
        seg.type === 'mark' ? (
          <mark
            key={seg.key}
            role="button"
            tabIndex={0}
            title={seg.tooltip}
            onMouseDown={(e) => { e.stopPropagation(); }}
            onClick={(e) => { e.stopPropagation(); handleClick(seg); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleClick(seg);
              }
            }}
            style={{
              padding: '0 2px',
              borderRadius: 3,
              cursor: 'pointer',
              backgroundColor: scoreToColor(seg.score),
              // subtle outline adjusted by score (optional)
              boxShadow: `inset 0 0 0 2px ${scoreToStroke(seg.score)}`,
              transition: 'background-color 120ms ease-out, box-shadow 120ms ease-out'
            }}
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
