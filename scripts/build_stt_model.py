#!/usr/bin/env python3
"""Builds the speech-recognition model the app uses, in the sherpa-onnx format.

Why: stock Whisper-small got about 80% of the words wrong on Hindi speech (docs/DECISIONS.md D28). Oriserve's
Whisper-Hindi2Hinglish-Swift (Apache-2.0, the size of Whisper-base) writes Hindi speech as Roman Hinglish and is
close to right, but it ships in HuggingFace format. This converts it:
  1. HuggingFace weights -> OpenAI-whisper checkpoint (renaming tensors, checked by loading it strictly)
  2. OpenAI checkpoint -> sherpa-onnx encoder/decoder, int8 (sherpa-onnx's own export script, patched to load it)

Needs python 3.11 with: torch transformers safetensors openai-whisper onnx onnxruntime onnxscript
Run:  python3.11 scripts/build_stt_model.py <output dir>
Output: encoder.onnx, decoder.onnx (int8) and tokens.txt, ready to upload and list in gen_model_manifest.py
"""
import json
import os
import shutil
import subprocess
import sys
import urllib.request

REPO = "Oriserve/Whisper-Hindi2Hinglish-Swift"
EXPORT_URL = "https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/master/scripts/whisper/export-onnx.py"
NAME = "hinglish-swift"


def fetch(url: str, dest: str) -> None:
    if not os.path.exists(dest):
        urllib.request.urlretrieve(url, dest)


def hf_to_openai(work: str) -> None:
    import torch
    import whisper
    from safetensors.torch import load_file

    cfg = json.load(open(f"{work}/config.json"))
    out = {}
    for key, value in load_file(f"{work}/model.safetensors").items():
        n = key.removeprefix("model.")
        if n.startswith("proj_out"):  # tied to the token embedding
            continue
        for old, new in [
            ("encoder.layers.", "encoder.blocks."), ("decoder.layers.", "decoder.blocks."),
            (".self_attn.q_proj", ".attn.query"), (".self_attn.k_proj", ".attn.key"),
            (".self_attn.v_proj", ".attn.value"), (".self_attn.out_proj", ".attn.out"),
            (".self_attn_layer_norm", ".attn_ln"),
            (".encoder_attn.q_proj", ".cross_attn.query"), (".encoder_attn.k_proj", ".cross_attn.key"),
            (".encoder_attn.v_proj", ".cross_attn.value"), (".encoder_attn.out_proj", ".cross_attn.out"),
            (".encoder_attn_layer_norm", ".cross_attn_ln"),
            (".fc1", ".mlp.0"), (".fc2", ".mlp.2"), (".final_layer_norm", ".mlp_ln"),
            ("encoder.layer_norm", "encoder.ln_post"), ("decoder.layer_norm", "decoder.ln"),
            ("encoder.embed_positions.weight", "encoder.positional_embedding"),
            ("decoder.embed_positions.weight", "decoder.positional_embedding"),
            ("decoder.embed_tokens", "decoder.token_embedding"),
        ]:
            n = n.replace(old, new)
        out[n] = value
    dims = dict(
        n_mels=cfg["num_mel_bins"], n_audio_ctx=cfg["max_source_positions"], n_audio_state=cfg["d_model"],
        n_audio_head=cfg["encoder_attention_heads"], n_audio_layer=cfg["encoder_layers"], n_vocab=cfg["vocab_size"],
        n_text_ctx=cfg["max_target_positions"], n_text_state=cfg["d_model"],
        n_text_head=cfg["decoder_attention_heads"], n_text_layer=cfg["decoder_layers"],
    )
    torch.save({"dims": dims, "model_state_dict": out}, f"{work}/model-openai.pt")
    whisper.load_model(f"{work}/model-openai.pt", device="cpu")  # strict load: fails on any missing/extra tensor


def patch_export_script(work: str) -> None:
    src = open(f"{work}/export-onnx.py").read()
    src = src.replace('"medium-aishell",\n            ],', f'"medium-aishell",\n            "{NAME}",\n            ],')
    src = src.replace(
        '    if name == "distil-medium.en":',
        f'    if name == "{NAME}":\n        return whisper.load_model("./model-openai.pt", device="cpu")\n    if name == "distil-medium.en":',
        1,
    )
    # torch >= 2.9 defaults to the dynamo exporter, whose decoder graph sherpa-onnx cannot run: use the legacy one
    out, i = [], 0
    while (j := src.find("torch.onnx.export(", i)) >= 0:
        out.append(src[i:j])
        k, depth = j + len("torch.onnx.export("), 1
        while depth:
            depth += (src[k] == "(") - (src[k] == ")")
            k += 1
        call = src[j : k - 1].rstrip().rstrip(",")
        out.append(call + ",\n        dynamo=False,\n    )")
        i = k
    out.append(src[i:])
    open(f"{work}/export-onnx.py", "w").write("".join(out))


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    dest = os.path.abspath(sys.argv[1])
    work = os.path.join(dest, "work")
    os.makedirs(work, exist_ok=True)
    for f in ("model.safetensors", "config.json"):
        fetch(f"https://huggingface.co/{REPO}/resolve/main/{f}", f"{work}/{f}")
    fetch(EXPORT_URL, f"{work}/export-onnx.py")
    hf_to_openai(work)
    patch_export_script(work)
    subprocess.run([sys.executable, "export-onnx.py", "--model", NAME], cwd=work, check=True)
    shutil.copy(f"{work}/{NAME}-encoder.int8.onnx", f"{dest}/encoder.onnx")
    shutil.copy(f"{work}/{NAME}-decoder.int8.onnx", f"{dest}/decoder.onnx")
    shutil.copy(f"{work}/{NAME}-tokens.txt", f"{dest}/tokens.txt")
    for f in ("encoder.onnx", "decoder.onnx", "tokens.txt"):
        print(f, os.path.getsize(f"{dest}/{f}"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
