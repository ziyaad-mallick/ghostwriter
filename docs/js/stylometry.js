/**
 * Stylometry engine — real authorship-attribution, no LLM.
 *
 * Core idea (a one-author adaptation of Burrows's Delta):
 *  - Style is carried by FUNCTION WORDS (the, of, and, I, to, ...), not topic
 *    words. Their relative frequencies are a stable, hard-to-fake authorial
 *    signature.
 *  - We split the author's own writing into chunks and measure, per function
 *    word, the MEAN frequency and how much it naturally VARIES (std) across
 *    their own text.
 *  - A suspect text is scored by how many "author-standard-deviations" its
 *    function-word usage sits away from the author's mean (Delta). Text written
 *    by the same person lands within their natural variation; generic / AI text
 *    deviates on the function-word fingerprint and lands far away.
 *  - We calibrate against the author's own held-out chunks so the 0-100 number
 *    means "is this within your normal range," not an arbitrary distance.
 */

// ~150 high-frequency English function words + common contractions.
// Topic-independent: these are what stylometry leans on.
export const FUNCTION_WORDS = [
  "the","of","and","a","to","in","is","was","he","she","that","it","his","her",
  "by","on","at","be","this","had","not","are","but","from","or","have","an",
  "they","which","one","you","were","all","we","when","your","can","said","there",
  "use","each","do","how","their","if","will","up","other","about","out","many",
  "then","them","these","so","some","would","into","has","more","two","like","him",
  "see","could","no","than","been","who","its","did","get","may","i","i'm","i've",
  "i'd","i'll","me","my","myself","our","ours","just","over","such","being","also",
  "after","most","because","while","where","what","why","with","as","for","very",
  "really","quite","rather","actually","honestly","maybe","perhaps","though","although",
  "however","therefore","thus","hence","indeed","still","yet","even","only","much",
  "few","both","either","neither","nor","whether","whom","whose","ourselves","yourself",
  "themselves","anyone","everyone","someone","nothing","everything","something","anything",
  "don't","doesn't","didn't","isn't","aren't","wasn't","won't","can't","couldn't",
  "shouldn't","wouldn't","it's","that's","there's","he's","she's","we're","they're",
  "you're","i'm","let's","gonna","wanna","kinda","sorta","yeah","ok","okay","well",
  "anyway","basically","literally","totally","sure","right","mean","know"
];

const FW_INDEX = new Map(FUNCTION_WORDS.map((w, i) => [w, i]));

const CHUNK_SIZE = 120;      // words per chunk when estimating intra-author variance
const MIN_CHUNKS = 3;        // need a few chunks to estimate variance meaningfully
const MFW_COUNT = 60;        // most-frequent function words actually used by the author
const MFW_MIN_MEAN = 1e-3;   // ignore function words the author barely uses

/** Tokenize to lowercase words, keeping contractions intact (it's, don't). */
export function tokenizeWords(text) {
  const m = text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g);
  return m || [];
}

function sentences(text) {
  try {
    const seg = new Intl.Segmenter('en', { granularity: 'sentence' });
    return [...seg.segment(text)].map(s => s.segment.trim()).filter(Boolean);
  } catch {
    return text.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
  }
}

/** Relative frequency vector over FUNCTION_WORDS for a token list. */
function functionWordVector(tokens) {
  const vec = new Float64Array(FUNCTION_WORDS.length);
  if (!tokens.length) return vec;
  for (const t of tokens) {
    const idx = FW_INDEX.get(t);
    if (idx !== undefined) vec[idx] += 1;
  }
  for (let i = 0; i < vec.length; i++) vec[i] /= tokens.length;
  return vec;
}

/** Split a token list into ~CHUNK_SIZE-word chunks (>= MIN_CHUNKS where possible). */
function chunkTokens(tokens) {
  if (tokens.length < CHUNK_SIZE * MIN_CHUNKS) {
    // small corpus: make MIN_CHUNKS roughly-equal chunks so we still get variance
    const n = Math.min(MIN_CHUNKS, Math.max(2, Math.floor(tokens.length / 40)));
    const size = Math.ceil(tokens.length / n);
    const chunks = [];
    for (let i = 0; i < tokens.length; i += size) chunks.push(tokens.slice(i, i + size));
    return chunks.filter(c => c.length >= 20);
  }
  const chunks = [];
  for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
    chunks.push(tokens.slice(i, i + CHUNK_SIZE));
  }
  return chunks;
}

/** Surface "tells" — secondary, for explanation and a small score component. */
function surfaceFeatures(text, tokens) {
  const sents = sentences(text);
  const sentLens = sents.map(s => tokenizeWords(s).length).filter(n => n > 0);
  const meanSent = sentLens.length ? sentLens.reduce((a, b) => a + b, 0) / sentLens.length : 0;
  const avgWordLen = tokens.length ? tokens.reduce((a, w) => a + w.length, 0) / tokens.length : 0;
  const types = new Set(tokens);
  const ttr = tokens.length ? types.size / tokens.length : 0;            // vocabulary richness
  const hapax = tokens.length
    ? [...types].filter(w => tokens.indexOf(w) === tokens.lastIndexOf(w)).length / tokens.length
    : 0;                                                                  // once-only words
  const chars = text.length || 1;
  const punct = {
    comma: (text.match(/,/g) || []).length / chars * 1000,
    period: (text.match(/\./g) || []).length / chars * 1000,
    exclaim: (text.match(/!/g) || []).length / chars * 1000,
    question: (text.match(/\?/g) || []).length / chars * 1000,
    semicolon: (text.match(/;/g) || []).length / chars * 1000,
    dash: (text.match(/[—–-]/g) || []).length / chars * 1000,
    ellipsis: (text.match(/\.{2,}|…/g) || []).length / chars * 1000,
  };
  const capRate = sents.length ? sents.filter(s => /^[A-Z]/.test(s)).length / sents.length : 0;
  const contractions = tokens.filter(w => w.includes("'")).length / (tokens.length || 1);
  return { meanSent, avgWordLen, ttr, hapax, punct, capRate, contractions };
}

