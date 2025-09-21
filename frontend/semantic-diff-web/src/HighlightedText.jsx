import React from 'react';


// Normalize to a 0..100 percentage, accepting 0..1, 0..100, or strings.
// Normalize to a 0..100 percent (accepts 0..1, 0..100, or strings)
function toPercent(score) {
  if (score == null) return null;
  const n = typeof score === 'number' ? score : Number(score);
  if (!Number.isFinite(n)) return null;
  return n <= 1 ? Math.max(0, Math.min(1, n)) * 100 : Math.max(0, Math.min(100, n));
}

// Legend endpoints (match your UI legend)
const LEGEND_RED   = { h: 0,   s: 95, l: 45, a: 0.85 };
const LEGEND_GREEN = { h: 120, s: 95, l: 35, a: 0.85 };

// <50: gentler red (less extreme than before)
const SOFT_RED_BG   = 'hsla(0, 85%, 60%, 0.65)';  // softer fill
const SOFT_RED_STROKE = 'hsla(0, 80%, 45%, 0.80)'; // darker outline for contrast

// 50..100 interpolation helper (hue & lightness ramp; saturation/alpha fixed)
function rampColor(t /* 0..1 */) {
  // slight gamma to keep mid-range readable but not too punchy
  const g = Math.pow(t, 0.8);
  const h = LEGEND_RED.h + (LEGEND_GREEN.h - LEGEND_RED.h) * g;   // 0 → 120
  const l = LEGEND_RED.l + (LEGEND_GREEN.l - LEGEND_RED.l) * g;   // 45% → 35%
  return `hsla(${h}, ${LEGEND_RED.s}%, ${l}%, ${LEGEND_RED.a})`;
}

function rampStroke(t /* 0..1 */) {
  const g = Math.pow(t, 0.8);
  const h = LEGEND_RED.h + (LEGEND_GREEN.h - LEGEND_RED.h) * g;
  // darker outline than fill for contrast
  const lStroke = 30 + (22 - 30) * g; // 30% → 22%
  return `hsla(${h}, 90%, ${lStroke}%, 0.85)`;
}

// Background color mapping
function scoreToColor(score) {
  const pct = toPercent(score);
  if (pct == null) return 'hsla(210, 8%, 70%, 0.35)'; // neutral/missing

  if (pct < 50) {
    // less extreme low-end
    return SOFT_RED_BG;
  }

  const t = (pct - 50) / 50; // 0..1
  return rampColor(t);
}

// Outline stroke mapping
function scoreToStroke(score) {
  const pct = toPercent(score);
  if (pct == null) return 'hsla(210, 8%, 45%, 0.6)';

  if (pct < 50) {
    return SOFT_RED_STROKE;
  }

  const t = (pct - 50) / 50; // 0..1
  return rampStroke(t);
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
