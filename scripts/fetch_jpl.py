import json
import re
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path


SITES = {
    "shackleton-rim": {"lat": -89.54, "lon": 137.0},
    "malapert-massif": {"lat": -86.0, "lon": 2.7},
    "connecting-ridge": {"lat": -89.45, "lon": -136.0},
    "nobile-rim": {"lat": -85.3, "lon": 31.5},
    "haworth-crater": {"lat": -87.45, "lon": -5.0},
}
START = datetime(2026, 11, 14, 12, tzinfo=timezone.utc)
# Include a further 30 days so event look-ahead remains in the cache at timeline end.
STOP = START + timedelta(days=60)
API_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
ROW_PATTERN = re.compile(
    r"^\s*(\d{4}-[A-Za-z]{3}-\d{2})\s+(\d{2}:\d{2})\s+(?:[*i]+\s+)?"
    r"([-+]?(?:\d+(?:\.\d*)?|\.\d+))\s+"
    r"([-+]?(?:\d+(?:\.\d*)?|\.\d+))"
)


def fetch_body(site_id: str, coordinates: dict[str, float], body_id: str) -> dict[str, dict[str, float]]:
    params = {
        "format": "text",
        "COMMAND": f"'{body_id}'",
        "OBJ_DATA": "NO",
        "MAKE_EPHEM": "YES",
        "EPHEM_TYPE": "OBSERVER",
        "CENTER": "coord@301",
        "COORD_TYPE": "GEODETIC",
        "SITE_COORD": f"'{coordinates['lon']},{coordinates['lat']},0.0'",
        "START_TIME": f"'{START:%Y-%m-%d %H:%M}'",
        "STOP_TIME": f"'{STOP:%Y-%m-%d %H:%M}'",
        "STEP_SIZE": "1 h",
        "QUANTITIES": "4",
        "APPARENT": "AIRLESS",
    }
    url = f"{API_URL}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url, headers={"User-Agent": "LunarNavigatorsMissionEvaluator/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        text = response.read().decode("utf-8")

    if "$$SOE" not in text or "$$EOE" not in text:
        raise RuntimeError(f"JPL Horizons returned no ephemeris data for {site_id}, body {body_id}")

    entries: dict[str, dict[str, float]] = {}
    in_data = False
    for line in text.splitlines():
        if "$$SOE" in line:
            in_data = True
            continue
        if "$$EOE" in line:
            break
        if not in_data:
            continue
        match = ROW_PATTERN.match(line)
        if not match:
            continue
        date_text, time_text, azimuth, elevation = match.groups()
        timestamp = datetime.strptime(
            f"{date_text} {time_text}", "%Y-%b-%d %H:%M"
        ).replace(tzinfo=timezone.utc)
        entries[timestamp.isoformat(timespec="seconds").replace("+00:00", "Z")] = {
            "azimuth": float(azimuth),
            "elevation": float(elevation),
        }

    expected_count = int((STOP - START).total_seconds() // 3600) + 1
    if len(entries) != expected_count:
        raise RuntimeError(
            f"Expected {expected_count} hourly samples for {site_id}, body {body_id}; got {len(entries)}"
        )
    return entries


def main() -> None:
    cache: dict[str, list[dict[str, object]]] = {}
    for site_id, coordinates in SITES.items():
        print(f"Fetching JPL Horizons ephemerides for {site_id}...")
        sun_data = fetch_body(site_id, coordinates, "10")
        earth_data = fetch_body(site_id, coordinates, "399")
        if sun_data.keys() != earth_data.keys():
            raise RuntimeError(f"Sun and Earth sample times do not match for {site_id}")
        cache[site_id] = [
            {"time": time, "sun": sun_data[time], "earth": earth_data[time]}
            for time in sun_data
        ]

    output = Path(__file__).resolve().parents[1] / "public" / "data" / "horizonsCache.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(cache, indent=2) + "\n", encoding="utf-8")
    print(f"Saved {sum(map(len, cache.values()))} hourly samples to {output}")


if __name__ == "__main__":
    main()
