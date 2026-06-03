/**
 * Rewrite text toward a target fingerprint.
 * Deterministic PRNG seeded from text + aggressiveness.
 */

import { computeFingerprint } from './fingerprint.js';

/**
 * Cyrb53 string hash (deterministic, non-crypto).
 */
function cyrb53(str) {
  let h1 = 0xdeadbeef ^ 0, h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 2246822519);
  }
  h1 = Math.imul(h1 ^ (h1>>>16), 2246822519) ^ Math.imul(h2 ^ (h2>>>13), 3266489917);
  h2 = Math.imul(h2 ^ (h2>>>16), 2246822519) ^ Math.imul(h1 ^ (h1>>>13), 3266489917);
  return 4294967296 * (2097151 & h2) + (h1>>>0);
}

/**
 * Seeded PRNG (mulberry32).
 */
function createSeededRNG(seed) {
  return function() {
    seed |= 0;
    seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Create deterministic RNG for text + aggressiveness.
 */
function stableSeed(text, aggressiveness) {
  const key = `${aggressiveness.toFixed(4)}|${text}`;
  const hashVal = cyrb53(key);
  return hashVal >>> 0;
}

/**
 * Tokenize sentences (simplified).
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
    const sents = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s);
    return sents;
  }
}

/**
 * Tokenize words.
 */
function getWords(text) {
  const matches = text.match(/\b\w+\b/g);
  return matches || [];
}

/**
 * Clean up spacing artifacts from word reconstruction.
 */
function detokenize(text) {
  text = text.replace(/\s+([.,!?;:%])/g, '$1');       // ' ,' -> ','
  text = text.replace(/\s+(n't|'\w+)\b/g, '$1');       // 'do n't' -> "don't"
  text = text.replace(/\(\s+/g, '(');
  text = text.replace(/\s+\)/g, ')');
  text = text.replace(/\s{2,}/g, ' ');                 // collapse spaces
  return text.trim();
}

/**
 * Adjust sentence structure toward target length.
 */
function adjustSentences(text, currentFp, targetFp, aggressiveness, rng) {
  const sentences = getSentences(text);
  if (sentences.length < 2) return text;

  const currentLen = currentFp['avg_sentence_length'];
  const targetLen = targetFp['avg_sentence_length'];

  // If target is shorter, merge some sentences
  if (targetLen < currentLen - 1 && aggressiveness > 0.3) {
    const merged = [];
    let i = 0;
    while (i < sentences.length) {
      let s = sentences[i];
      if (i < sentences.length - 1 && rng() < aggressiveness * 0.3) {
        let nxt = sentences[i + 1].trim();
        nxt = nxt[0].toLowerCase() + nxt.slice(1);
        s = s.replace(/[.!?]+$/, '') + ', ' + nxt;
        i += 2;
      } else {
        i += 1;
      }
      merged.push(s);
    }
    text = merged.join(' ');
  }

  // If target is longer, split some sentences
  else if (targetLen > currentLen + 1 && aggressiveness > 0.3) {
    const split = [];
    for (let s of sentences) {
      const words = getWords(s);
      if (words.length > targetLen * 1.5 && rng() < aggressiveness * 0.2) {
        const mid = Math.floor(words.length / 2);
        let found = false;
        for (let j = mid - 2; j <= mid + 2; j++) {
          if (j > 0 && j < words.length) {
            const part1 = words.slice(0, j).join(' ');
            const part2 = words.slice(j).join(' ');
            split.push(part1 + '.');
            split.push(part2);
            found = true;
            break;
          }
        }
        if (!found) split.push(s);
      } else {
        split.push(s);
      }
    }
    text = split.join(' ');
  }

  return text;
}

/**
 * Inject or remove contractions toward target rate.
 */
function adjustContractions(text, currentFp, targetFp, aggressiveness, rng) {
  const currentRate = currentFp['contraction_rate'];
  const targetRate = targetFp['contraction_rate'];

  if (Math.abs(currentRate - targetRate) < 1.0) return text;

  const contractionsMap = {
    'cannot': "can't", 'will not': "won't", 'is not': "isn't",
    'are not': "aren't", 'was not': "wasn't", 'were not': "weren't",
    'have not': "haven't", 'has not': "hasn't", 'had not': "hadn't",
    'do not': "don't", 'does not': "doesn't", 'did not': "didn't",
    'it is': "it's", 'that is': "that's", 'there is': "there's",
    'i am': "I'm", 'you are': "you're", 'we are': "we're",
    'they are': "they're", 'i have': "I've", 'i will': "I'll",
    'you will': "you'll",
  };

  const expansionsMap = {
    "can't": 'cannot', "won't": 'will not', "isn't": 'is not',
    "aren't": 'are not', "don't": 'do not', "doesn't": 'does not',
    "didn't": 'did not', "it's": 'it is', "I'm": 'I am',
    "you're": 'you are', "we're": 'we are', "they're": 'they are'
  };

  if (targetRate > currentRate && aggressiveness > 0.3) {
    const prob = Math.min(1.0, aggressiveness * 1.1);
    for (const [phrase, contracted] of Object.entries(contractionsMap)) {
      if (rng() < prob) {
        const pattern = new RegExp('\\b' + phrase.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\b', 'gi');
        text = text.replace(pattern, contracted);
      }
    }
  } else if (targetRate < currentRate && aggressiveness > 0.3) {
    for (const [contraction, expansion] of Object.entries(expansionsMap)) {
      if (rng() < aggressiveness * 0.2) {
        const pattern = new RegExp('\\b' + contraction.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\b', 'gi');
        text = text.replace(pattern, expansion);
      }
    }
  }

  return text;
}

/**
 * Inject characteristic punctuation toward target rates.
 */
function adjustPunctuation(text, currentFp, targetFp, aggressiveness, rng) {
  const targetTics = targetFp['punctuation_tics'];

  // Ellipses
  if ((targetTics['ellipsis'] || 0) > 2 && aggressiveness > 0.4) {
    const sentences = getSentences(text);
    for (let i = 0; i < sentences.length; i++) {
      if (rng() < aggressiveness * 0.4 && !sentences[i].endsWith('...')) {
        sentences[i] = sentences[i].replace(/[.!?]+$/, '') + '...';
      }
    }
    text = sentences.join(' ');
  }

  // Em dashes
  if ((targetTics['em_dash'] || 0) > 1 && aggressiveness > 0.5) {
    if (rng() < aggressiveness * 0.1) {
      text = text.replace(/,\s+/g, ' — ');
    }
  }

  // Exclamation marks
  if ((targetTics['exclamation'] || 0) > 2 && aggressiveness > 0.5) {
    const sentences = getSentences(text);
    for (let i = 0; i < sentences.length; i++) {
      if (sentences[i].endsWith('.') && rng() < aggressiveness * 0.1) {
        sentences[i] = sentences[i].slice(0, -1) + '!';
      }
    }
    text = sentences.join(' ');
  }

  return text;
}

/**
 * Inject filler words toward target rate.
 */
function adjustFillers(text, currentFp, targetFp, aggressiveness, rng) {
  const currentRate = currentFp['filler_rate'];
  const targetRate = targetFp['filler_rate'];

  if (Math.abs(currentRate - targetRate) < 0.5) return text;

  const fillers = ['like', 'basically', 'honestly', 'literally', 'you know', 'kinda', 'just', 'really'];

  if (targetRate > currentRate && aggressiveness > 0.4) {
    const sentences = getSentences(text);
    for (let i = 0; i < sentences.length; i++) {
      if (rng() < aggressiveness * 0.15) {
        const filler = fillers[Math.floor(rng() * fillers.length)];
        sentences[i] = filler + ', ' + sentences[i];
      }
    }
    text = sentences.join(' ');
  }

  return text;
}

/**
 * Adjust capitalization of sentence starts.
 */
function adjustCapitalization(text, currentFp, targetFp, aggressiveness, rng) {
  const currentCap = currentFp['capitalization_score'];
  const targetCap = targetFp['capitalization_score'];

  if (Math.abs(currentCap - targetCap) < 0.1) return text;

  const sentences = getSentences(text);

  if (targetCap < 0.7 && aggressiveness > 0.5) {
    const lowerProb = (1 - targetCap) * aggressiveness;
    for (let i = 0; i < sentences.length; i++) {
      if (sentences[i] && /^[A-Z]/.test(sentences[i]) && rng() < lowerProb) {
        sentences[i] = sentences[i][0].toLowerCase() + sentences[i].slice(1);
      }
    }
  } else if (targetCap > 0.95 && aggressiveness > 0.5) {
    for (let i = 0; i < sentences.length; i++) {
      if (sentences[i] && /^[a-z]/.test(sentences[i])) {
        sentences[i] = sentences[i][0].toUpperCase() + sentences[i].slice(1);
      }
    }
  }

  return sentences.join(' ');
}

/**
 * Rewrite text toward target fingerprint.
 */
export function rewriteText(text, targetFingerprint, aggressiveness = 0.5) {
  const seed = stableSeed(text, aggressiveness);
  const rng = createSeededRNG(seed);

  text = text.trim();
  const currentFp = computeFingerprint(text);

  let result = text;

  if (aggressiveness > 0) {
    result = adjustSentences(result, currentFp, targetFingerprint, aggressiveness, rng);
    result = adjustContractions(result, currentFp, targetFingerprint, aggressiveness, rng);
    result = adjustPunctuation(result, currentFp, targetFingerprint, aggressiveness, rng);
    result = adjustFillers(result, currentFp, targetFingerprint, aggressiveness, rng);
    result = adjustCapitalization(result, currentFp, targetFingerprint, aggressiveness, rng);
  }

  return detokenize(result);
}
