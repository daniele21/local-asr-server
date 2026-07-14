from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class TileSignature:
    dhash: int
    border_color_histogram: tuple[float, ...]


@dataclass(frozen=True)
class FrameSignature:
    global_dhash: int
    color_histogram: tuple[float, ...]
    grid_hashes: tuple[int, ...]
    shared_roi_hash: int
    participant_tiles: tuple[TileSignature, ...]


def dhash(image, *, size: int = 8) -> int:
    from PIL import Image

    resample = getattr(Image, "Resampling", Image).BILINEAR
    gray = image.convert("L").resize((size + 1, size), resample)
    getter = getattr(gray, "get_flattened_data", gray.getdata)
    pixels = list(getter())
    value = 0
    for row in range(size):
        for column in range(size):
            left = pixels[row * (size + 1) + column]
            right = pixels[row * (size + 1) + column + 1]
            value = (value << 1) | int(left > right)
    return value


def calculate_signature(
    image_path: Path, *, participant_rows: int = 3, participant_columns: int = 3,
) -> FrameSignature:
    from PIL import Image

    with Image.open(image_path) as source:
        image = source.convert("RGB")
        width, height = image.size
        grid = []
        for row in range(2):
            for column in range(2):
                box = (
                    column * width // 2,
                    row * height // 2,
                    (column + 1) * width // 2,
                    (row + 1) * height // 2,
                )
                grid.append(dhash(image.crop(box)))
        shared_box = (
            width // 20,
            height // 20,
            width * 19 // 20,
            height * 17 // 20,
        )
        histogram = image.resize((32, 32)).histogram()
        total = float(sum(histogram) or 1)
        participant_tiles = []
        for row in range(participant_rows):
            for column in range(participant_columns):
                box = (
                    column * width // participant_columns,
                    row * height // participant_rows,
                    (column + 1) * width // participant_columns,
                    (row + 1) * height // participant_rows,
                )
                tile = image.crop(box)
                participant_tiles.append(TileSignature(
                    dhash=dhash(tile),
                    border_color_histogram=_border_color_histogram(tile),
                ))
        return FrameSignature(
            global_dhash=dhash(image),
            color_histogram=tuple(round(value / total, 6) for value in histogram),
            grid_hashes=tuple(grid),
            shared_roi_hash=dhash(image.crop(shared_box)),
            participant_tiles=tuple(participant_tiles),
        )


def hamming_distance(left: int, right: int) -> int:
    return (left ^ right).bit_count()


def color_distance(left: tuple[float, ...], right: tuple[float, ...]) -> float:
    return sum(abs(a - b) for a, b in zip(left, right)) / 2.0


def grid_distance(left: FrameSignature, right: FrameSignature) -> int:
    return max(hamming_distance(a, b) for a, b in zip(left.grid_hashes, right.grid_hashes))


def participant_tile_changed(
    left: FrameSignature,
    right: FrameSignature,
    *,
    dhash_distance: int,
    color_threshold: float,
) -> bool:
    for left_tile, right_tile in zip(left.participant_tiles, right.participant_tiles):
        if hamming_distance(left_tile.dhash, right_tile.dhash) > dhash_distance:
            return True
        if color_distance(left_tile.border_color_histogram, right_tile.border_color_histogram) > color_threshold:
            return True
    return False


def _border_color_histogram(tile) -> tuple[float, ...]:
    width, height = tile.size
    thickness = max(1, min(width, height) // 16)
    strips = (
        tile.crop((0, 0, width, thickness)),
        tile.crop((0, max(0, height - thickness), width, height)),
        tile.crop((0, thickness, thickness, max(thickness, height - thickness))),
        tile.crop((max(0, width - thickness), thickness, width, max(thickness, height - thickness))),
    )
    histogram = [0] * 768
    for strip in strips:
        for index, value in enumerate(strip.histogram()):
            histogram[index] += value
    quantized = [
        sum(histogram[channel * 256 + start:channel * 256 + start + 16])
        for channel in range(3)
        for start in range(0, 256, 16)
    ]
    total = float(sum(quantized) or 1)
    return tuple(round(value / total, 6) for value in quantized)
