#!/usr/bin/env python3
"""Regenerates src/speech/manifest.generated.json from Hugging Face file listings.

Each pack lists {path, url, size}. `path` is relative to the pack directory and is
the name nitro-voice expects (encoder.onnx, model.onnx, tokens.txt, ...), not the
upstream name, so the app downloads file-by-file with a rename and never needs an
archive extractor. Sizes double as the integrity check after download.

Run:  python3 scripts/gen_model_manifest.py
"""
import json
import pathlib
import sys
import urllib.parse
import urllib.request

HF = "https://huggingface.co"
OUT = pathlib.Path(__file__).resolve().parent.parent / "src/speech/manifest.generated.json"


def tree(repo: str) -> dict[str, int]:
    url = f"{HF}/api/models/{repo}/tree/main?recursive=true"
    with urllib.request.urlopen(url, timeout=30) as r:
        return {x["path"]: x["size"] for x in json.load(r) if x["type"] == "file"}


def entry(repo: str, upstream: str, dest: str, sizes: dict[str, int]) -> dict:
    return {"path": dest, "url": f"{HF}/{repo}/resolve/main/{urllib.parse.quote(upstream, safe='/')}", "size": sizes[upstream]}


# the speech model is converted by scripts/build_stt_model.py and published as a release of this repo
STT_RELEASE = "https://github.com/Jivit87/Vaani/releases/download/models-v1"
STT_FILES = {"encoder.onnx": 29104816, "decoder.onnx": 130659024, "tokens.txt": 816730}


def pack_stt() -> dict:
    return {
        "id": "hinglish-swift-int8",
        "files": [{"path": n, "url": f"{STT_RELEASE}/{n}", "size": size} for n, size in STT_FILES.items()],
    }


def pack_piper_hi(repo="csukuangfj/vits-piper-hi_IN-pratham-medium") -> dict:
    s = tree(repo)
    files = [
        entry(repo, "hi_IN-pratham-medium.onnx", "model.onnx", s),
        entry(repo, "tokens.txt", "tokens.txt", s),
    ]
    files += [entry(repo, p, p, s) for p in sorted(s) if p.startswith("espeak-ng-data/")]
    return {"id": "piper-hi-pratham-medium", "files": files}


def pack_piper_en(repo="csukuangfj/vits-piper-en_US-amy-medium") -> dict:
    s = tree(repo)
    files = [
        entry(repo, "en_US-amy-medium.onnx", "model.onnx", s),
        entry(repo, "tokens.txt", "tokens.txt", s),
    ]
    files += [entry(repo, p, p, s) for p in sorted(s) if p.startswith("espeak-ng-data/")]
    return {"id": "piper-en-amy-medium", "files": files}


def pack_vad() -> dict:
    url = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx"
    req = urllib.request.Request(url, method="HEAD")
    with urllib.request.urlopen(req, timeout=30) as r:
        size = int(r.headers["Content-Length"])
    return {"id": "silero-vad", "files": [{"path": "silero_vad.onnx", "url": url, "size": size}]}


def main() -> int:
    packs = [pack_stt(), pack_piper_hi(), pack_piper_en(), pack_vad()]
    OUT.write_text(json.dumps({"packs": packs}, indent=1, ensure_ascii=False) + "\n")
    for p in packs:
        total = sum(f["size"] for f in p["files"])
        print(f'{p["id"]}: {len(p["files"])} files, {total / 1e6:.0f} MB')
    return 0


if __name__ == "__main__":
    sys.exit(main())
