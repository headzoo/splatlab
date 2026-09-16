#!/usr/bin/env python3
"""Encode Splat Lab! parallax backgrounds into the runtime WebP the games load.

The authored PNGs are the masters and stay checked in: `background-specs` and the
Game Editor both reference them by their `.png` path. They are, however, far too
heavy to ship. Thirteen 2172x724 PNGs total 22.6 MB, and a platformer level used
to download every one of them before it could draw a frame.

WebP carries the same pixels at a fraction of the size, unevenly: the noisy ash
and glacier skies collapse by more than 20x while the already-small Space plates
barely move. So each master is encoded, measured, and only kept when it actually
pays for itself.

The encoder is fail-closed. A background whose lossy output is not clearly
smaller than lossless is written lossless instead, and anything that is not a
recognised background plate stops the run rather than being guessed at.
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

from PIL import Image


REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_BACKGROUND_DIR = REPO_ROOT / "backgrounds"

# Every authored plate is drawn at this size; the runtime repeats it on X and
# scales it to the viewport height. A different size means the art was not
# produced by the documented background recipe.
EXPECTED_SIZE = (2172, 724)

# Quality 95 was chosen by measuring the whole set: it holds the gradients and
# hard silhouette edges that these plates lean on while still averaging a 7x
# reduction. Lower settings visibly ring along the Green Hills castle edges.
DEFAULT_QUALITY = 95

# Below this ratio the lossy encode is not buying enough to justify throwing
# pixels away, so the lossless encode is kept instead.
MIN_LOSSY_ADVANTAGE = 1.15


class BackgroundError(RuntimeError):
    """A background could not be encoded safely."""


@dataclass
class EncodeResult:
    path: Path
    master_bytes: int
    runtime_bytes: int
    lossless: bool

    @property
    def ratio(self) -> float:
        return self.master_bytes / self.runtime_bytes


def repo_path(value: str) -> Path:
    path = Path(value)
    if not path.is_absolute():
        path = REPO_ROOT / path
    resolved = path.resolve()
    try:
        resolved.relative_to(REPO_ROOT)
    except ValueError as exc:
        raise BackgroundError(f"Path must stay inside the project: {value}") from exc
    return resolved


def discover_masters(paths: Sequence[str], background_dir: Path) -> list[Path]:
    if paths:
        masters = [repo_path(value) for value in paths]
    else:
        masters = sorted(background_dir.glob("background_*.png"))
    if not masters:
        raise BackgroundError(f"No background masters found in {background_dir}")
    for master in masters:
        if master.suffix != ".png":
            raise BackgroundError(f"{master.name}: expected a .png master")
        if not master.is_file():
            raise BackgroundError(f"{master.name}: master is missing")
    return masters


def encoded_bytes(image: Image.Image, **options: object) -> bytes:
    from io import BytesIO

    buffer = BytesIO()
    image.save(buffer, format="WEBP", method=6, **options)
    return buffer.getvalue()


def encode_master(master: Path, quality: int) -> tuple[bytes, bool]:
    """Return the runtime bytes for one master, and whether they are lossless."""
    with Image.open(master) as opened:
        if opened.size != EXPECTED_SIZE:
            raise BackgroundError(
                f"{master.name}: expected {EXPECTED_SIZE[0]}x{EXPECTED_SIZE[1]}, "
                f"found {opened.size[0]}x{opened.size[1]}. Backgrounds are "
                "repeated on X and scaled to the viewport height, so an "
                "unexpected plate size is a recipe problem, not something to "
                "resize past."
            )
        image = opened.convert("RGBA")

    lossless = encoded_bytes(image, lossless=True)
    lossy = encoded_bytes(image, quality=quality)

    # Keeping the lossless bytes whenever lossy barely helps means the flat
    # Space plates never pay a quality cost for nothing.
    if len(lossless) / len(lossy) < MIN_LOSSY_ADVANTAGE:
        return lossless, True
    return lossy, False


def encode_all(
    masters: Sequence[Path],
    quality: int,
    *,
    write: bool,
) -> list[EncodeResult]:
    results: list[EncodeResult] = []
    for master in masters:
        runtime_bytes, lossless = encode_master(master, quality)
        master_bytes = master.stat().st_size
        if len(runtime_bytes) >= master_bytes:
            raise BackgroundError(
                f"{master.name}: WebP ({len(runtime_bytes)} bytes) is not "
                f"smaller than the PNG master ({master_bytes} bytes)"
            )
        runtime_path = master.with_suffix(".webp")
        if write:
            runtime_path.write_bytes(runtime_bytes)
        results.append(
            EncodeResult(
                path=runtime_path,
                master_bytes=master_bytes,
                runtime_bytes=len(runtime_bytes),
                lossless=lossless,
            )
        )
    return results


def report(results: Sequence[EncodeResult]) -> None:
    master_total = sum(result.master_bytes for result in results)
    runtime_total = sum(result.runtime_bytes for result in results)
    width = max(len(result.path.name) for result in results)
    for result in results:
        mode = "lossless" if result.lossless else "lossy"
        print(
            f"{result.path.name:<{width}}  "
            f"{result.master_bytes / 1024:8.0f} KB -> "
            f"{result.runtime_bytes / 1024:7.0f} KB  "
            f"{result.ratio:5.1f}x  {mode}"
        )
    print(
        f"\n{len(results)} backgrounds: "
        f"{master_total / 1048576:.1f} MB -> {runtime_total / 1048576:.1f} MB "
        f"({master_total / runtime_total:.1f}x)"
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "masters",
        nargs="*",
        help="background PNG masters to encode; defaults to every plate",
    )
    parser.add_argument(
        "--quality",
        type=int,
        default=DEFAULT_QUALITY,
        help=f"lossy WebP quality (default {DEFAULT_QUALITY})",
    )
    parser.add_argument(
        "--background-dir",
        default=str(DEFAULT_BACKGROUND_DIR.relative_to(REPO_ROOT)),
        help="directory holding the background masters",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="report what would be written without touching any file",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if not 1 <= args.quality <= 100:
            raise BackgroundError("--quality must be between 1 and 100")
        background_dir = repo_path(args.background_dir)
        masters = discover_masters(args.masters, background_dir)
        results = encode_all(masters, args.quality, write=not args.check)
        report(results)
        if args.check:
            print("\n--check: nothing was written")
    except BackgroundError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
