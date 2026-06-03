"""
Score input text against a fingerprint.
Returns 0-100 "You Score" + per-dimension breakdown.
"""

import math
from .fingerprint import compute_fingerprint


def normalize_distance(value, target, tolerance=1.0):
    """
    Convert absolute distance to 0-1 normalized distance.
    tolerance = how much variance is "normal".
    """
    if target == 0:
        return min(abs(value - target) / (tolerance + 0.1), 1.0)
    return min(abs(value - target) / (abs(target) * tolerance + 0.1), 1.0)


def score_text(input_text, fingerprint):
    """
    Score input_text against a fingerprint.
    Returns dict with:
      - overall_score: 0-100
      - per_dimension: dict of dimension -> (score 0-100, divergence_msg)
      - divergences: list of (dimension, msg) sorted by divergence
    """
    input_fp = compute_fingerprint(input_text)

    per_dimension = {}
    distances = {}

    # Score avg_sentence_length
    dist = normalize_distance(
        input_fp['avg_sentence_length'],
        fingerprint['avg_sentence_length'],
        tolerance=2.0
    )
    distances['avg_sentence_length'] = dist
    per_dimension['avg_sentence_length'] = (
        100 * (1 - dist),
        _msg_sentence_length(input_fp['avg_sentence_length'], fingerprint['avg_sentence_length'])
    )

    # Score sentence_length_variance
    dist = normalize_distance(
        input_fp['sentence_length_variance'],
        fingerprint['sentence_length_variance'],
        tolerance=2.0
    )
    distances['sentence_length_variance'] = dist
    per_dimension['sentence_length_variance'] = (
        100 * (1 - dist),
        _msg_sentence_variance(input_fp['sentence_length_variance'], fingerprint['sentence_length_variance'])
    )

    # Score vocab_rarity
    dist = normalize_distance(
        input_fp['vocab_rarity'],
        fingerprint['vocab_rarity'],
        tolerance=0.15
    )
    distances['vocab_rarity'] = dist
    per_dimension['vocab_rarity'] = (
        100 * (1 - dist),
        _msg_vocab_rarity(input_fp['vocab_rarity'], fingerprint['vocab_rarity'])
    )

    # Score punctuation_tics
    punct_dist = _score_punctuation(input_fp['punctuation_tics'], fingerprint['punctuation_tics'])
    distances['punctuation_tics'] = punct_dist
    per_dimension['punctuation_tics'] = (
        100 * (1 - punct_dist),
        _msg_punctuation(input_fp['punctuation_tics'], fingerprint['punctuation_tics'])
    )

    # Score filler_rate
    dist = normalize_distance(
        input_fp['filler_rate'],
        fingerprint['filler_rate'],
        tolerance=2.0
    )
    distances['filler_rate'] = dist
    per_dimension['filler_rate'] = (
        100 * (1 - dist),
        _msg_filler(input_fp['filler_rate'], fingerprint['filler_rate'])
    )

    # Score contraction_rate
    dist = normalize_distance(
        input_fp['contraction_rate'],
        fingerprint['contraction_rate'],
        tolerance=2.0
    )
    distances['contraction_rate'] = dist
    per_dimension['contraction_rate'] = (
        100 * (1 - dist),
        _msg_contraction(input_fp['contraction_rate'], fingerprint['contraction_rate'])
    )

    # Score paragraph_rhythm
    dist = normalize_distance(
        input_fp['paragraph_rhythm'],
        fingerprint['paragraph_rhythm'],
        tolerance=1.5
    )
    distances['paragraph_rhythm'] = dist
    per_dimension['paragraph_rhythm'] = (
        100 * (1 - dist),
        _msg_paragraph(input_fp['paragraph_rhythm'], fingerprint['paragraph_rhythm'])
    )

    # Score capitalization
    dist = normalize_distance(
        input_fp['capitalization_score'],
        fingerprint['capitalization_score'],
        tolerance=0.2
    )
    distances['capitalization_score'] = dist
    per_dimension['capitalization_score'] = (
        100 * (1 - dist),
        _msg_capitalization(input_fp['capitalization_score'], fingerprint['capitalization_score'])
    )

    # Compute overall score: average of all dimension scores
    overall_score = sum(100 * (1 - distances[k]) for k in distances) / len(distances)
    overall_score = max(0, min(100, overall_score))

    # Sort divergences by distance (worst first)
    divergences = [
        (k, per_dimension[k][1])
        for k in sorted(distances.keys(), key=lambda x: distances[x], reverse=True)
        if distances[k] > 0.15  # only report significant divergences
    ]

    return {
        'overall_score': overall_score,
        'per_dimension': per_dimension,
        'divergences': divergences,
    }


