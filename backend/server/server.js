import 'dotenv/config';
import express from 'express';
import OpenAI from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';


import http from 'node:http';
import https from 'node:https';

http.globalAgent.keepAlive = true;
https.globalAgent.keepAlive = true;


// ---------- Config ----------
const PORT = process.env.PORT ? Number(process.env.PORT) : 5001;
const GEN_MODEL = process.env.OPENAI_GEN_MODEL || 'gpt-4o-mini';
const SUM_MODEL = process.env.OPENAI_SUM_MODEL || GEN_MODEL;
const EMB_MODEL = process.env.OPENAI_EMB_MODEL || 'text-embedding-3-large';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const app = express();
app.use(express.json({ limit: '1mb' }));

// ---------- Utilities ----------
function normalizeForSearch(s) {
  return s
    .normalize('NFKC')               // Unicode normalize
    .replace(/\s+/g, ' ')            // collapse whitespace
    .replace(/[“”]/g, '"')           // curly → straight
    .replace(/[‘’]/g, "'")
    .trim();
}

// function tryExactSpan(text, quote) {
//   const idx = text.indexOf(quote);
//   if (idx === -1) return null;
//   const upToStart = text.slice(0, idx);
//   const lines = upToStart.split(/\r?\n/);
//   return {
//     charStart: idx,
//     charEnd: idx + quote.length,
//     line: lines.length,
//     col: lines[lines.length - 1].length + 1
//   };
// }

// // softer search: trimmed, case-insensitive, normalized
// function fuzzyFindSpan(text, quote) {
//   if (!quote) return null;

//   // exact
//   let span = tryExactSpan(text, quote);
//   if (span) return span;

//   // trim surrounding quotes/spaces
//   const trimmed = quote.replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, '');
//   span = tryExactSpan(text, trimmed);
//   if (span) return span;

//   // case-insensitive
//   const lowerIdx = text.toLowerCase().indexOf(trimmed.toLowerCase());
//   if (lowerIdx !== -1) {
//     const upToStart = text.slice(0, lowerIdx);
//     const lines = upToStart.split(/\r?\n/);
//     return {
//       charStart: lowerIdx,
//       charEnd: lowerIdx + trimmed.length,
//       line: lines.length,
//       col: lines[lines.length - 1].length + 1
//     };
//   }

//   // normalized search
//   const normText = normalizeForSearch(text);
//   const normQuote = normalizeForSearch(trimmed);
//   const normIdx = normText.indexOf(normQuote);
//   if (normIdx !== -1) {
//     // map back approximately by searching first/last few chars from normQuote in original text
//     const probeStart = trimmed.slice(0, Math.min(10, trimmed.length));
//     const probeEnd = trimmed.slice(-Math.min(10, trimmed.length));
//     const startIdx = text.indexOf(probeStart);
//     const endIdx = text.indexOf(probeEnd, startIdx === -1 ? 0 : startIdx);
//     if (startIdx !== -1 && endIdx !== -1 && endIdx >= startIdx) {
//       const upToStart2 = text.slice(0, startIdx);
//       const lines2 = upToStart2.split(/\r?\n/);
//       return {
//         charStart: startIdx,
//         charEnd: Math.min(text.length, endIdx + probeEnd.length),
//         line: lines2.length,
//         col: lines2[lines2.length - 1].length + 1
//       };
//     }
//   }

//   return null;
// }

// function robustFindOriginalSpan(text, quote) {
//   return tryExactSpan(text, quote) || fuzzyFindSpan(text, quote);
// }

// ---------- Utilities (Upgraded) ----------

/**
 * Normalizes text but ALSO returns a mapping from each normalized char
 * back to its original char index, so that we can map matches precisely
 * back to the original document.
 */
