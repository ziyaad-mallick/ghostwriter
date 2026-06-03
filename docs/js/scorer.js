/**
 * Score input text against a fingerprint.
 * Returns 0-100 "You Score" + per-dimension breakdown.
 */

import { computeFingerprint } from './fingerprint.js';

/**
 * Normalize absolute distance to 0-1.
 * tolerance = how much variance is "normal".
 */
function normalizeDistance(value, target, tolerance = 1.0) {
  if (target === 0) {
    return Math.min(Math.abs(value - target) / (tolerance + 0.1), 1.0);
  }
  return Math.min(Math.abs(value - target) / (Math.abs(target) * tolerance + 0.1), 1.0);
}

/**
 * Message about sentence length.
 */
function msgSentenceLength(inputVal, targetVal) {
  if (Math.abs(inputVal - targetVal) < 0.5) {
    return "Sentence length matches.";
  } else if (inputVal > targetVal) {
    return `Your sentences are longer (${inputVal.toFixed(1)} vs ${targetVal.toFixed(1)} words).`;
  } else {
    return `Your sentences are shorter (${inputVal.toFixed(1)} vs ${targetVal.toFixed(1)} words).`;
  }
}

/**
 * Message about sentence variance.
 */
function msgSentenceVariance(inputVal, targetVal) {
  if (Math.abs(inputVal - targetVal) < 0.3) {
    return "Sentence length consistency matches.";
  } else if (inputVal > targetVal) {
    return "Your sentences vary more in length.";
  } else {
    return "Your sentences are more uniform in length.";
  }
}

/**
 * Message about vocab rarity.
 */
function msgVocabRarity(inputVal, targetVal) {
  if (Math.abs(inputVal - targetVal) < 0.05) {
    return "Vocabulary rarity matches.";
  } else if (inputVal > targetVal) {
    return "You use more complex/rare vocabulary.";
  } else {
    return "You use simpler/more common words.";
  }
}

/**
 * Message about punctuation.
 */
function msgPunctuation(inputTics, targetTics) {
  let biggestDiff = null;
  let maxDiff = 0;
  for (const key of Object.keys(targetTics)) {
    const diff = Math.abs((inputTics[key] || 0) - (targetTics[key] || 0));
    if (diff > maxDiff) {
      maxDiff = diff;
      biggestDiff = key;
    }
  }
  if (biggestDiff) {
    const key = biggestDiff.replace(/_/g, ' ');
    return `Punctuation differs most in ${key}.`;
  }
  return "Punctuation differs.";
}

/**
 * Message about filler words.
 */
function msgFiller(inputVal, targetVal) {
  if (Math.abs(inputVal - targetVal) < 0.5) {
    return "Filler word usage matches.";
  } else if (inputVal > targetVal) {
    return `You use more filler words (${inputVal.toFixed(1)}% vs ${targetVal.toFixed(1)}%).`;
  } else {
    return `You use fewer filler words (${inputVal.toFixed(1)}% vs ${targetVal.toFixed(1)}%).`;
  }
}

/**
 * Message about contractions.
 */
function msgContraction(inputVal, targetVal) {
  if (Math.abs(inputVal - targetVal) < 1.0) {
    return "Contraction usage matches.";
  } else if (inputVal > targetVal) {
    return `You use more contractions (${inputVal.toFixed(1)}% vs ${targetVal.toFixed(1)}%).`;
  } else {
    return `You use fewer contractions (${inputVal.toFixed(1)}% vs ${targetVal.toFixed(1)}%).`;
  }
}

/**
 * Message about paragraph rhythm.
 */
function msgParagraph(inputVal, targetVal) {
  if (Math.abs(inputVal - targetVal) < 0.3) {
    return "Paragraph rhythm matches.";
  } else if (inputVal > targetVal) {
    return `Your paragraphs are longer (${inputVal.toFixed(1)} vs ${targetVal.toFixed(1)} sentences).`;
  } else {
    return `Your paragraphs are shorter (${inputVal.toFixed(1)} vs ${targetVal.toFixed(1)} sentences).`;
  }
}

/**
 * Message about capitalization.
 */
function msgCapitalization(inputVal, targetVal) {
  if (Math.abs(inputVal - targetVal) < 0.1) {
    return "Capitalization matches.";
  } else if (inputVal < targetVal) {
    return "You often start sentences lowercase.";
  } else {
    return "You always capitalize sentence starts.";
  }
}

/**
 * Score punctuation across all marks.
 */
