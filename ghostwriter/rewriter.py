"""
Rewrite text toward a target fingerprint with configurable aggressiveness.
"""

import random
import re
import hashlib
from nltk.tokenize import sent_tokenize, word_tokenize
from nltk.corpus import wordnet
from .fingerprint import compute_fingerprint, _get_words, _get_sentences


def _stable_seed(text, aggressiveness):
    """Process-independent seed. (Python's built-in hash() is randomized
    per-process via PYTHONHASHSEED, so it can't be used for determinism.)"""
    key = f"{aggressiveness:.4f}|{text}".encode("utf-8")
    return int(hashlib.sha256(key).hexdigest(), 16) % (2**31)


def _detokenize(text):
    """Clean up spacing artifacts from word_tokenize -> ' '.join round-trips:
    spaces before punctuation, split contractions, doubled spaces."""
    text = re.sub(r"\s+([.,!?;:%])", r"\1", text)          # ' ,' -> ','
    text = re.sub(r"\s+(n't|'\w+)\b", r"\1", text)          # 'do n't' -> "don't", 'I 's' -> "I's"
    text = re.sub(r"\(\s+", "(", text)
    text = re.sub(r"\s+\)", ")", text)
    text = re.sub(r"\s{2,}", " ", text)                     # collapse runs of spaces
    return text.strip()


def rewrite_text(text, target_fingerprint, aggressiveness=0.5):
    """
    Rewrite text toward target fingerprint.
    aggressiveness: 0.0 (no change) to 1.0 (maximum transform).
    Returns rewritten text (deterministic for same input + settings).
    """
    random.seed(_stable_seed(text, aggressiveness))  # deterministic randomness

    text = text.strip()
    current_fp = compute_fingerprint(text)

    # Start with original
    result = text

    # Apply transforms based on aggressiveness
    if aggressiveness > 0:
        # 1. Adjust sentence structure
        result = _adjust_sentences(result, current_fp, target_fingerprint, aggressiveness)

        # 2. Adjust contractions
        result = _adjust_contractions(result, current_fp, target_fingerprint, aggressiveness)

        # 3. Adjust punctuation
        result = _adjust_punctuation(result, current_fp, target_fingerprint, aggressiveness)

        # 4. Adjust filler words
        result = _adjust_fillers(result, current_fp, target_fingerprint, aggressiveness)

        # 5. Adjust capitalization
        result = _adjust_capitalization(result, current_fp, target_fingerprint, aggressiveness)

        # 6. Light vocabulary substitution
        if aggressiveness > 0.6:
            result = _adjust_vocabulary(result, current_fp, target_fingerprint, aggressiveness)

    return _detokenize(result)


def _adjust_sentences(text, current_fp, target_fp, aggressiveness):
    """Split/merge sentences toward target avg length."""
    sentences = _get_sentences(text)
    if len(sentences) < 2:
        return text

    current_len = current_fp['avg_sentence_length']
    target_len = target_fp['avg_sentence_length']

    # If target is shorter, merge some sentences
    if target_len < current_len - 1 and aggressiveness > 0.3:
        merged = []
        i = 0
        while i < len(sentences):
            s = sentences[i]
            # randomly merge adjacent sentences
            if (i < len(sentences) - 1 and
                random.random() < aggressiveness * 0.3):
                nxt = sentences[i + 1].lstrip()
                nxt = nxt[0].lower() + nxt[1:] if nxt else nxt
                s = s.rstrip('.!?') + ', ' + nxt
                i += 2
            else:
                i += 1
            merged.append(s)
        text = ' '.join(merged)

    # If target is longer, split some sentences
    elif target_len > current_len + 1 and aggressiveness > 0.3:
        split = []
        for s in sentences:
            if len(word_tokenize(s)) > target_len * 1.5 and random.random() < aggressiveness * 0.2:
                # try to split at a natural break
                words = word_tokenize(s)
                mid = len(words) // 2
                # find a good break point
                for j in range(mid - 2, mid + 3):
                    if 0 < j < len(words):
                        part1 = ' '.join(words[:j])
                        part2 = ' '.join(words[j:])
                        split.append(part1 + '.')
                        split.append(part2)
                        break
                else:
                    split.append(s)
            else:
                split.append(s)
        text = ' '.join(split)

    return text


