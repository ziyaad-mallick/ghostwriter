# Ghostwriter

**Ghostwriter** is a 100% local, no-login web app that learns your writing style and helps you evaluate and rewrite text to match it.

## Live / Hosted (Static Web App)

**Zero setup required!** A fully static version is available in the `docs/` directory and hosted via GitHub Pages.

- **URL:** Visit the live version at your GitHub Pages site (or run locally: see below)
- **No backend:** Everything runs 100% in your browser
- **No server upload:** Your writing samples never leave your device — stored only in localStorage
- **No dependencies:** Pure HTML, CSS, and JavaScript (+ Chart.js for visualization)

To run locally:
```bash
cd docs/
python -m http.server 8123
# Visit http://localhost:8123 in your browser
```

Or open `docs/index.html` directly in your browser (modern browsers support ES modules over `file://` in some cases; a local server is safer).

The static version includes:
- All 4 core pages: Train, Score, Rewrite, Profiles
- Same dark violet theme and UI as the Python version
- Full fingerprinting, scoring, and rewriting (deterministic — same input always gives same output)
- localStorage-based profile storage (per-browser, private)
- Pre-computed English vocabulary frequency data (`docs/data/wordfreq_en.json`)

### Limitations vs. Python Version
- **No vocabulary substitution:** WordNet (WordNet) is not available in the browser. The rewriter omits this transform; all other 5 transforms (sentence splits/merges, contractions, punctuation, fillers, capitalization) are fully ported.
- **No multi-language support:** Currently English only.

---

## What It Does

1. **Train** — Paste writing samples to build a "fingerprint" of your style
2. **Score** — Check how much any text sounds like you (0-100 match score)
3. **Rewrite** — Transform AI-generated or other text to match your style (with aggressiveness slider)
4. **Profiles** — Manage multiple writing profiles (e.g., essays, casual, professional)

## Key Features

- **No cloud, no APIs, no login** — Everything runs locally on your machine
- **Pure statistical NLP** — Uses nltk and wordfreq for style analysis
- **Fast and lightweight** — Flat JSON file storage, minimal dependencies
- **Deterministic** — Same input always produces the same output
- **Beautiful UI** — Dark modern theme with electric violet accents

## The Science: 7 Style Dimensions

Each writing sample is analyzed across:

1. **Sentence Length** — Average words per sentence + variance
2. **Vocabulary Rarity** — How uncommon/sophisticated your words are
3. **Punctuation Tics** — Your use of ellipses, dashes, exclamation marks, commas, semicolons
4. **Filler Words** — Frequency of "like," "basically," "honestly," etc.
5. **Contractions** — How often you use "don't," "I'm," etc.
6. **Paragraph Rhythm** — Average sentences per paragraph
7. **Capitalization** — Whether you consistently capitalize sentence starts

The "You Score" is a 0-100 match on all dimensions combined. The app also shows which dimensions diverge most from your style.

## Installation

### Requirements
- Python 3.11+
- pip

### Setup

```bash
# Clone or cd into the ghostwriter directory
cd ghostwriter

# Create a virtual environment (optional but recommended)
python -m venv .venv
source .venv/bin/activate  # on Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# First run: nltk data is auto-downloaded
python app.py
```

The app will automatically download required NLTK data (punkt, wordnet, stopwords) on first run.

Visit `http://localhost:5000` in your browser.

## Usage

### Train a Profile
1. Go to `/train`
2. Enter a profile name (e.g., "Personal", "Essays")
3. Paste a writing sample (500+ words recommended)
4. Submit — your fingerprint is computed and saved

Multiple samples for the same profile are merged together, strengthening the fingerprint.

### Score Text
1. Go to `/score`
2. Select a profile
3. Paste text you want to score
4. See:
   - **You Score**: 0-100 match percentage
   - **Radar chart**: Breakdown by dimension
   - **Key Differences**: Which dimensions diverge most

### Rewrite Text
1. Go to `/rewrite`
2. Select a profile
3. Paste text (e.g., AI-generated content)
4. Adjust the aggressiveness slider (0% = minimal change, 100% = maximum)
5. See original and rewritten versions side-by-side

Rewriting is deterministic and statistically sound: it adjusts sentence structure, injects contractions/fillers, tweaks punctuation, etc. to match your style.

### Manage Profiles
1. Go to `/profiles`
2. View saved profiles and their detailed fingerprints
3. Delete profiles you no longer need

Profiles are stored as JSON in the `profiles/` directory.

## How It Works

### Fingerprinting (fingerprint.py)
Extracts numeric features from text using:
- **NLTK** for tokenization (sentences, words, stopwords)
- **wordfreq** for vocabulary rarity (Zipf frequency scoring)
- Regex for punctuation and capitalization analysis

### Scoring (scorer.py)
Compares input text's fingerprint to a target fingerprint:
- Computes normalized distance for each dimension
- Averages distances → 0-100 overall score
- Reports key divergences in human-readable language

### Rewriting (rewriter.py)
Deterministically transforms text toward a target fingerprint:
- Splits/merges sentences (toward target avg length)
- Injects/removes contractions
- Adds characteristic punctuation
- Inserts filler words
- Adjusts capitalization
- Light vocabulary substitution (WordNet synonyms)

All transforms respect the aggressiveness parameter: higher = more aggressive.

### Storage (storage.py)
Simple flat-file JSON storage in `profiles/` directory. No database needed.

## Architecture

```
ghostwriter/
├── app.py                  # Flask routes
├── ghostwriter/
│   ├── fingerprint.py     # Style feature extraction
│   ├── scorer.py          # Text scoring
│   ├── rewriter.py        # Text transformation
│   └── storage.py         # JSON persistence
├── templates/             # Jinja HTML
├── static/                # CSS + JS
├── profiles/              # JSON profile storage
└── requirements.txt
```

## Dependencies

- **Flask** — Web framework
- **nltk** — Natural language processing (tokenization, WordNet)
- **wordfreq** — Vocabulary frequency scoring (Zipf)

All are pure Python and work offline.

## Limitations & Notes

- Fingerprints are most accurate with 500+ words of input
- Rewriting doesn't understand semantic meaning; it's purely statistical
- Works best on English text (language-specific in wordfreq, NLTK)
- Very long texts may take a few seconds to analyze

## Future Ideas

- Multi-language support
- Export profiles as shareable JSON
- Batch scoring from file uploads
- Style transfer between profiles
- Voice/audio analysis

## License

MIT

## Author

Built with Python, NLTK, and a love for good writing.

---

**Ghostwriter: Know your voice. Own your style.**
