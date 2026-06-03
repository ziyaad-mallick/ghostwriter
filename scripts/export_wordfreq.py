"""
Export a trimmed English word-frequency table from the `wordfreq` package
to a compact JSON the browser build loads for vocab_rarity scoring.

This keeps the static JS site in parity with the Python reference
implementation (ghostwriter/fingerprint.py vocab_rarity), which uses
wordfreq.zipf_frequency(word, 'en').

Run:  python scripts/export_wordfreq.py
Out:  docs/data/wordfreq_en.json   -> { "word": zipf_rounded, ... }

Words not present in this table are treated as maximally rare by the JS,
which matches the intent (rare/unknown vocabulary -> high rarity).
"""

import json
import os
from wordfreq import top_n_list, zipf_frequency

TOP_N = 30000
ROUND = 2  # zipf to 2 decimals keeps file small with negligible accuracy loss

out_dir = os.path.join(os.path.dirname(__file__), "..", "docs", "data")
os.makedirs(out_dir, exist_ok=True)
out_path = os.path.join(out_dir, "wordfreq_en.json")

table = {}
for word in top_n_list("en", TOP_N):
    # keep alphabetic tokens only — matches content-word filtering in JS
    if word.isalpha():
        table[word] = round(zipf_frequency(word, "en"), ROUND)

with open(out_path, "w", encoding="utf-8") as f:
    json.dump(table, f, ensure_ascii=False, separators=(",", ":"))

print(f"Wrote {len(table)} words -> {os.path.relpath(out_path)}")
print(f"File size: {os.path.getsize(out_path) / 1024:.0f} KB")
