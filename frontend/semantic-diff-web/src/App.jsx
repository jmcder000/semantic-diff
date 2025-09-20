import { useState } from 'react';
import { getSemanticDiff } from './api';
import HighlightedText from './HighlightedText';
import { contextSnippet } from './utils';


function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'white', color: '#222', maxWidth: 800, width: '90%',
          borderRadius: 8, boxShadow: '0 10px 30px rgba(0,0,0,0.2)', padding: 16
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button onClick={onClose}>Close</button>
        </div>
        <div style={{ marginTop: 12 }}>{children}</div>
      </div>
    </div>
  );
}



export default function App() {
  console.log('[App] mount/render');
  const [original, setOriginal] = useState('');
  const [intent, setIntent] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [auditorMode, setAuditorMode] = useState(false);

  // modal state
  const [peek, setPeek] = useState(null); // { question, originalSpan, snippet }

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setResult(null);
    setPeek(null);
    setLoading(true);
    try {
      const data = await getSemanticDiff({ original, intent });
      setResult(data);
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  // Original spans (used only in auditor mode)
  const originalSpans = (result?.questions || [])
    .map(q => ({
      charStart: q.original?.charStart,
      charEnd: q.original?.charEnd
    }))
    .filter(s => s.charStart != null);

  // Summary spans: include tooltip (original quote) and meta (qid & original span) for click peeks
  const summarySpans = (result?.questions || [])
    .filter(q => q.summary?.answerable && q.summary?.charStart != null)
    .map(q => ({
      charStart: q.summary.charStart,
      charEnd: q.summary.charEnd,
      tooltip: 
        (q.original?.answer ? `Original: ${q.original.answer}` : '') +
        (q.similarity?.score != null ? `\nSimilarity: ${q.similarity.score.toFixed(2)} ${q.similarity?.bucket ? `(${q.similarity.bucket})` : ''}` : ''),
      score: q.similarity?.score ?? null,
      bucket: q.similarity?.bucket ?? null,
      meta: {
        qid: q.id,
        question: q.question,
        originalSpan: {
          answer: q.original?.answer,
          charStart: q.original?.charStart,
          charEnd: q.original?.charEnd
        }
      }
    }));

  const handleSummarySpanClick = (seg) => {
    console.log('clicked span', seg);
    if (!result) return;
    const meta = seg.meta || {};
    let snip = null;
    if (meta.originalSpan?.charStart != null && meta.originalSpan?.charEnd != null) {
      snip = contextSnippet(original, meta.originalSpan.charStart, meta.originalSpan.charEnd, 140);
    }
    setPeek({
      question: meta.question || '(no question id)',
      originalSpan: meta.originalSpan || null,
      snippet: snip
    });
  };

  // const handleSummarySpanClick = (seg) => {
  //   console.log('clicked span', seg);   // <— should fire on click
  //   if (!result) return;
  //   const meta = seg.meta;
  //   if (!meta || meta.originalSpan?.charStart == null) return;
  //   const snip = contextSnippet(
  //     original,
  //     meta.originalSpan.charStart,
  //     meta.originalSpan.charEnd,
  //     140
  //   );
  //   setPeek({
  //     question: meta.question,
  //     originalSpan: meta.originalSpan,
  //     snippet: snip
  //   });
  // };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>Semantic Diff</h1>
      <p>We’ll generate a summary optimized for your <b>Intent</b>, highlight where it answers key questions, and show a comparison table. Hover a highlight to see the exact original quote; click to peek original context.</p>

      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 16 }}>
        <div>
          <label htmlFor="intent"><b>Intent</b></label>
          <input
            id="intent"
            value={intent}
            onChange={e => setIntent(e.target.value)}
            placeholder="e.g., focus on business impact and key risks"
            style={{ width: '100%', padding: 8 }}
            required
          />
        </div>

        <div>
          <label htmlFor="original"><b>Original</b></label>
          <textarea
            id="original"
            value={original}
            onChange={e => setOriginal(e.target.value)}
            placeholder="Paste the source/original text..."
            rows={12}
            style={{ width: '100%' }}
            required
          />
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button type="submit" disabled={loading}>
            {loading ? 'Working…' : 'Get semantic diff'}
          </button>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={auditorMode}
              onChange={e => setAuditorMode(e.target.checked)}
            />
            Auditor mode (show full Original panel)
          </label>
          {error && <span style={{ color: 'crimson' }}>⚠ {error}</span>}
        </div>
      </form>

      <button
        type="button"
        onMouseDown={e => e.stopPropagation()}
        onClick={() => setPeek({
          question: 'TEST',
          originalSpan: { charStart: 0, charEnd: 3 },
          snippet: { before: 'foo ', mid: 'BAR', after: ' baz' }
        })}
      >
        Test Modal
      </button>

      {result && (
        <div style={{ marginTop: 24 }}>
          <h2>Results</h2>

          {/* Panels */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: auditorMode ? '1fr 1fr' : '1fr',
            gap: 24
          }}>
            {auditorMode && (
              <div>
                <h3>Original (highlights = extracted answers)</h3>
                <HighlightedText text={original} spans={originalSpans} />
              </div>
            )}
            <div>
              <h3>Generated Summary (highlights = where questions are answered)</h3>
              <HighlightedText
                text={result.summaryText}
                spans={summarySpans}
                onSpanClick={handleSummarySpanClick}
                debug
              />
              <div style={{ color: '#666', marginTop: 6 }}>
                <small>Hover highlight = original quote. Click highlight = open original context.</small>
              </div>
            </div>
          </div>

          {/* Table */}
          <div style={{ marginTop: 24 }}>
            <h3>Question-by-question</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 6 }}>Question</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 6 }}>Significance</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 6 }}>Original (cited)</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 6 }}>Answerable?</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 6 }}>Summary (cited if answerable)</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 6 }}>Similarity</th>
                </tr>
              </thead>
              <tbody>
                {(result.questions || []).map(q => (
                  <tr key={q.id}>
                    <td style={{ borderBottom: '1px solid #eee', verticalAlign: 'top', padding: 6 }}>{q.question}</td>
                    <td style={{ borderBottom: '1px solid #eee', verticalAlign: 'top', padding: 6 }}>
                      {Math.round(q.significance * 100)}%
                    </td>
                    <td style={{ borderBottom: '1px solid #eee', verticalAlign: 'top', padding: 6 }}>
                      <code>{q.original?.answer}</code>
                      {q.original?.line && (
                        <div style={{ color: '#666' }}>@{q.original.line}:{q.original.col}</div>
                      )}
                    </td>
                    <td style={{ borderBottom: '1px solid #eee', verticalAlign: 'top', padding: 6 }}>
                      {q.summary?.answerable ? 'Yes' : 'No'}
                    </td>
                    <td style={{ borderBottom: '1px solid #eee', verticalAlign: 'top', padding: 6 }}>
                      {q.summary?.answerable ? (
                        <>
                          <code>{q.summary?.answer}</code>
                          {q.summary?.line && (
                            <div style={{ color: '#666' }}>@{q.summary.line}:{q.summary.col}</div>
                          )}
                        </>
                      ) : <em>—</em>}
                    </td>
                    <td style={{ borderBottom: '1px solid #eee', verticalAlign: 'top', padding: 6 }}>
                      {q.summary?.answerable
                        ? `${q.similarity?.score?.toFixed(2) ?? '—'} ${q.similarity?.bucket ? `(${q.similarity.bucket})` : ''}`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ marginTop: 8, color: '#666' }}>
              <small>
                Models: questions = {result.meta?.model_questions}; summary = {result.meta?.model_summary};
                answers = {result.meta?.model_summary_answers}; similarity = {result.meta?.model_similarity}
              </small>
            </div>
          </div>
        </div>
      )}

      {/* Context Peek Modal */}
      <Modal
        open={!!peek}
        title={peek ? 'Original context' : ''}
        onClose={() => setPeek(null)}
      >
        {peek?.question && (
          <div style={{ marginBottom: 8, color: '#444' }}>
            <b>Question:</b> {peek.question}
          </div>
        )}
        {peek?.snippet ? (
          <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5, margin: 0 }}>
            …{peek.snippet.before}<b>{peek.snippet.mid}</b>{peek.snippet.after}…
          </p>
        ) : (
          <em>No context available.</em>
        )}
      </Modal>
    </div>
  );
}

