#!/usr/bin/env python3
"""Restore alpha behind generated sprites with a neutral checker backdrop.

The operation is deliberately conservative: it only removes low-chroma,
light pixels connected to the canvas border. White artwork enclosed by the
sprite outline is therefore preserved.
"""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--minimum-channel", type=int, default=180)
    parser.add_argument("--maximum-spread", type=int, default=12)
    parser.add_argument(
        "--minimum-component-area",
        type=int,
        default=0,
        help="Remove disconnected foreground components smaller than this many pixels.",
    )
    return parser.parse_args()


def is_background(pixel: tuple[int, int, int], minimum: int, spread: int) -> bool:
    return min(pixel) >= minimum and max(pixel) - min(pixel) <= spread


def remove_small_components(alpha: Image.Image, minimum_area: int) -> int:
    if minimum_area <= 1:
        return 0
    width, height = alpha.size
    pixels = alpha.load()
    visited = bytearray(width * height)
    removed = 0

    for start in range(width * height):
        if visited[start]:
            continue
        start_y, start_x = divmod(start, width)
        if pixels[start_x, start_y] == 0:
            visited[start] = 1
            continue
        component = [start]
        queue: deque[int] = deque([start])
        visited[start] = 1
        while queue:
            index = queue.popleft()
            y, x = divmod(index, width)
            for next_y in range(max(0, y - 1), min(height, y + 2)):
                row_start = next_y * width
                for next_x in range(max(0, x - 1), min(width, x + 2)):
                    next_index = row_start + next_x
                    if visited[next_index] or pixels[next_x, next_y] == 0:
                        continue
                    visited[next_index] = 1
                    component.append(next_index)
                    queue.append(next_index)
        if len(component) >= minimum_area:
            continue
        for index in component:
            y, x = divmod(index, width)
            pixels[x, y] = 0
        removed += len(component)
    return removed


def main() -> int:
    args = parse_args()
    source = Image.open(args.source).convert("RGB")
    width, height = source.size
    pixels = source.load()
    visited = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def enqueue(x: int, y: int) -> None:
        index = y * width + x
        if visited[index] or not is_background(
            pixels[x, y], args.minimum_channel, args.maximum_spread
        ):
            return
        visited[index] = 1
        queue.append((x, y))

    for x in range(width):
        enqueue(x, 0)
        enqueue(x, height - 1)
    for y in range(height):
        enqueue(0, y)
        enqueue(width - 1, y)

    while queue:
        x, y = queue.popleft()
        if x:
            enqueue(x - 1, y)
        if x + 1 < width:
            enqueue(x + 1, y)
        if y:
            enqueue(x, y - 1)
        if y + 1 < height:
            enqueue(x, y + 1)

    output = source.convert("RGBA")
    alpha = Image.new("L", source.size, 255)
    alpha.putdata([0 if marked else 255 for marked in visited])
    removed_components = remove_small_components(alpha, args.minimum_component_area)
    output.putalpha(alpha)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    output.save(args.output)

    removed = sum(visited)
    total = width * height
    print(
        f"Restored alpha in {removed:,}/{total:,} pixels "
        f"({removed / total:.1%}); removed {removed_components:,} isolated pixels; "
        f"wrote {args.output}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