function normalizeWithMap(input) {
  // We do: NFKC, unify curly quotes/hyphens, collapse whitespace to single space,
  // and keep a map: normIdx -> rawIdx.
  const raw = input;
  const normChars = [];
  const normIdxToRawIdx = [];

  // Helper to push char(s) produced by normalization with mapping
  function pushNorm(nc, rawIdx) {
    for (let k = 0; k < nc.length; k++) {
      normChars.push(nc[k]);
      normIdxToRawIdx.push(rawIdx);
    }
  }

  let prevWasSpace = false;

  for (let i = 0; i < raw.length; i++) {
    let ch = raw[i];

    // unify curly quotes & long dashes
    if (ch === '“' || ch === '”') ch = '"';
    else if (ch === '‘' || ch === '’') ch = "'";
    else if (ch === '–' || ch === '—') ch = '-';

    // NFKC normalize each char (may expand to multiple chars, e.g. ligatures)
    const n = ch.normalize('NFKC');

    // collapse whitespace to single ASCII space, but keep a stable mapping
    if (/\s/.test(n)) {
      if (!prevWasSpace) {
        prevWasSpace = true;
        pushNorm(' ', i);
      }
      continue;
    }

    prevWasSpace = false;
    pushNorm(n, i);
  }

  // Trim leading/trailing spaces + fix mapping accordingly
  let start = 0;
  let end = normChars.length;
  while (start < end && normChars[start] === ' ') start++;
  while (end > start && normChars[end - 1] === ' ') end--;

  const norm = normChars.slice(start, end).join('');
  const normMap = normIdxToRawIdx.slice(start, end);

  const lower = norm.toLowerCase();

  return { norm, lower, normIdxToRawIdx: normMap };
}

function lineColFromCharIndex(text, charStart) {
  // 1-based line/col
  const upToStart = text.slice(0, charStart);
  const lines = upToStart.split(/\r?\n/);
  const line = lines.length;
  const col = lines[lines.length - 1].length + 1;
  return { line, col };
}

function spanFromRawRange(text, start, end, meta = {}) {
  const { line, col } = lineColFromCharIndex(text, start);
  return { charStart: start, charEnd: end, line, col, ...meta };
}

function tryExactSpan(text, quote) {
  const idx = text.indexOf(quote);
  if (idx === -1) return null;
  return spanFromRawRange(text, idx, idx + quote.length, { method: 'exact', score: 1 });
}

function tryCaseInsensitiveSpan(text, quote) {
  const idx = text.toLowerCase().indexOf(quote.toLowerCase());
  if (idx === -1) return null;
  return spanFromRawRange(text, idx, idx + quote.length, { method: 'case-insensitive', score: 1 });
}

/** Exact match on normalized strings, with precise back-mapping to raw indices. */
function tryNormalizedExactSpan(text, quote) {
  const T = normalizeWithMap(text);
  const Q = normalizeWithMap(quote);
  if (!Q.lower) return null;
  const idx = T.lower.indexOf(Q.lower);
  if (idx === -1) return null;

  // Map norm window [idx, idx + Q.lower.length) to raw range
  const normStart = idx;
  const normEnd = idx + Q.lower.length;
  const rawStart = T.normIdxToRawIdx[normStart];
  const rawEndIdx = T.normIdxToRawIdx[normEnd - 1];
  const rawEnd = Math.min(text.length, rawEndIdx + 1);

  return spanFromRawRange(text, rawStart, rawEnd, { method: 'normalized-exact', score: 1 });
}

/**
 * Sellers' algorithm (approximate substring edit distance).
 * We track the start index through DP so we can recover the *exact* normalized span.
 * Returns null if text/quote are empty, else returns {normStart, normEnd, dist, ratio}.
 * ratio = 1 - dist / quoteLen
 */
