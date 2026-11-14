#!/usr/bin/env python3
"""Extract small polar LOLA DEM patches for the evaluator's preset sites."""

from __future__ import annotations

import concurrent.futures
import json
import math
import re
import struct
import time
import urllib.error
import urllib.request
from pathlib import Path

SOURCE_URL = (
    "https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/FLOAT_IMG/"
    "LDEM_80S_80M_FLOAT.IMG"
)
LABEL_URL = SOURCE_URL.removesuffix(".IMG") + ".LBL"
SOURCE_LABEL = "LDEM_80S_80M"
SOURCE_RESOLUTION_METERS = 80
SOURCE_IMAGE_SIZE = 7600
SOURCE_ROW_BYTES = 30_400
SOURCE_SAMPLE_OFFSET = 3799.5
SOURCE_LINE_OFFSET = 3799.5
LUNAR_RADIUS_METERS = 1_737_400
PATCH_SIZE = 160
ROWS_PER_REQUEST = 8
PUBLIC_DIR = Path(__file__).resolve().parents[1] / "public" / "data"
OUTPUT_PATH = PUBLIC_DIR / "lolaHeightmaps.json"
SITE_SOURCE = Path(__file__).resolve().parents[1] / "src" / "data" / "sites.ts"


def fetch_range(start: int, end: int) -> bytes:
    request = urllib.request.Request(
        SOURCE_URL,
        headers={"Range": f"bytes={start}-{end}"},
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                if response.status != 206:
                    raise RuntimeError(
                        f"LOLA server ignored byte range {start}-{end} "
                        f"(HTTP {response.status}); refusing full-raster download."
                    )
                expected_range = f"bytes {start}-{end}/"
                if not (response.headers.get("Content-Range") or "").startswith(
                    expected_range
                ):
                    raise RuntimeError(
                        f"Unexpected LOLA Content-Range for bytes {start}-{end}."
                    )
                payload = response.read()
                if len(payload) != end - start + 1:
                    raise RuntimeError(
                        f"Incomplete LOLA range: expected {end - start + 1} bytes, "
                        f"received {len(payload)}."
                    )
                return payload
        except (urllib.error.URLError, TimeoutError):
            if attempt == 2:
                raise
            time.sleep(attempt + 1)
    raise RuntimeError("Unable to retrieve LOLA raster range.")


def source_pixel(latitude: float, longitude: float) -> tuple[int, int]:
    """Map east-positive lunar coordinates to the south-polar raster pixel."""
    angular_distance = math.radians(90 + latitude)
    radius = 2 * LUNAR_RADIUS_METERS * math.tan(angular_distance / 2)
    longitude_radians = math.radians(longitude)
    east_meters = radius * math.sin(longitude_radians)
    north_meters = radius * math.cos(longitude_radians)

    column = round(SOURCE_SAMPLE_OFFSET - 1 + east_meters / SOURCE_RESOLUTION_METERS)
    row = round(SOURCE_LINE_OFFSET - 1 - north_meters / SOURCE_RESOLUTION_METERS)
    if not (0 <= row < SOURCE_IMAGE_SIZE and 0 <= column < SOURCE_IMAGE_SIZE):
        raise ValueError(f"Site ({latitude}, {longitude}) is outside the LOLA raster.")
    return row, column


def load_sites() -> tuple[tuple[str, float, float], ...]:
    source = SITE_SOURCE.read_text(encoding="utf-8")
    pattern = re.compile(
        r"\{\s*id:\s*'([^']+)'\s*,\s*name:\s*'[^']+'\s*,"
        r"\s*lat:\s*(-?\d+(?:\.\d+)?)\s*,\s*lon:\s*(-?\d+(?:\.\d+)?)",
        re.MULTILINE,
    )
    sites = tuple(
        (site_id, float(latitude), float(longitude))
        for site_id, latitude, longitude in pattern.findall(source)
    )
    if len(sites) != 5 or len({site_id for site_id, _, _ in sites}) != 5:
        raise RuntimeError(f"Expected five unique preset site coordinates in {SITE_SOURCE}.")
    return sites


def fetch_patch(site_id: str, latitude: float, longitude: float) -> dict[str, object]:
    center_row, center_column = source_pixel(latitude, longitude)
    half_size = PATCH_SIZE // 2
    first_row = center_row - half_size
    last_row = first_row + PATCH_SIZE
    first_column = center_column - half_size
    last_column = first_column + PATCH_SIZE
    if min(first_row, first_column) < 0 or max(last_row, last_column) > SOURCE_IMAGE_SIZE:
        raise ValueError(f"LOLA patch for {site_id} would exceed the raster bounds.")

    row_groups = [
        (start, min(start + ROWS_PER_REQUEST, last_row))
        for start in range(first_row, last_row, ROWS_PER_REQUEST)
    ]

    def fetch_rows(group: tuple[int, int]) -> tuple[int, bytes]:
        start, end = group
        byte_start = start * SOURCE_ROW_BYTES
        byte_end = end * SOURCE_ROW_BYTES - 1
        return start, fetch_range(byte_start, byte_end)

    rows: dict[int, bytes] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        for row, payload in executor.map(fetch_rows, row_groups):
            rows[row] = payload

    raw_elevations: list[float] = []
    for row in range(first_row, last_row):
        group_start = first_row + ((row - first_row) // ROWS_PER_REQUEST) * ROWS_PER_REQUEST
        row_offset = (row - group_start) * SOURCE_ROW_BYTES
        column_offset = first_column * 4
        byte_start = row_offset + column_offset
        byte_end = byte_start + PATCH_SIZE * 4
        row_payload = rows[group_start][byte_start:byte_end]
        if len(row_payload) != PATCH_SIZE * 4:
            raise RuntimeError(f"Short LOLA row while generating {site_id}.")
        raw_elevations.extend(struct.unpack(f"<{PATCH_SIZE}f", row_payload))

    center_value = raw_elevations[half_size * PATCH_SIZE + half_size]
    if not math.isfinite(center_value) or not all(
        math.isfinite(value) for value in raw_elevations
    ):
        raise ValueError(
            f"LOLA patch for {site_id} contains invalid elevation samples."
        )

    relative_meters = [
        round((value - center_value) * 1000) for value in raw_elevations
    ]
    if any(value < -32768 or value > 32767 for value in relative_meters):
        raise ValueError(f"LOLA elevation range for {site_id} exceeds Int16 storage.")

    return {
        "width": PATCH_SIZE,
        "height": PATCH_SIZE,
        "resolutionMeters": SOURCE_RESOLUTION_METERS,
        "referenceElevationMeters": round(center_value * 1000),
        "minimumRelativeElevationMeters": min(relative_meters),
        "maximumRelativeElevationMeters": max(relative_meters),
        "elevationsMeters": relative_meters,
    }


def validate_source_label() -> None:
    request = urllib.request.Request(LABEL_URL, headers={"User-Agent": "LunarMissionEvaluator/1.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        label = response.read().decode("ascii", errors="replace")
    expected = {
        "PRODUCT_ID": SOURCE_LABEL,
        "LINE_SAMPLES": str(SOURCE_IMAGE_SIZE),
        "LINES": str(SOURCE_IMAGE_SIZE),
        "RECORD_BYTES": str(SOURCE_ROW_BYTES),
        "MAP_SCALE": str(SOURCE_RESOLUTION_METERS),
        "SAMPLE_PROJECTION_OFFSET": "3799.5",
        "LINE_PROJECTION_OFFSET": "3799.5",
        "CENTER_LATITUDE": "-90",
        "CENTER_LONGITUDE": "0",
        "POSITIVE_LONGITUDE_DIRECTION": "EAST",
    }
    for key, value in expected.items():
        pattern = rf'^\s*{key}\s*=\s*"?{re.escape(value)}"?(?:\s|$)'
        if not re.search(pattern, label, re.MULTILINE):
            raise RuntimeError(f"LOLA label does not match expected {key}={value}.")
    if "POLAR STEREOGRAPHIC" not in label:
        raise RuntimeError("LOLA source is not the expected polar-stereographic raster.")
    if not re.search(r"^\s*SAMPLE_TYPE\s*=\s*PC_REAL\s*$", label, re.MULTILINE):
        raise RuntimeError("LOLA source is not the expected 32-bit floating-point raster.")
    if not re.search(r"^\s*SAMPLE_BITS\s*=\s*32\s*$", label, re.MULTILINE):
        raise RuntimeError("LOLA source is not the expected 32-bit floating-point raster.")


def main() -> None:
    validate_source_label()
    sites = load_sites()
    result = {
        "source": "NASA LRO LOLA",
        "product": SOURCE_LABEL,
        "sourceResolutionMeters": SOURCE_RESOLUTION_METERS,
        "patchResolutionMeters": SOURCE_RESOLUTION_METERS,
        "patchDimensions": f"{PATCH_SIZE}x{PATCH_SIZE}",
        "verticalExaggeration": 1,
        "sourceUrl": LABEL_URL,
        "sites": {},
    }
    for site_id, latitude, longitude in sites:
        print(f"Extracting {site_id} ({latitude}, {longitude})...")
        result["sites"][site_id] = fetch_patch(site_id, latitude, longitude)

    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(result, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
