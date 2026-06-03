"""
Ghostwriter: local-only writing style analyzer and rewriter.
Flask web app.
"""

import os
import sys
import json
from flask import Flask, render_template, request, jsonify, redirect, url_for

# Ensure NLTK data is downloaded on first run
try:
    from nltk.data import find
except LookupError:
    pass

import nltk
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt')

try:
    nltk.data.find('corpora/wordnet')
except LookupError:
    nltk.download('wordnet')

try:
    nltk.data.find('corpora/stopwords')
except LookupError:
    nltk.download('stopwords')

from ghostwriter.fingerprint import compute_fingerprint, merge_fingerprints
from ghostwriter.scorer import score_text
from ghostwriter.rewriter import rewrite_text
from ghostwriter.storage import (
    list_profiles, load_profile, save_profile, delete_profile, profile_exists
)


app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024  # 10MB max upload


@app.route('/')
def index():
    """Redirect to training page."""
    return redirect(url_for('train'))


@app.route('/train', methods=['GET', 'POST'])
def train():
    """Train a profile by pasting samples."""
    if request.method == 'POST':
        profile_name = request.form.get('profile_name', '').strip()
        sample_text = request.form.get('sample_text', '').strip()

        if not profile_name or not sample_text:
            return render_template('train.html', error='Profile name and sample text required.')

        # Compute fingerprint
        try:
            fingerprint = compute_fingerprint(sample_text)

            # If profile exists, merge with existing
            if profile_exists(profile_name):
                existing = load_profile(profile_name)
                fingerprint = merge_fingerprints([existing, fingerprint])

            save_profile(profile_name, fingerprint)
            return render_template('train.html',
                                 success=f'Profile "{profile_name}" updated!',
                                 fingerprint=fingerprint)
        except Exception as e:
            return render_template('train.html', error=f'Error: {str(e)}')

    return render_template('train.html')


@app.route('/score', methods=['GET', 'POST'])
def score():
    """Score a text against a profile."""
    profiles = list_profiles()

    if request.method == 'POST':
        profile_name = request.form.get('profile_name', '').strip()
        input_text = request.form.get('input_text', '').strip()

        if not profile_name or not input_text:
            return render_template('score.html', profiles=profiles,
                                 error='Profile and text required.')

        try:
            fingerprint = load_profile(profile_name)
            if not fingerprint:
                return render_template('score.html', profiles=profiles,
                                     error=f'Profile "{profile_name}" not found.')

            result = score_text(input_text, fingerprint)

            # Prepare data for radar chart
            chart_data = {
                'labels': [
                    'Sentence Length',
                    'Length Variance',
                    'Vocab Rarity',
                    'Punctuation',
                    'Fillers',
                    'Contractions',
                    'Paragraph',
                    'Capitalization'
                ],
                'data': [
                    result['per_dimension']['avg_sentence_length'][0],
                    result['per_dimension']['sentence_length_variance'][0],
                    result['per_dimension']['vocab_rarity'][0],
                    result['per_dimension']['punctuation_tics'][0],
                    result['per_dimension']['filler_rate'][0],
                    result['per_dimension']['contraction_rate'][0],
                    result['per_dimension']['paragraph_rhythm'][0],
                    result['per_dimension']['capitalization_score'][0],
                ]
            }

            return render_template('score.html', profiles=profiles,
                                 profile_name=profile_name,
                                 overall_score=int(result['overall_score']),
                                 divergences=result['divergences'],
                                 chart_data=json.dumps(chart_data))
        except Exception as e:
            return render_template('score.html', profiles=profiles,
                                 error=f'Error: {str(e)}')

    return render_template('score.html', profiles=profiles)


@app.route('/rewrite', methods=['GET', 'POST'])
def rewrite():
    """Rewrite text toward a profile."""
    profiles = list_profiles()

    if request.method == 'POST':
        profile_name = request.form.get('profile_name', '').strip()
        input_text = request.form.get('input_text', '').strip()
        aggressiveness = request.form.get('aggressiveness', '50')

        if not profile_name or not input_text:
            return render_template('rewrite.html', profiles=profiles,
                                 error='Profile and text required.')

        try:
            aggressiveness_float = float(aggressiveness) / 100.0
            aggressiveness_float = max(0, min(1, aggressiveness_float))

            fingerprint = load_profile(profile_name)
            if not fingerprint:
                return render_template('rewrite.html', profiles=profiles,
                                     error=f'Profile "{profile_name}" not found.')

            rewritten = rewrite_text(input_text, fingerprint, aggressiveness_float)

            return render_template('rewrite.html', profiles=profiles,
                                 profile_name=profile_name,
                                 aggressiveness=aggressiveness,
                                 original_text=input_text,
                                 rewritten_text=rewritten)
        except Exception as e:
            return render_template('rewrite.html', profiles=profiles,
                                 error=f'Error: {str(e)}')

    return render_template('rewrite.html', profiles=profiles)


@app.route('/profile', methods=['GET', 'POST', 'DELETE'])
def profile():
    """List, view, and delete profiles."""
    profiles = list_profiles()
    selected_profile = None
    selected_fingerprint = None

    if request.method == 'POST':
        action = request.form.get('action')
        profile_name = request.form.get('profile_name', '').strip()

        if action == 'delete' and profile_name:
            if delete_profile(profile_name):
                return redirect(url_for('profile'))

    if request.args.get('profile'):
        profile_name = request.args.get('profile')
        selected_fingerprint = load_profile(profile_name)
        if selected_fingerprint:
            selected_profile = profile_name

    return render_template('profile.html', profiles=profiles,
                         selected_profile=selected_profile,
                         selected_fingerprint=selected_fingerprint)


@app.errorhandler(404)
def not_found(e):
    """404 handler."""
    return render_template('base.html'), 404


@app.errorhandler(500)
def server_error(e):
    """500 handler."""
    return render_template('base.html'), 500


if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)