function bestApproximateSubstringNorm(textLower, quoteLower) {
  const n = textLower.length;
  const m = quoteLower.length;
  if (n === 0 || m === 0) return null;

  // Use Uint32 for safety on longer inputs
  let prev = new Uint32Array(m + 1);
  let curr = new Uint32Array(m + 1);
  // track start indices for each DP cell (substring start in textLower)
  let prevStart = new Int32Array(m + 1);
  let currStart = new Int32Array(m + 1);

  for (let j = 0; j <= m; j++) {
    prev[j] = j;           // cost to match first j chars of pattern to empty text = j insertions
    prevStart[j] = 0;      // arbitrary here
  }

  let best = { end: -1, start: 0, dist: m + 1 }; // minimal dp[i][m]
  for (let i = 1; i <= n; i++) {
    curr[0] = 0;           // empty pattern costs 0
    currStart[0] = i;      // substring could start at i for empty pattern

    const ti = textLower.charCodeAt(i - 1);
    for (let j = 1; j <= m; j++) {
      const qj = quoteLower.charCodeAt(j - 1);
      const costSub = prev[j - 1] + (ti === qj ? 0 : 1);
      const costIns = curr[j - 1] + 1;
      const costDel = prev[j] + 1;

      // choose min; tie-break prefer substitution/match > insertion > deletion
      let val = costSub;
      let startIdx = prevStart[j - 1];
      if (costIns < val || (costIns === val && currStart[j - 1] > startIdx)) {
        val = costIns; startIdx = currStart[j - 1];
      }
      if (costDel < val || (costDel === val && prevStart[j] > startIdx)) {
        val = costDel; startIdx = prevStart[j];
      }

      curr[j] = val;
      currStart[j] = startIdx;
    }

    if (curr[m] < best.dist) {
      best = { end: i, start: currStart[m], dist: curr[m] };
    }

    // swap rows
    [prev, curr] = [curr, prev];
    [prevStart, currStart] = [currStart, prevStart];
  }

  if (best.end < 0) return null;

  const dist = best.dist;
  const ratio = 1 - dist / Math.max(1, m);

  // Normalize bounds
  const normStart = Math.max(0, Math.min(best.start, n));
  const normEnd = Math.max(normStart, Math.min(best.end, n));

  return { normStart, normEnd, dist, ratio };
}

/** Map a normalized [start,end) back to raw indices using the mapping we made. */
function mapNormRangeToRaw(text, normStart, normEnd, normIdxToRawIdx) {
  const rawStart = normIdxToRawIdx[normStart];
  const rawEndIdx = normIdxToRawIdx[normEnd - 1];
  const rawEnd = Math.min(text.length, rawEndIdx + 1);
  return { rawStart, rawEnd };
}

/**
 * Tokenize a normalized string into words with their [normStart, normEnd).
 * Unicode-aware word regex.
 */