/**
 * Build an author profile from one or more writing samples.
 * Returns a serializable object (safe for localStorage).
 */
export function buildProfile(samples) {
  const text = samples.join('\n\n');
  const tokens = tokenizeWords(text);
  const chunks = chunkTokens(tokens);

  // Author's function-word frequency vector over the whole corpus.
  const mean = functionWordVector(tokens);

  // Most-frequent function words the author actually uses — for the "tells" panel.
  const selectedIdx = Array.from(mean.keys())
    .filter(i => mean[i] >= MFW_MIN_MEAN)
    .sort((a, b) => mean[b] - mean[a])
    .slice(0, MFW_COUNT);

  // Calibration via LEAVE-ONE-OUT: cosine of each chunk against the mean of the
  // OTHER chunks. This estimates how similar *genuinely-authored but unseen*
  // text is to the profile — the realistic "this is you" anchor. (Comparing a
  // chunk to a mean that includes it would be dishonestly high.)
  const chunkTokenLists = chunks;
  const looCos = [];
  for (let k = 0; k < chunkTokenLists.length; k++) {
    const otherTokens = [];
    for (let j = 0; j < chunkTokenLists.length; j++) if (j !== k) otherTokens.push(...chunkTokenLists[j]);
    if (!otherTokens.length) continue;
    const otherMean = functionWordVector(otherTokens);
    looCos.push(cosineSim(functionWordVector(chunkTokenLists[k]), otherMean));
  }
  const anchorMean = looCos.length ? looCos.reduce((a, b) => a + b, 0) / looCos.length : 0.5;
  const anchorStd = Math.max(
    looCos.length > 1
      ? Math.sqrt(looCos.reduce((a, c) => a + (c - anchorMean) ** 2, 0) / looCos.length)
      : 0.08,
    0.05
  );

  return {
    version: 3,
    wordCount: tokens.length,
    chunkCount: chunks.length,
    mean: Array.from(mean),
    selectedIdx,
    anchorMean,
    anchorStd,
    surface: surfaceFeatures(text, tokens),
  };
}

/** Cosine similarity between two frequency vectors (0..1 for non-negative vecs). */
function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-12);
}

function surfaceSimilarity(a, b) {
  // Normalized closeness across a handful of robust surface tells (0..1).
  const pairs = [
    [a.meanSent, b.meanSent, 8],
    [a.avgWordLen, b.avgWordLen, 1.2],
    [a.ttr, b.ttr, 0.15],
    [a.hapax, b.hapax, 0.12],
    [a.contractions, b.contractions, 0.05],
    [a.capRate, b.capRate, 0.25],
    [a.punct.comma, b.punct.comma, 8],
    [a.punct.exclaim, b.punct.exclaim, 4],
    [a.punct.dash, b.punct.dash, 4],
    [a.punct.ellipsis, b.punct.ellipsis, 3],
  ];
  let sum = 0;
  for (const [x, y, tol] of pairs) sum += Math.max(0, 1 - Math.abs(x - y) / (tol + 1e-9));
  return sum / pairs.length;
}

const FW_LABEL = (i) => FUNCTION_WORDS[i];

/**
 * Analyze a suspect text against an author profile.
 * Returns { score (0-100), delta, funcSim, surfaceSim, verdict, tells[] }.
 */
export function analyze(text, profile) {
  const tokens = tokenizeWords(text);
  const vec = functionWordVector(tokens);
  const mean = Float64Array.from(profile.mean);
  const selectedIdx = profile.selectedIdx || Array.from(mean.keys());

  // Primary signal: cosine of the suspect's function-word profile vs the author.
  const cos = cosineSim(vec, mean);
  // How does that compare to the author's own leave-one-out level?
  const z = (cos - profile.anchorMean) / profile.anchorStd;
  // z >= 0 => as self-consistent as the author's own writing. Below -0.5 the
  // odds tip toward "not you". Logistic tuned on real self/non-self cosines.
  const funcSim = 1 / (1 + Math.exp(-(z + 1.1) / 0.9));

  const surf = surfaceFeatures(text, tokens);
  const surfSim = surfaceSimilarity(surf, profile.surface);

  // Function words dominate; surface is a light secondary nudge.
  const score = Math.round(100 * Math.max(0, Math.min(1, 0.85 * funcSim + 0.15 * surfSim)));

  // Most divergent frequently-used function words -> human-readable tells.
  const contrib = [];
  for (const i of selectedIdx) {
    const diff = vec[i] - mean[i];           // absolute freq difference
    const rel = diff / (mean[i] + 1e-6);     // relative to author's usage
    if (Math.abs(rel) > 0.5 && Math.abs(diff) > 0.004) contrib.push([FW_LABEL(i), rel]);
  }
  contrib.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const tells = contrib.slice(0, 6).map(([w, rel]) =>
    rel > 0
      ? `Leans on "${w}" much more than you do`
      : `Hardly uses "${w}" — a word you reach for often`
  );

  let verdict;
  if (score >= 78) verdict = "Very likely you";
  else if (score >= 58) verdict = "Possibly you, with some off notes";
  else if (score >= 38) verdict = "Doesn't really read like you";
  else verdict = "Almost certainly not you";

  return { score, cos, z, funcSim, surfSim, verdict, tells, suspectSurface: surf };
}