def _adjust_contractions(text, current_fp, target_fp, aggressiveness):
    """Inject or remove contractions toward target rate."""
    current_rate = current_fp['contraction_rate']
    target_rate = target_fp['contraction_rate']

    if abs(current_rate - target_rate) < 1.0:
        return text

    # Multi-word phrases handled via regex (order matters: longest first).
    contractions_map = {
        'cannot': "can't",
        'will not': "won't",
        'is not': "isn't",
        'are not': "aren't",
        'was not': "wasn't",
        'were not': "weren't",
        'have not': "haven't",
        'has not': "hasn't",
        'had not': "hadn't",
        'do not': "don't",
        'does not': "doesn't",
        'did not': "didn't",
        'it is': "it's",
        'that is': "that's",
        'there is': "there's",
        'i am': "I'm",
        'you are': "you're",
        'we are': "we're",
        'they are': "they're",
        'i have': "I've",
        'i will': "I'll",
        'you will': "you'll",
    }

    expansions_map = {"can't": 'cannot', "won't": 'will not', "isn't": 'is not',
                      "aren't": 'are not', "don't": 'do not', "doesn't": 'does not',
                      "didn't": 'did not', "it's": 'it is', "I'm": 'I am',
                      "you're": 'you are', "we're": 'we are', "they're": 'they are'}

    if target_rate > current_rate and aggressiveness > 0.3:
        # add contractions — at high aggressiveness, apply nearly always
        prob = min(1.0, aggressiveness * 1.1)
        for phrase, contracted in contractions_map.items():
            if random.random() < prob:
                text = re.sub(r'\b' + re.escape(phrase) + r'\b',
                              contracted, text, flags=re.IGNORECASE)

    elif target_rate < current_rate and aggressiveness > 0.3:
        # expand contractions
        for contraction, expansion in expansions_map.items():
            if random.random() < aggressiveness * 0.2:
                text = re.sub(r'\b' + re.escape(contraction) + r'\b',
                            expansion, text, flags=re.IGNORECASE)

    return text


def _adjust_punctuation(text, current_fp, target_fp, aggressiveness):
    """Inject characteristic punctuation toward target rates."""
    target_tics = target_fp['punctuation_tics']

    # Ellipses
    if target_tics.get('ellipsis', 0) > 2 and aggressiveness > 0.4:
        sentences = _get_sentences(text)
        for i, s in enumerate(sentences):
            if random.random() < aggressiveness * 0.4 and not s.endswith('...'):
                s = s.rstrip('.!?') + '...'
                sentences[i] = s
        text = ' '.join(sentences)

    # Em dashes
    if target_tics.get('em_dash', 0) > 1 and aggressiveness > 0.5:
        # replace some commas or periods with em dashes
        if random.random() < aggressiveness * 0.1:
            text = re.sub(r',\s+', ' — ', text, count=2)

    # Exclamation marks
    if target_tics.get('exclamation', 0) > 2 and aggressiveness > 0.5:
        sentences = _get_sentences(text)
        for i, s in enumerate(sentences):
            if s.endswith('.') and random.random() < aggressiveness * 0.1:
                sentences[i] = s[:-1] + '!'
        text = ' '.join(sentences)

    return text


def _adjust_fillers(text, current_fp, target_fp, aggressiveness):
    """Inject filler words toward target rate."""
    current_rate = current_fp['filler_rate']
    target_rate = target_fp['filler_rate']

    if abs(current_rate - target_rate) < 0.5:
        return text

    fillers = ['like', 'basically', 'honestly', 'literally', 'you know', 'kinda', 'just', 'really']

    if target_rate > current_rate and aggressiveness > 0.4:
        sentences = _get_sentences(text)
        for i, s in enumerate(sentences):
            if random.random() < aggressiveness * 0.15:
                filler = random.choice(fillers)
                # insert filler at start of sentence
                sentences[i] = filler + ', ' + s
        text = ' '.join(sentences)

    return text


def _adjust_capitalization(text, current_fp, target_fp, aggressiveness):
    """Adjust capitalization of sentence starts."""
    current_cap = current_fp['capitalization_score']
    target_cap = target_fp['capitalization_score']

    if abs(current_cap - target_cap) < 0.1:
        return text

    sentences = _get_sentences(text)

    if target_cap < 0.7 and aggressiveness > 0.5:
        # lowercase some sentence starts (scale toward target proportion)
        lower_prob = (1 - target_cap) * aggressiveness
        for i, s in enumerate(sentences):
            if s and s[0].isupper() and random.random() < lower_prob:
                sentences[i] = s[0].lower() + s[1:]

    elif target_cap > 0.95 and aggressiveness > 0.5:
        # capitalize sentence starts
        for i, s in enumerate(sentences):
            if s and s[0].islower():
                sentences[i] = s[0].upper() + s[1:]

    return ' '.join(sentences)


def _adjust_vocabulary(text, current_fp, target_fp, aggressiveness):
    """Light vocab substitution toward target rarity."""
    current_rarity = current_fp['vocab_rarity']
    target_rarity = target_fp['vocab_rarity']

    if abs(current_rarity - target_rarity) < 0.05:
        return text

    words = word_tokenize(text)
    modified_words = []

    for word in words:
        if not word.isalpha():
            modified_words.append(word)
            continue

        # small chance to try synonym substitution
        if random.random() < aggressiveness * 0.05:
            synsets = wordnet.synsets(word)
            if synsets:
                # pick a random synonym
                lemmas = [l.name() for ss in synsets for l in ss.lemmas()]
                if lemmas and lemmas != [word]:
                    modified_words.append(random.choice(lemmas).replace('_', ' '))
                else:
                    modified_words.append(word)
            else:
                modified_words.append(word)
        else:
            modified_words.append(word)

    return ' '.join(modified_words)