function tokenizeNorm(lowerNorm) {
  const tokens = [];
  const re = /[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu;
  let m;
  while ((m = re.exec(lowerNorm)) !== null) {
    tokens.push({ token: m[0], normStart: m.index, normEnd: m.index + m[0].length });
  }
  return tokens;
}

/**
 * Word-coverage fallback:
 * - Tokenize normalized text & quote.
 * - Greedily align quote tokens to text tokens in order (first occurrence > last position).
 * - Build the minimal window covering the matched sequence.
 * - Coverage = matchedTokens / quoteTokens.
 */
function bestWordCoverageSpan(text, quote) {
  const T = normalizeWithMap(text);
  const Q = normalizeWithMap(quote);

  const textToks = tokenizeNorm(T.lower);
  const quoteToks = tokenizeNorm(Q.lower);
  if (quoteToks.length === 0 || textToks.length === 0) return null;

  // Index text tokens by token -> sorted array of indices in textToks
  const idxByTok = new Map();
  for (let i = 0; i < textToks.length; i++) {
    const t = textToks[i].token;
    if (!idxByTok.has(t)) idxByTok.set(t, []);
    idxByTok.get(t).push(i);
  }

  // Greedy alignment (try a few alternative starting offsets to improve robustness)
  const tries = Math.min(5, quoteToks.length);
  let best = null;

  for (let offset = 0; offset < tries; offset++) {
    let lastPos = -1;
    const matchedPositions = [];
    for (let qi = offset; qi < quoteToks.length; qi++) {
      const qt = quoteToks[qi].token;
      const arr = idxByTok.get(qt);
      if (!arr || arr.length === 0) continue;
      // find first text token position > lastPos
      let lo = 0, hi = arr.length - 1, pick = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (arr[mid] > lastPos) { pick = mid; hi = mid - 1; } else { lo = mid + 1; }
      }
      if (pick !== -1) {
        const pos = arr[pick];
        matchedPositions.push(pos);
        lastPos = pos;
      }
    }

    if (matchedPositions.length === 0) continue;

    const firstPos = matchedPositions[0];
    const lastPosUsed = matchedPositions[matchedPositions.length - 1];

    // Convert token window to normalized char window
    const normStart = textToks[firstPos].normStart;
    const normEnd = textToks[lastPosUsed].normEnd;

    const coverage = matchedPositions.length / quoteToks.length;

    if (!best || coverage > best.coverage || (coverage === best.coverage && (normEnd - normStart) < (best.normEnd - best.normStart))) {
      best = { normStart, normEnd, coverage };
    }
  }

  if (!best) return null;

  const { rawStart, rawEnd } = mapNormRangeToRaw(text, best.normStart, best.normEnd, T.normIdxToRawIdx);
  return spanFromRawRange(text, rawStart, rawEnd, { method: 'word-coverage', score: best.coverage });
}

/**
 * The main robust finder:
 * - exact / trimmed / case-insensitive
 * - normalized exact
 * - approximate substring (edit distance). If ratio >= hiConf, we use that.
 * - word-coverage fallback. If coverage >= hiConf, we use that.
 *
 * Returns:
 *  - {span, exactDocSubstring, score, method}
 */
function findBestOriginalSpan(text, quote, opts = {}) {
  const hiConf = opts.hiConfidence ?? 0.95;

  if (!quote) return null;

  // 1) strict exact
  let span = tryExactSpan(text, quote);
  if (span) return { ...span, exactDocSubstring: text.slice(span.charStart, span.charEnd) };

  // 2) trimmed/de-quoted exact
  const trimmed = quote.replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, '');
  if (trimmed && trimmed !== quote) {
    span = tryExactSpan(text, trimmed);
    if (span) return { ...span, method: 'exact-trimmed', exactDocSubstring: text.slice(span.charStart, span.charEnd) };
  }

  // 3) case-insensitive
  span = tryCaseInsensitiveSpan(text, trimmed || quote);
  if (span) return { ...span, exactDocSubstring: text.slice(span.charStart, span.charEnd) };

  // 4) normalized exact
  span = tryNormalizedExactSpan(text, trimmed || quote);
  if (span) return { ...span, exactDocSubstring: text.slice(span.charStart, span.charEnd) };

  // 5) approximate substring (Sellers)
  const T = normalizeWithMap(text);
  const Q = normalizeWithMap(trimmed || quote);
  if (T.lower && Q.lower && T.lower.length && Q.lower.length) {
    // To avoid blowups, optionally guard huge texts
    const MAX_NORM_FOR_DP = opts.maxNormForDP ?? 60000;
    if (T.lower.length <= MAX_NORM_FOR_DP && Q.lower.length <= 1000) {
      const best = bestApproximateSubstringNorm(T.lower, Q.lower);
      if (best) {
        const { normStart, normEnd, ratio } = best;
        const { rawStart, rawEnd } = mapNormRangeToRaw(text, normStart, normEnd, T.normIdxToRawIdx);
        const approxSpan = spanFromRawRange(text, rawStart, rawEnd, { method: 'approx-levenshtein', score: ratio });
        if (ratio >= hiConf) {
          return { ...approxSpan, exactDocSubstring: text.slice(rawStart, rawEnd) };
        }
        // keep as candidate; we may supersede with word coverage below if better
        span = { ...approxSpan, exactDocSubstring: text.slice(rawStart, rawEnd) };
      }
    }
  }

  // 6) word-coverage backup
  const wc = bestWordCoverageSpan(text, trimmed || quote);
  if (wc && wc.score >= hiConf) {
    return { ...wc, exactDocSubstring: text.slice(wc.charStart, wc.charEnd) };
  }

  // Fallback to whichever of (approx-levenshtein vs word-coverage) had higher score;
  if (wc && span) {
    return wc.score >= (span.score ?? 0) ? { ...wc, exactDocSubstring: text.slice(wc.charStart, wc.charEnd) }
                                         : { ...span, exactDocSubstring: text.slice(span.charStart, span.charEnd) };
  }
  if (wc) return { ...wc, exactDocSubstring: text.slice(wc.charStart, wc.charEnd) };
  if (span) return { ...span, exactDocSubstring: text.slice(span.charStart, span.charEnd) };

  // Nothing found
  return null;
}