def _score_punctuation(input_tics, target_tics):
    """Average normalized distance across all punctuation marks."""
    if not target_tics:
        return 0

    distances = []
    for key in target_tics.keys():
        input_val = input_tics.get(key, 0)
        target_val = target_tics.get(key, 0)
        dist = normalize_distance(input_val, target_val, tolerance=2.0)
        distances.append(dist)

    return sum(distances) / len(distances) if distances else 0


def _msg_sentence_length(input_val, target_val):
    """Human message about sentence length."""
    if abs(input_val - target_val) < 0.5:
        return "Sentence length matches."
    elif input_val > target_val:
        return f"Your sentences are longer ({input_val:.1f} vs {target_val:.1f} words)."
    else:
        return f"Your sentences are shorter ({input_val:.1f} vs {target_val:.1f} words)."


def _msg_sentence_variance(input_val, target_val):
    """Human message about sentence variance."""
    if abs(input_val - target_val) < 0.3:
        return "Sentence length consistency matches."
    elif input_val > target_val:
        return "Your sentences vary more in length."
    else:
        return "Your sentences are more uniform in length."


def _msg_vocab_rarity(input_val, target_val):
    """Human message about vocabulary rarity."""
    if abs(input_val - target_val) < 0.05:
        return "Vocabulary rarity matches."
    elif input_val > target_val:
        return "You use more complex/rare vocabulary."
    else:
        return "You use simpler/more common words."


def _msg_punctuation(input_tics, target_tics):
    """Human message about punctuation."""
    biggest_diff = max(
        [(k, abs(input_tics.get(k, 0) - target_tics.get(k, 0)))
         for k in target_tics.keys()],
        key=lambda x: x[1],
        default=(None, 0)
    )
    if biggest_diff[0]:
        key = biggest_diff[0].replace('_', ' ')
        return f"Punctuation differs most in {key}."
    return "Punctuation differs."


def _msg_filler(input_val, target_val):
    """Human message about filler words."""
    if abs(input_val - target_val) < 0.5:
        return "Filler word usage matches."
    elif input_val > target_val:
        return f"You use more filler words ({input_val:.1f}% vs {target_val:.1f}%)."
    else:
        return f"You use fewer filler words ({input_val:.1f}% vs {target_val:.1f}%)."


def _msg_contraction(input_val, target_val):
    """Human message about contractions."""
    if abs(input_val - target_val) < 1.0:
        return "Contraction usage matches."
    elif input_val > target_val:
        return f"You use more contractions ({input_val:.1f}% vs {target_val:.1f}%)."
    else:
        return f"You use fewer contractions ({input_val:.1f}% vs {target_val:.1f}%)."


def _msg_paragraph(input_val, target_val):
    """Human message about paragraph rhythm."""
    if abs(input_val - target_val) < 0.3:
        return "Paragraph rhythm matches."
    elif input_val > target_val:
        return f"Your paragraphs are longer ({input_val:.1f} vs {target_val:.1f} sentences)."
    else:
        return f"Your paragraphs are shorter ({input_val:.1f} vs {target_val:.1f} sentences)."


def _msg_capitalization(input_val, target_val):
    """Human message about capitalization."""
    if abs(input_val - target_val) < 0.1:
        return "Capitalization matches."
    elif input_val < target_val:
        return "You often start sentences lowercase."
    else:
        return "You always capitalize sentence starts."