function scorePunctuation(inputTics, targetTics) {
  if (!Object.keys(targetTics).length) return 0;

  const distances = [];
  for (const key of Object.keys(targetTics)) {
    const inputVal = inputTics[key] || 0;
    const targetVal = targetTics[key] || 0;
    const dist = normalizeDistance(inputVal, targetVal, 2.0);
    distances.push(dist);
  }

  return distances.length ? distances.reduce((a, b) => a + b, 0) / distances.length : 0;
}

/**
 * Score input text against a fingerprint.
 */
export function scoreText(inputText, fingerprint) {
  const inputFp = computeFingerprint(inputText);

  const perDimension = {};
  const distances = {};

  // Score avg_sentence_length
  {
    const dist = normalizeDistance(
      inputFp['avg_sentence_length'],
      fingerprint['avg_sentence_length'],
      2.0
    );
    distances['avg_sentence_length'] = dist;
    perDimension['avg_sentence_length'] = [
      100 * (1 - dist),
      msgSentenceLength(inputFp['avg_sentence_length'], fingerprint['avg_sentence_length'])
    ];
  }

  // Score sentence_length_variance
  {
    const dist = normalizeDistance(
      inputFp['sentence_length_variance'],
      fingerprint['sentence_length_variance'],
      2.0
    );
    distances['sentence_length_variance'] = dist;
    perDimension['sentence_length_variance'] = [
      100 * (1 - dist),
      msgSentenceVariance(inputFp['sentence_length_variance'], fingerprint['sentence_length_variance'])
    ];
  }

  // Score vocab_rarity
  {
    const dist = normalizeDistance(
      inputFp['vocab_rarity'],
      fingerprint['vocab_rarity'],
      0.15
    );
    distances['vocab_rarity'] = dist;
    perDimension['vocab_rarity'] = [
      100 * (1 - dist),
      msgVocabRarity(inputFp['vocab_rarity'], fingerprint['vocab_rarity'])
    ];
  }

  // Score punctuation_tics
  {
    const dist = scorePunctuation(inputFp['punctuation_tics'], fingerprint['punctuation_tics']);
    distances['punctuation_tics'] = dist;
    perDimension['punctuation_tics'] = [
      100 * (1 - dist),
      msgPunctuation(inputFp['punctuation_tics'], fingerprint['punctuation_tics'])
    ];
  }

  // Score filler_rate
  {
    const dist = normalizeDistance(
      inputFp['filler_rate'],
      fingerprint['filler_rate'],
      2.0
    );
    distances['filler_rate'] = dist;
    perDimension['filler_rate'] = [
      100 * (1 - dist),
      msgFiller(inputFp['filler_rate'], fingerprint['filler_rate'])
    ];
  }

  // Score contraction_rate
  {
    const dist = normalizeDistance(
      inputFp['contraction_rate'],
      fingerprint['contraction_rate'],
      2.0
    );
    distances['contraction_rate'] = dist;
    perDimension['contraction_rate'] = [
      100 * (1 - dist),
      msgContraction(inputFp['contraction_rate'], fingerprint['contraction_rate'])
    ];
  }

  // Score paragraph_rhythm
  {
    const dist = normalizeDistance(
      inputFp['paragraph_rhythm'],
      fingerprint['paragraph_rhythm'],
      1.5
    );
    distances['paragraph_rhythm'] = dist;
    perDimension['paragraph_rhythm'] = [
      100 * (1 - dist),
      msgParagraph(inputFp['paragraph_rhythm'], fingerprint['paragraph_rhythm'])
    ];
  }

  // Score capitalization
  {
    const dist = normalizeDistance(
      inputFp['capitalization_score'],
      fingerprint['capitalization_score'],
      0.2
    );
    distances['capitalization_score'] = dist;
    perDimension['capitalization_score'] = [
      100 * (1 - dist),
      msgCapitalization(inputFp['capitalization_score'], fingerprint['capitalization_score'])
    ];
  }

  // Compute overall score
  const overallScore = Math.max(0, Math.min(100,
    Object.keys(distances).reduce((sum, k) => sum + 100 * (1 - distances[k]), 0) / Object.keys(distances).length
  ));

  // Sort divergences by distance (worst first), threshold 0.15
  const divergences = Object.entries(distances)
    .filter(([_, dist]) => dist > 0.15)
    .sort(([_, a], [__, b]) => b - a)
    .map(([k, _]) => [k, perDimension[k][1]]);

  return {
    'overall_score': overallScore,
    'per_dimension': perDimension,
    'divergences': divergences,
  };
}