function findSpan(text, quote) {
  if (!quote) return null;
  const idx = text.indexOf(quote);
  if (idx === -1) return null;
  const start = idx;
  const end = idx + quote.length;
  const upToStart = text.slice(0, start);
  const lines = upToStart.split(/\r?\n/);
  const line = lines.length;            // 1-based
  const col = lines[lines.length - 1].length + 1; // 1-based
  return { charStart: start, charEnd: end, line, col };
}

function cosineSimilarity(a, b) {
  const dot = a.reduce((acc, ai, i) => acc + ai * b[i], 0);
  const normA = Math.sqrt(a.reduce((acc, ai) => acc + ai * ai, 0));
  const normB = Math.sqrt(b.reduce((acc, bi) => acc + bi * bi, 0));
  return normA && normB ? dot / (normA * normB) : 0;
}

function bucketFromScore(score) {
  if (score === null) return 'NO_ANSWER';
  if (score >= 0.88) return 'MATCH';
  if (score >= 0.60) return 'PARTIAL';
  return 'MISMATCH';
}

// ---------- Zod Schemas ----------
const QuestionItem = z.object({
  id: z.string(),
  question: z.string(),
  significance: z.number().min(0).max(1),
  answer_quote: z
    .string()
    .describe('Exact, contiguous substring from the ORIGINAL text. No ellipses.'),
  note: z.string().nullable().optional(),
});

const QuestionExtraction = z.object({
  questions: z.array(QuestionItem).min(3).max(12),
});

const SummaryAnswerItem = z.object({
  id: z.string(),
  answerable: z.boolean(),
  answer_quote: z
    .string()
    .describe('If answerable, provide exact contiguous substring from SUMMARY. No ellipses.')
    .nullable(),
  explanation: z.string().nullable().optional(),
});

const SummaryAnswering = z.object({
  answers: z.array(SummaryAnswerItem),
});

// ---------- Prompt Builders ----------
function buildQuestionMessages(original, intent) {
  return [
    {
      role: 'system',
      content:
        'You are an information extraction system. Only use the ORIGINAL text. Return JSON only (no prose).'
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `Intent: ${intent || '(none provided)'}.

Task:
1) Propose 5–8 critical questions *specifically guided by the Intent* that are answerable strictly from the ORIGINAL text.
2) Rank each by significance (0..1) to the core meaning *with respect to the Intent*.
3) For each question, include a minimal verbatim answer excerpt from ORIGINAL as "answer_quote".
   - Must be an exact contiguous substring (no paraphrase, no ellipses).
   - Choose the tightest span that directly answers the question.

Constraints:
- Output MUST match the provided JSON Schema exactly.
- "answer_quote" must appear verbatim somewhere in ORIGINAL.
- Do not include any external knowledge.

ORIGINAL:
${original}`
        }
      ]
    }
  ];
}

