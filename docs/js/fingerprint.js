/**
 * Extract writing style fingerprint from text.
 * Computes 8 dimensions matching Python fingerprint.py
 */

import { STOPWORDS } from './stopwords.js';

// Contractions to detect
const CONTRACTIONS = new Set([
  "n't", "'m", "'s", "'re", "'ve", "'ll", "'d"
]);

// Filler/hedge words
const FILLERS = new Set([
  "like", "basically", "honestly", "literally", "i mean", "kinda",
  "just", "really", "actually", "tbh", "you know", "i guess",
  "sort of", "kind of", "i think", "whatever"
]);

let wordfreqData = null;

/**
 * Load wordfreq data from JSON file.
 * Should be called on app init.
 */
export async function loadWordfreq() {
  if (wordfreqData) return wordfreqData;
  try {
    const response = await fetch('./data/wordfreq_en.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    wordfreqData = await response.json();
    return wordfreqData;
  } catch (err) {
    console.error('Failed to load wordfreq:', err);
    wordfreqData = {}; // Fallback to empty
    return wordfreqData;
  }
}

/**
 * Tokenize text into sentences using Intl.Segmenter or regex fallback.
 */
function getSentences(text) {
  try {
    const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
    const segments = segmenter.segment(text);
    const sentences = [];
    for (const segment of segments) {
      const s = segment.segment.trim();
      if (s) sentences.push(s);
    }
    return sentences;
  } catch {
    // Fallback: split on sentence punctuation
    const sents = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s);
    return sents;
  }
}

/**
 * Tokenize text into words using Intl.Segmenter or regex fallback.
 */
function getWords(text) {
  try {
    const segmenter = new Intl.Segmenter('en', { granularity: 'word' });
    const segments = segmenter.segment(text.toLowerCase());
    const words = [];
    for (const segment of segments) {
      // Keep word-like segments INCLUDING contractions (apostrophes).
      // Without this, "don't"/"it's" get dropped and contraction_rate is
      // always 0 — the contraction detector relies on intact tokens.
      if (/[a-z0-9]/.test(segment.segment) && /^[\w']+$/.test(segment.segment)) {
        words.push(segment.segment);
      }
    }
    return words;
  } catch {
    // Fallback: regex that preserves internal apostrophes (don't, it's)
    const matches = text.toLowerCase().match(/[a-z0-9]+(?:'[a-z]+)?/gi);
    return matches || [];
  }
}

/**
 * Get content words (alphabetic, non-stopword).
 */
function getContentWords(text) {
  const words = getWords(text);
  return words.filter(w => /^[a-z]+$/.test(w) && !STOPWORDS.has(w));
}

/**
 * Average words per sentence.
 */
function avgSentenceLength(text) {
  const sentences = getSentences(text);
  if (!sentences.length) return 0;
  const totalWords = sentences.reduce((sum, s) => sum + getWords(s).length, 0);
  return totalWords / sentences.length;
}

/**
 * Variance (std dev) of sentence lengths.
 */
function sentenceLengthVariance(text) {
  const sentences = getSentences(text);
  if (sentences.length < 2) return 0;
  const lengths = sentences.map(s => getWords(s).length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((sum, len) => sum + Math.pow(len - mean, 2), 0) / lengths.length;
  return Math.sqrt(variance);
}

/**
 * Vocabulary rarity: mean(1 - zipf/8) for content words.
 * If word not in wordfreq, treat as zipf=0 (maximally rare).
 */
function vocabRarity(text) {
  const words = getContentWords(text);
  if (!words.length) return 0;

  const rarityScores = words.map(word => {
    const zipf = wordfreqData && wordfreqData[word] ? wordfreqData[word] : 0;
    const rarity = 1 - (zipf / 8);
    return Math.max(0, Math.min(1, rarity));
  });

  return rarityScores.reduce((a, b) => a + b, 0) / rarityScores.length;
}

/**
 * Punctuation tics per 1000 chars.
 */
function punctuationTics(text) {
  if (!text) return {};
  const scale = text.length / 1000.0;

  return {
    'ellipsis': (text.match(/\.{2,}/g) || []).length / scale,
    'em_dash': (text.match(/—/g) || []).length / scale,
    'en_dash': (text.match(/–/g) || []).length / scale,
    'exclamation': (text.match(/!/g) || []).length / scale,
    'question': (text.match(/\?/g) || []).length / scale,
    'comma': (text.match(/,/g) || []).length / scale,
    'semicolon': (text.match(/;/g) || []).length / scale,
  };
}

/**
 * Filler word frequency as % of total words.
 */
function fillerRate(text) {
  const words = getWords(text);
  if (!words.length) return 0;

  let fillerCount = 0;
  const textLower = text.toLowerCase();

  for (const word of words) {
    if (FILLERS.has(word)) {
      fillerCount++;
    }
  }

  // Also check multi-word phrases
  for (const phrase of FILLERS) {
    if (phrase.includes(' ')) {
      const pattern = new RegExp('\\b' + phrase.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\b', 'gi');
      const matches = textLower.match(pattern) || [];
      fillerCount += matches.length;
    }
  }

  return (fillerCount / words.length) * 100;
}

/**
 * Contraction frequency as % of total words.
 */
function contractionRate(text) {
  const words = getWords(text);
  if (!words.length) return 0;

  const contractionCount = words.filter(w => {
    for (const c of CONTRACTIONS) {
      if (w.includes(c)) return true;
    }
    return false;
  }).length;

  return (contractionCount / words.length) * 100;
}

/**
 * Average sentences per paragraph.
 */
function paragraphRhythm(text) {
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(p => p);
  if (!paragraphs.length) return 0;

  const totalSentences = paragraphs.reduce((sum, p) => sum + getSentences(p).length, 0);
  return totalSentences / paragraphs.length;
}

/**
 * Fraction of sentences starting with capital letter.
 */
function capitalizationScore(text) {
  const sentences = getSentences(text);
  if (!sentences.length) return 0;

  const capitalized = sentences.filter(s => s && /^[A-Z]/.test(s)).length;
  return capitalized / sentences.length;
}

/**
 * Compute complete fingerprint for text.
 */
export function computeFingerprint(text) {
  text = text.trim();

  return {
    'avg_sentence_length': avgSentenceLength(text),
    'sentence_length_variance': sentenceLengthVariance(text),
    'vocab_rarity': vocabRarity(text),
    'punctuation_tics': punctuationTics(text),
    'filler_rate': fillerRate(text),
    'contraction_rate': contractionRate(text),
    'paragraph_rhythm': paragraphRhythm(text),
    'capitalization_score': capitalizationScore(text),
  };
}

/**
 * Merge multiple fingerprints (averaging).
 */
export function mergeFingerprints(fingerprints) {
  if (!fingerprints.length) return {};

  const merged = {};
  const n = fingerprints.length;

  const keys = Object.keys(fingerprints[0]);
  for (const key of keys) {
    const values = fingerprints.map(fp => fp[key]);

    if (typeof values[0] === 'object' && values[0] !== null) {
      // Merge dicts (punctuation_tics)
      const subMerged = {};
      for (const fp of fingerprints) {
        for (const [k, v] of Object.entries(fp[key])) {
          if (!subMerged[k]) subMerged[k] = [];
          subMerged[k].push(v);
        }
      }
      merged[key] = {};
      for (const [k, vals] of Object.entries(subMerged)) {
        merged[key][k] = vals.reduce((a, b) => a + b, 0) / vals.length;
      }
    } else {
      // Average numeric values
      merged[key] = values.reduce((a, b) => a + b, 0) / n;
    }
  }

  return merged;
}
