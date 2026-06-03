"""
Extract writing style fingerprint from text.
Computes 7 dimensions of writing style.
"""

import re
import math
from collections import defaultdict
from nltk.tokenize import sent_tokenize, word_tokenize
from nltk.corpus import stopwords
import wordfreq


# Common contractions
CONTRACTIONS = {
    "n't", "'m", "'s", "'re", "'ve", "'ll", "'d"
}

# Filler/hedge words
FILLERS = {
    "like", "basically", "honestly", "literally", "i mean", "kinda",
    "just", "really", "actually", "tbh", "you know", "i guess",
    "sort of", "kind of", "i think", "whatever"
}


def _clean_text(text):
    """Normalize text for analysis."""
    return text.strip()


def _get_sentences(text):
    """Tokenize into sentences; handle edge cases."""
    try:
        sentences = sent_tokenize(text)
    except:
        # fallback
        sentences = re.split(r'[.!?]+', text)
        sentences = [s.strip() for s in sentences if s.strip()]
    return sentences


def _get_words(text):
    """Tokenize into words (lowercase)."""
    try:
        words = word_tokenize(text.lower())
    except:
        # fallback
        words = re.findall(r"\b\w+\b", text.lower())
    return words


def _get_content_words(text):
    """Get non-stopword content words."""
    try:
        stop = set(stopwords.words('english'))
    except:
        stop = set()

    words = _get_words(text)
    return [w for w in words if w.isalpha() and w not in stop]


def avg_sentence_length(text):
    """Average words per sentence."""
    sentences = _get_sentences(text)
    if not sentences:
        return 0
    total_words = sum(len(word_tokenize(s)) for s in sentences)
    return total_words / len(sentences)


def sentence_length_variance(text):
    """Variance of sentence lengths."""
    sentences = _get_sentences(text)
    if len(sentences) < 2:
        return 0
    lengths = [len(word_tokenize(s)) for s in sentences]
    mean = sum(lengths) / len(lengths)
    variance = sum((l - mean) ** 2 for l in lengths) / len(lengths)
    return math.sqrt(variance)  # return std dev


def vocab_rarity(text):
    """
    Mean rarity score: 1 - (zipf_frequency / 8).
    Higher = rarer vocabulary.
    Only considers content words.
    """
    words = _get_content_words(text)
    if not words:
        return 0

    rarity_scores = []
    for word in words:
        freq = wordfreq.zipf_frequency(word, 'en')
        rarity = 1 - (freq / 8)  # normalize to 0-1
        rarity = max(0, min(1, rarity))  # clamp
        rarity_scores.append(rarity)

    return sum(rarity_scores) / len(rarity_scores) if rarity_scores else 0


def punctuation_tics(text):
    """
    Per-1000-chars frequency of: ..., em/en dashes, !, ?, commas, semicolons.
    Returns dict with these counts.
    """
    if not text:
        return {}

    scale = len(text) / 1000.0

    result = {
        'ellipsis': len(re.findall(r'\.{2,}', text)) / scale,
        'em_dash': len(re.findall(r'—', text)) / scale,
        'en_dash': len(re.findall(r'–', text)) / scale,
        'exclamation': text.count('!') / scale,
        'question': text.count('?') / scale,
        'comma': text.count(',') / scale,
        'semicolon': text.count(';') / scale,
    }
    return result


def filler_rate(text):
    """Frequency of filler words as % of total words."""
    words = _get_words(text)
    if not words:
        return 0

    filler_count = 0
    for word in words:
        # check exact match and multi-word phrases
        if word in FILLERS:
            filler_count += 1

    # also check for "i mean", "you know", etc. as substrings
    text_lower = text.lower()
    for phrase in [w for w in FILLERS if ' ' in w]:
        filler_count += len(re.findall(r'\b' + re.escape(phrase) + r'\b', text_lower))

    return (filler_count / len(words)) * 100 if words else 0


def contraction_rate(text):
    """Contractions as % of total words."""
    words = _get_words(text)
    if not words:
        return 0

    contraction_count = sum(1 for w in words if any(c in w for c in CONTRACTIONS))
    return (contraction_count / len(words)) * 100 if words else 0


def paragraph_rhythm(text):
    """Average number of sentences per paragraph."""
    # split by double newline or similar
    paragraphs = re.split(r'\n\s*\n', text)
    paragraphs = [p.strip() for p in paragraphs if p.strip()]

    if not paragraphs:
        return 0

    total_sentences = sum(len(_get_sentences(p)) for p in paragraphs)
    return total_sentences / len(paragraphs)


def capitalization_score(text):
    """Fraction of sentences that start with capital letter."""
    sentences = _get_sentences(text)
    if not sentences:
        return 0

    capitalized = sum(1 for s in sentences if s and s[0].isupper())
    return capitalized / len(sentences)


def compute_fingerprint(text):
    """
    Compute complete fingerprint for a text.
    Returns dict with all 7+ dimensions.
    """
    text = _clean_text(text)

    fingerprint = {
        'avg_sentence_length': avg_sentence_length(text),
        'sentence_length_variance': sentence_length_variance(text),
        'vocab_rarity': vocab_rarity(text),
        'punctuation_tics': punctuation_tics(text),
        'filler_rate': filler_rate(text),
        'contraction_rate': contraction_rate(text),
        'paragraph_rhythm': paragraph_rhythm(text),
        'capitalization_score': capitalization_score(text),
    }

    return fingerprint


def merge_fingerprints(fingerprints_list):
    """
    Merge multiple fingerprints (e.g., from multiple samples).
    Averages numeric values; recursively merges dicts.
    """
    if not fingerprints_list:
        return {}

    merged = {}
    n = len(fingerprints_list)

    # get all keys from first fingerprint
    for key in fingerprints_list[0].keys():
        values = [fp[key] for fp in fingerprints_list if key in fp]

        if isinstance(values[0], dict):
            # merge dicts (punctuation_tics)
            sub_merged = defaultdict(list)
            for fp in fingerprints_list:
                for k, v in fp[key].items():
                    sub_merged[k].append(v)
            merged[key] = {k: sum(v) / len(v) for k, v in sub_merged.items()}
        else:
            # average numeric values
            merged[key] = sum(values) / len(values)

    return merged
