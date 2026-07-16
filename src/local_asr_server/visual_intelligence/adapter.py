from __future__ import annotations

import logging
from pathlib import Path

from local_asr_server.visual_intelligence.ocr import recognize_text_in_image
from local_asr_server.visual_intelligence.signatures import (
    FrameSignature,
    color_distance,
)

logger = logging.getLogger("uvicorn.error")


def detect_active_tile(
    left: FrameSignature,
    right: FrameSignature,
    *,
    color_threshold: float = 0.05,
) -> int | None:
    """Identify which tile of the participant grid has the most significant border color change.

    Returns the tile index (0 to N-1) if there is a clear single winner exceeding the threshold.
    """
    if not left.participant_tiles or not right.participant_tiles:
        return None
    if len(left.participant_tiles) != len(right.participant_tiles):
        return None

    distances = []
    for i, (left_tile, right_tile) in enumerate(zip(left.participant_tiles, right.participant_tiles)):
        dist = color_distance(left_tile.border_color_histogram, right_tile.border_color_histogram)
        highlight_gain = right_tile.border_highlight_score - left_tile.border_highlight_score
        distances.append((i, dist, highlight_gain))

    changed = [item for item in distances if item[1] > color_threshold]
    if not changed:
        return None

    gained_highlight = [item for item in changed if item[2] > 0.01]
    if gained_highlight:
        gained_highlight.sort(key=lambda item: (item[2], item[1]), reverse=True)
        winner = gained_highlight[0]
        if len(gained_highlight) == 1 or winner[2] - gained_highlight[1][2] > 0.01:
            return winner[0]

    changed.sort(key=lambda item: item[1], reverse=True)
    if len(changed) == 1 or changed[0][1] - changed[1][1] > 0.015:
        return changed[0][0]
    return None


def extract_speaker_name(
    frame_path: Path,
    tile_index: int,
    participants: list[str],
    grid_rows: int = 3,
    grid_cols: int = 3,
) -> str | None:
    """Crop the name label area of the highlighted tile, run native OCR, and match.

    Returns the matched participant display name if found.
    """
    if not participants:
        return None
    if grid_rows <= 0 or grid_cols <= 0:
        return None
    if tile_index < 0 or tile_index >= grid_rows * grid_cols:
        return None

    # Calculate grid position coordinates (normalized 0.0 to 1.0)
    row = tile_index // grid_cols
    col = tile_index % grid_cols

    left = col / grid_cols
    right = (col + 1) / grid_cols
    top = row / grid_rows
    bottom = (row + 1) / grid_rows

    # Bounding box for the name label: bottom-left area of the tile
    label_left = left + 0.01 * (right - left)
    label_right = left + 0.65 * (right - left)
    label_top = bottom - 0.25 * (bottom - top)
    label_bottom = bottom - 0.01 * (bottom - top)

    roi = (label_left, label_top, label_right, label_bottom)

    # Perform native Vision OCR on the cropped ROI
    words = recognize_text_in_image(frame_path, roi)
    return match_participant_name(words, participants)


def match_participant_name(
    recognized_texts: list[str],
    participants: list[str],
) -> str | None:
    """Return one unambiguous participant match from OCR text."""
    if not recognized_texts or not participants:
        return None

    detected_text = " ".join(recognized_texts).casefold()
    matches: list[str] = []
    for participant in participants:
        p_clean = participant.casefold().strip()
        if not p_clean:
            continue
        if p_clean in detected_text:
            matches.append(participant)
            continue
        parts = [part for part in p_clean.split() if len(part) >= 3]
        if parts and any(part in detected_text for part in parts):
            matches.append(participant)

    unique_matches = list(dict.fromkeys(matches))
    return unique_matches[0] if len(unique_matches) == 1 else None