function buildSummaryMessages(original, intent, questionStubs) {
  // We lightly steer the summary to cover the question set if faithful.
  return [
    {
      role: 'system',
      content:
        'You are a careful summarization system. Write a concise, faithful summary optimized for the provided Intent. Do not invent facts.'
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text:
`Summarize the ORIGINAL text succinctly, optimized for this Intent:
"${intent || '(none)'}"

If faithful to the source, prefer including details that help answer these questions:
${JSON.stringify(questionStubs, null, 2)}

Rules:
- Be faithful to ORIGINAL.
- No quotes or citations in the summary output itself.
- Keep to ~4–8 sentences unless the text is very short.

ORIGINAL:
${original}`
        }
      ]
    }
  ];
}

function buildSummaryAnswerMessages(questions, summaryText) {
  const items = questions.map(q => ({ id: q.id, question: q.question }));
  return [
    {
      role: 'system',
      content:
        'You answer questions using only the SUMMARY text and return JSON only. If not answerable, set answerable=false.'
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text:
`Answer the following questions using only the SUMMARY text.
For each: set answerable true/false. If true, provide "answer_quote" as an exact contiguous substring from SUMMARY (no ellipses). Use the shortest exact span that answers the question.

QUESTIONS:
${JSON.stringify(items, null, 2)}

SUMMARY:
${summaryText}`
        }
      ]
    }
  ];
}

