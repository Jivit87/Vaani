#!/usr/bin/env python3
"""WER / CER / real-time factor per model from the JSON the app's Benchmark screen exports.

    pip install jiwer
    python3 benchmarks/run_wer.py benchmark_results.json benchmarks/test_sentences.tsv

test_sentences.tsv columns (tab separated, header required): file<TAB>language<TAB>reference
`file` must match the recording name the app reported (e.g. en_01.wav).
Hinglish references should use ONE script (Roman is easiest). Both sides are normalised the same way.
"""
import json
import re
import statistics
import sys
import unicodedata
from collections import defaultdict


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).lower()
    text = re.sub(r"[^\w\s]", " ", text)  # strip punctuation (devanagari letters stay)
    # a few common hinglish spelling variants, add more if your test set needs them
    for a, b in {"kl": "kal", "bje": "baje", "bajey": "baje"}.items():
        text = re.sub(rf"\b{a}\b", b, text)
    return re.sub(r"\s+", " ", text).strip()


def load_refs(path: str) -> dict[str, str]:
    refs = {}
    with open(path, encoding="utf-8") as f:
        header = f.readline().rstrip("\n").split("\t")
        if header[:3] != ["file", "language", "reference"]:
            sys.exit(f"{path}: first line must be 'file<TAB>language<TAB>reference'")
        for line in f:
            if line.strip():
                name, _lang, ref = line.rstrip("\n").split("\t", 2)
                refs[name] = ref
    return refs


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__)
        return 2
    try:
        import jiwer
    except ImportError:
        print("jiwer is required: pip install jiwer", file=sys.stderr)
        return 2

    data = json.load(open(argv[1], encoding="utf-8"))
    refs = load_refs(argv[2])
    groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
    missing = set()
    for row in data["rows"]:
        if row["file"] not in refs:
            missing.add(row["file"])
            continue
        groups[(row["model"], row["language"])].append(row)
    if missing:
        print(f"warning: no reference for {sorted(missing)}", file=sys.stderr)

    print("| Model | Lang | Files | WER | CER | Median decode (ms) | Median RTF |")
    print("|---|---|---|---|---|---|---|")
    for (model, lang), rows in sorted(groups.items()):
        r = [normalize(refs[x["file"]]) for x in rows]
        h = [normalize(x["hyp"]) for x in rows]
        wer = jiwer.wer(r, h)
        cer = jiwer.cer(r, h)
        rtf = [x["decode_ms"] / x["audio_ms"] for x in rows if x["audio_ms"] > 0]
        med_ms = statistics.median(x["decode_ms"] for x in rows)
        print(f"| {model} | {lang} | {len(rows)} | {wer:.1%} | {cer:.1%} | {med_ms:.0f} | {statistics.median(rtf):.2f} |")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
