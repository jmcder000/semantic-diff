import { useEffect, useState } from 'react';
import { getSemanticDiff } from './api';
import HighlightedText from './HighlightedText';
import Modal from './components/Modal';
import { contextSnippet } from './utils';

export default function App() {
  const [original, setOriginal] = useState('');
  const [intent, setIntent] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [auditorMode, setAuditorMode] = useState(false);

  const [peek, setPeek] = useState(null);

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

  const originalSpans = (result?.questions || [])
    .map(q => ({ charStart: q.original?.charStart, charEnd: q.original?.charEnd }))
    .filter(s => s.charStart != null);

  const summarySpans = (result?.questions || [])
    .filter(q => q.summary?.answerable && q.summary?.charStart != null)
    .map(q => ({
      charStart: q.summary.charStart,
      charEnd: q.summary.charEnd,
      tooltip:
        (q.original?.answer ? `Original: ${q.original.answer}` : '') +
        (q.similarity?.score != null
          ? `\nSimilarity: ${q.similarity.score.toFixed(2)} ${q.similarity?.bucket ? `(${q.similarity.bucket})` : ''}`
          : ''),
      score: (typeof q.similarity?.score === 'number') ? q.similarity.score
        : (q.similarity?.score != null ? Number(q.similarity.score) : null),
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

  if (summarySpans?.length) {
    console.table(
      summarySpans.map(s => ({
        start: s.charStart,
        end: s.charEnd,
        score: s.score,
        type: typeof s.score
      }))
    );
  }

  const handleSummarySpanClick = (seg) => {
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

  useEffect(() => {
    // console.log('peek changed', peek);
  }, [peek]);

  return (
    <div className="min-h-screen bg-gradient-surface">
      {/* Header */}
      <header className="border-b border-border/50 bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">
                <span className="bg-gradient-primary bg-clip-text text-transparent">Semantic</span>
                <span className="text-foreground"> Diff</span>
              </h1>
              <p className="text-muted-foreground mt-2 max-w-3xl leading-relaxed">
                Generate a summary optimized for your <strong>Intent</strong>, highlight where key questions are answered,
                and review a side-by-side table. Hover a highlight to see the original quote; click to peek context.
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="container mx-auto px-6 py-8 space-y-8">
        {/* Form */}
        <section className="animate-fade-in">
          <form onSubmit={onSubmit} className="space-y-6">
            <div className="p-8 shadow-xl border-0 rounded-lg bg-gradient-surface">
              <div className="space-y-6">
                <div className="space-y-3">
                  <label htmlFor="intent" className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Intent</label>
                  <textarea
                    id="intent"
                    value={intent}
                    onChange={(e) => setIntent(e.target.value)}
                    placeholder="e.g., focus on business impact and key risks"
                    className="min-h-[120px] w-full resize-none border-0 rounded-md bg-background/50 backdrop-blur-sm focus:bg-background/80 focus:outline-none focus:ring-2 focus:ring-ring/50 px-4 py-3 transition-all duration-200"
                    required
                  />
                </div>

                <div className="space-y-3">
                  <label htmlFor="original" className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Original</label>
                  <textarea
                    id="original"
                    value={original}
                    onChange={(e) => setOriginal(e.target.value)}
                    placeholder="Paste the source/original text..."
                    className="min-h-[300px] w-full resize-none border-0 rounded-md bg-background/50 backdrop-blur-sm focus:bg-background/80 focus:outline-none focus:ring-2 focus:ring-ring/50 px-4 py-3 transition-all duration-200"
                    required
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <label className="inline-flex items-center gap-3 select-none cursor-pointer">
                    <input
                      type="checkbox"
                      checked={auditorMode}
                      onChange={(e) => setAuditorMode(e.target.checked)}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
                    />
                    <span className="text-sm text-foreground">Auditor mode (show full Original panel)</span>
                  </label>

                  <button
                    type="submit"
                    disabled={!intent.trim() || !original.trim() || loading}
                    className="bg-gradient-primary hover:opacity-90 px-8 py-3 text-base font-semibold text-white rounded-md shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50"
                  >
                    {loading ? 'Processing…' : 'Get semantic diff'}
                  </button>
                </div>

                {error && <div className="text-sm text-destructive font-medium">⚠ {error}</div>}
              </div>
            </div>
          </form>
        </section>

        {/* Results */}
        {result && (
          <section className="space-y-8">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-foreground">Results</h2>
            </div>

            {/* Panels */}
            <div className={`grid gap-6 ${auditorMode ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
              {auditorMode && (
                <div className="p-6 rounded-lg bg-card shadow-lg animate-slide-up">
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    Original <span className="text-xs text-muted-foreground">(highlights = extracted answers)</span>
                  </h3>
                  <div className="prose prose-sm max-w-none">
                    <HighlightedText text={original} spans={originalSpans} />
                  </div>
                </div>
              )}

              <div className="p-6 rounded-lg bg-card shadow-lg animate-slide-up">
                <div className="space-y-3">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Generated Summary</h3>
                    <p className="text-sm text-muted-foreground">highlights = where questions are answered</p>
                  </div>

                  {/* Legend */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">Similarity:</span>

                    {/* <50 swatch (soft red) */}
                    <span
                      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
                      title="< 50"
                    >
                      <span
                        className="inline-block w-4 h-2 rounded"
                        style={{ background: 'hsla(0, 85%, 60%, 0.65)' }} // SOFT_RED_BG
                      />
                      <span className="hidden sm:inline">&lt;50</span>
                    </span>

                    {/* 50→100 ramp */}
                    <span
                      className="w-32 h-2 rounded-full border border-border/60"
                      title="50 → 100"
                      style={{
                        background:
                          'linear-gradient(90deg, hsla(0,95%,45%,0.85) 0%, hsla(120,95%,35%,0.85) 100%)'
                      }}
                    />

                    <span className="text-[10px] text-muted-foreground">50</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">100</span>
                  </div>

                  <div className="prose prose-sm max-w-none">
                    <HighlightedText
                      text={result.summaryText}
                      spans={summarySpans}
                      onSpanClick={handleSummarySpanClick}
                      debug
                    />
                  </div>

                  <div className="text-xs text-muted-foreground pt-2 border-t border-border/50">
                    Hover = original quote • Click = open original context
                  </div>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="p-6 rounded-lg bg-card shadow-lg animate-slide-up overflow-x-auto">
              <h3 className="text-lg font-semibold text-foreground mb-4">Question-by-question</h3>

              <table className="w-full border-separate border-spacing-y-1 text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="font-semibold text-foreground py-2 pr-3 min-w-[200px]">Question</th>
                    <th className="font-semibold text-foreground py-2 pr-3 w-24">Significance</th>
                    <th className="font-semibold text-foreground py-2 pr-3 min-w-[220px]">Original (Cited)</th>
                    <th className="font-semibold text-foreground py-2 pr-3 w-28">Answerable?</th>
                    <th className="font-semibold text-foreground py-2 pr-3 min-w-[220px]">Summary (Cited if Answerable)</th>
                    <th className="font-semibold text-foreground py-2 pr-3 w-32">Similarity</th>
                  </tr>
                </thead>
                <tbody>
                  {(result.questions || []).map((q) => (
                    <tr key={q.id} className="bg-muted/30">
                      <td className="align-top p-3">{q.question}</td>
                      <td className="align-top p-3">
                        <span className="text-xs font-semibold bg-primary/10 text-primary px-2 py-1 rounded">
                          {Math.round(q.significance * 100)}%
                        </span>
                      </td>
                      <td className="align-top p-3">
                        <div className="space-y-1">
                          <p className="text-xs text-foreground font-mono bg-muted/50 p-2 rounded leading-relaxed">
                            {q.original?.answer}
                          </p>
                          {q.original?.line && (
                            <p className="text-[11px] text-muted-foreground">
                              @{q.original.line}:{q.original.col}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="align-top p-3">
                        {q.summary?.answerable ? (
                          <span className="text-xs font-semibold bg-highlight-positive-bg text-highlight-positive px-2 py-1 rounded border border-highlight-positive/20">Yes</span>
                        ) : (
                          <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded">No</span>
                        )}
                      </td>
                      <td className="align-top p-3">
                        {q.summary?.answerable ? (
                          <div className="space-y-1">
                            <p className="text-sm text-foreground">{q.summary?.answer}</p>
                            {q.summary?.line && (
                              <p className="text-[11px] text-muted-foreground">
                                @{q.summary.line}:{q.summary.col}
                              </p>
                            )}
                          </div>
                        ) : <em>—</em>}
                      </td>
                      <td className="align-top p-3">
                        {q.summary?.answerable ? (
                          <div className="space-y-1">
                            <span className="text-sm font-semibold">
                              {q.similarity?.score?.toFixed(2) ?? '—'}
                            </span>
                            <span
                              className={[
                                'text-[11px] font-medium px-2 py-0.5 rounded border',
                                q.similarity?.bucket === 'MATCH'
                                  ? 'bg-highlight-positive-bg text-highlight-positive border-highlight-positive/20'
                                  : q.similarity?.bucket === 'PARTIAL'
                                  ? 'bg-highlight-warning-bg text-highlight-warning border-highlight-warning/20'
                                  : q.similarity?.bucket === 'MISMATCH'
                                  ? 'bg-destructive/10 text-destructive border-destructive/20'
                                  : 'bg-muted text-muted-foreground',
                              ].join(' ')}
                            >
                              {q.similarity?.bucket ?? '—'}
                            </span>
                          </div>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-3 text-xs text-muted-foreground">
                Models: questions = {result.meta?.model_questions}; summary = {result.meta?.model_summary};
                answers = {result.meta?.model_summary_answers}; similarity = {result.meta?.model_similarity}
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Modal */}
      <Modal open={!!peek} title={peek ? 'Original context' : ''} onClose={() => setPeek(null)}>
        {peek?.question && (
          <div className="mb-2 text-sm text-foreground">
            <b>Question:</b> {peek.question}
          </div>
        )}
        {peek?.snippet ? (
          <p className="whitespace-pre-wrap leading-relaxed m-0">
            …{peek.snippet.before}<b>{peek.snippet.mid}</b>{peek.snippet.after}…
          </p>
        ) : (
          <em className="text-muted-foreground">No context available.</em>
        )}
      </Modal>
    </div>
  );
}
