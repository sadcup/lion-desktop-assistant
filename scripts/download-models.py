"""Fetch the exact checkpoints used by the desktop assistant."""
import argparse
import hashlib
from pathlib import Path

from huggingface_hub import hf_hub_download, snapshot_download

ROOT = Path(__file__).resolve().parents[1]
BOLT = "Nemotron-3.5-Bolt-E4B-Q4_K_M.gguf"
BOLT_REVISION = "1db54d5b12533ff1bcaa8e42cf4c667988a1f1be"
OMNI_REVISION = "21d75123f86c1f7ffb4bef1ea202710c4e7ebe67"


def check(file, digest):
    with file.open("rb") as stream:
        actual = hashlib.file_digest(stream, "sha256").hexdigest()
    if actual != digest:
        raise RuntimeError(f"SHA-256 mismatch: {file}")
    print(f"Verified {file.relative_to(ROOT)}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("model", choices=["bolt", "omni", "all"], default="all", nargs="?")
    args = parser.parse_args()
    if args.model in {"bolt", "all"}:
        file = hf_hub_download(
            "nvidia/NVIDIA-Nemotron-3.5-Bolt-E4B-4GB", BOLT,
            revision=BOLT_REVISION, local_dir=ROOT / "models/bolt",
        )
        check(Path(file), "c8af2b8aea10a690a1d9491db744a9446660173cb38fc489612b556615a69612")
    if args.model in {"omni", "all"}:
        path = Path(snapshot_download(
            "LiquidAI/LFM3-Omni-2B", revision=OMNI_REVISION,
            local_dir=ROOT / "models/omni", ignore_patterns=["assets/*"],
        ))
        for file, digest in {
            "model.safetensors":"76c0ec2c3e27832fb19f886d5eb0afe37f03c5c32c4a796a7ce08cef119d2763",
            "audio_tokenizer/model.safetensors":"45984a872fdcf0b94cd0ec68822bbf26f0c6fcb580cfaba0f7fa3ee60355137f",
            "tokenizer.json":"41927bd314d17d7d7fadb44e10cd0919f7b71528d7741596d8cbd15c6945ec44",
        }.items():
            check(path / file, digest)


if __name__ == "__main__":
    main()