// ---------- Route ----------
app.post('/api/semantic-diff', async (req, res) => {
  console.log('📨 Received semantic-diff request');
  console.log('Request body length:', JSON.stringify(req.body || {}).length, 'chars');

  try {
    const { original, intent } = req.body || {};
    if (!original || !intent) {
      console.log('❌ Missing required fields: original or intent');
      return res.status(400).json({ error: 'Both "original" and "intent" are required.' });
    }

    console.log('📝 Original text length:', original.length, 'chars');
    console.log('🎯 Intent:', intent);

    // STEP 1: Generate intent-guided questions from original
    console.log('🤖 Step 1: Generating questions from original text (intent-guided)...');
    const qCompletion = await openai.chat.completions.parse({
      model: GEN_MODEL,
      messages: buildQuestionMessages(original, intent),
      temperature: 0.2,
      response_format: zodResponseFormat(QuestionExtraction, 'QuestionExtraction')
    });
    const qParsed = qCompletion.choices[0].message.parsed;
    const questions = qParsed.questions;
    console.log(`✅ Generated ${questions.length} questions`);

    // Attach original spans (for citations)
    const withOriginalSpans = questions.map(q => {
      const found = findBestOriginalSpan(original, q.answer_quote, { hiConfidence: 0.95 });
      // If we got a high-confidence span (normalized-exact, approx >= .95, or word-coverage >= .95),
      // prefer the exact document substring over the model string.
      const finalAnswer = found?.score >= 0.95 ? found.exactDocSubstring : q.answer_quote;

      return {
        id: q.id,
        question: q.question,
        significance: q.significance,
        original: {
          // keep what model said for auditing
          model_answer: q.answer_quote,
          // but consume the doc-exact substring when we're confident
          answer: finalAnswer,
          charStart: found?.charStart ?? null,
          charEnd: found?.charEnd ?? null,
          line: found?.line ?? null,
          col: found?.col ?? null,
          match_method: found?.method ?? null,
          match_score: found?.score ?? null
        }
      };
    });


    // Build stubs for summary prompt (ids + questions only)
    const stubs = withOriginalSpans.map(q => ({ id: q.id, question: q.question }));

    // STEP 2: Generate summary (separate model call)
    console.log('📝 Step 2: Generating summary...');
    const sCompletion = await openai.chat.completions.create({
      model: SUM_MODEL,
      messages: buildSummaryMessages(original, intent, stubs),
      temperature: 0.2
    });
    const summaryText = sCompletion.choices?.[0]?.message?.content?.trim() || '';
    console.log('✅ Summary generated, length:', summaryText.length, 'chars');

    // STEP 3: Answerability from generated summary
    console.log('🔍 Step 3: Answering questions from generated summary...');
    const aCompletion = await openai.chat.completions.parse({
      model: GEN_MODEL,
      messages: buildSummaryAnswerMessages(withOriginalSpans, summaryText),
      temperature: 0.2,
      response_format: zodResponseFormat(SummaryAnswering, 'SummaryAnswering')
    });
    const aParsed = aCompletion.choices[0].message.parsed;
    const answerById = Object.fromEntries(aParsed.answers.map(a => [a.id, a]));
    console.log(`✅ Processed answers for ${aParsed.answers.length} questions`);

    // Merge summary answers + spans
    let merged = withOriginalSpans.map(q => {
      const a = answerById[q.id] || {};
      let summaryBlock = {
        answerable: !!a.answerable,
        answer: a.answer_quote || null
      };
      if (a.answerable && a.answer_quote) {
        const span = findSpan(summaryText, a.answer_quote);
        summaryBlock = {
          ...summaryBlock,
          ...(span || { charStart: null, charEnd: null, line: null, col: null })
        };
      } else {
        summaryBlock = { ...summaryBlock, charStart: null, charEnd: null, line: null, col: null };
      }
      return { ...q, summary: summaryBlock };
    });

    // STEP 4: Similarity with embeddings (only when summary answer exists)
    console.log('📊 Step 4: Computing similarity scores (batched)...');

    // Collect pairs that need scoring
    const embPairs = [];
    const embIndexByMerged = new Map(); // map merged index -> pair order

    merged.forEach((item, idx) => {
      const needs = item.summary?.answerable && item.summary?.answer && item.original?.answer;
      if (needs) {
        embIndexByMerged.set(idx, embPairs.length);
        embPairs.push(item.original.answer, item.summary.answer); // maintain original, then summary
      }
    });

    let embeddingCount = 0;

    if (embPairs.length > 0) {
      const embResp = await openai.embeddings.create({
        model: EMB_MODEL,
        input: embPairs
      });

      // For each pair, compute cosine and attach
      embIndexByMerged.forEach((pairStart, mergedIdx) => {
        const e1 = embResp.data[pairStart].embedding;
        const e2 = embResp.data[pairStart + 1].embedding;
        const score = cosineSimilarity(e1, e2);
        merged[mergedIdx].similarity = {
          method: 'embedding-cosine',      // keep the original method label
          model: EMB_MODEL,
          score,
          bucket: score === null ? 'NO_ANSWER' : bucketFromScore(score)
        };
        embeddingCount++;
      });
    }

    // Fill NO_ANSWER for items that didn’t get scored
    for (const item of merged) {
      if (!item.similarity) {
        item.similarity = {
          method: 'embedding-cosine',
          model: EMB_MODEL,
          score: null,
          bucket: 'NO_ANSWER'
        };
      }
    }

    console.log(`✅ Computed ${embeddingCount} similarity scores (batched)`);


    console.log('✨ Request completed successfully');
    res.json({
      summaryText,
      questions: merged,
      meta: {
        model_questions: GEN_MODEL,
        model_summary: SUM_MODEL,
        model_summary_answers: GEN_MODEL,
        model_similarity: EMB_MODEL
      }
    });
  } catch (err) {
    console.error('❌ Error processing request:', err);
    console.error('Stack trace:', err.stack);
    const msg = err?.response?.data || err.message || 'Unknown error';
    res.status(500).json({ error: msg });
  }
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`✅ API listening on http://localhost:${PORT}`);
  console.log(`🚀 Using models:`);
  console.log(`   - Questions: ${GEN_MODEL}`);
  console.log(`   - Summary:   ${SUM_MODEL}`);
  console.log(`   - Embeddings:${EMB_MODEL}`);
});
