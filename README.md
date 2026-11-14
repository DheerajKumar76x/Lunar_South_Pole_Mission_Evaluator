# Lunar South Pole Mission Evaluator

A React + TypeScript lunar mission planning dashboard for comparing candidate landing sites around the Moon's south pole. The app evaluates solar illumination, Earth visibility, terrain constraints, and communications windows to help rapid mission trade studies for lunar polar exploration.

## Why this project?

Mission planners and researchers need a fast way to compare candidate south-pole landing sites before committing to deeper analyses. This tool visualizes key environmental constraints over a 30-day mission timeline, including:

- Solar illumination and shadowing
- Earth-rise / Earth-set visibility windows
- Direct-to-Earth communications opportunities
- Terrain, horizon, and local shadow risk
- Power-generation suitability for solar arrays
- Candidate landing-site comparison for Artemis-style polar missions

## NASA Data and Mission Provenance

This project explicitly incorporates NASA open-data sources and mission-planning references used in lunar south-pole exploration studies:

- Topography and landing site coordinates: derived and cross-checked using NASA LRO QuickMap (Arizona State University / NASA Lunar Reconnaissance Orbiter Camera) and NASA Moon Trek (Lunar Orbiter Laser Altimeter / LOLA elevation datasets).
- Celestial mechanics and ephemeris: preset sites fetch hourly topocentric Sun/Earth samples from NASA JPL Horizons (DE441) once at startup; values between samples are interpolated. Custom coordinates and times outside the cache use the analytical Meeus / principal ELP-2000/82 model.
- Mission architecture context: informed by the Canadian Space Agency (CSA) Moon Exploration Portal and NASA Artemis South Pole exploration documentation, including Artemis III candidate landing regions and related lunar polar site assessments.
- Data usage note: curated landing-site coordinates and terrain profiles are developed as planning approximations grounded in NASA lunar topography and ephemeris references, not as flight-certified navigation data.

## Features

- Side-by-side comparison of two candidate landing sites
- Curated south-pole landing site catalog
- Custom latitude/longitude override inputs
- 30-day animated mission timeline
- 3D lunar terrain visualization for each site
- CSV export of comparison results
- Risk flags for low-illumination and hazardous polar terrain zones
- Solar and communications summaries for each site

## Example use cases

- Compare candidate sites for throughput and power availability
- Review lighting duration around the lunar terminator
- Identify communication blackout periods for Earth contact
- Estimate terrain-driven visibility and shadow risk
- Perform quick concept studies during pre-landing site selection

## System overview

The evaluator combines:

- Lunar surface geometry and solar vector calculations
- Earth visibility and direct-to-Earth line-of-sight analysis
- Horizon masking using terrain profiles
- Mission timeline analysis over multiple days

## Tech stack

- React 18
- TypeScript
- Vite
- Tailwind CSS
- Three.js
- Lucide React

## Project structure

```text
src/
  App.tsx                 # Mission comparison interface
  components/
    LunarTerrain3D.tsx    # 3D terrain visualization
  data/
    sites.ts              # Curated landing-site definitions
  utils/
    astronomyEngine.ts    # Solar/Earth geometry calculations
  index.css               # Global styling
public/
  data/
    horizonsCache.json    # Public hourly JPL Horizons samples for preset sites
```

## Getting started

### Prerequisites

- Node.js 18+
- npm

### Install dependencies

```bash
npm install
```

### Run locally

```bash
npm run dev
```

Then open the local URL shown in the terminal, usually:

```text
http://localhost:5173
```

### Build for production

```bash
npm run build
```

### Refresh the JPL Horizons cache

The public cache spans 60 days from November 14, 2026: the 30-day mission timeline plus event-look-ahead coverage. To regenerate it, run:

```bash
npm run fetch:horizons
```

This calls the public JPL Horizons API for the five preset site coordinates and writes `public/data/horizonsCache.json`. The app fetches the file once at startup and keeps samples in memory; custom coordinates and out-of-range times use the analytical fallback.

### Lint the project

```bash
npm run lint
```

## Mission evaluation logic

The evaluator performs a lightweight lunar situational analysis using local horizon geometry and ephemeris-derived vectors. Preset sites use hourly JPL Horizons topocentric azimuth/elevation data with interpolation; custom positions use the analytical model and a flat horizon. Key outputs include:

- Sunlit vs. shadowed conditions
- Approximate solar array power efficiency
- Earth visibility windows and communication opportunities
- Multi-day site viability metrics over a mission timeline
- Terrain hazard and PSR / ice-trap risk indicators

## Accuracy and limitations

This application is intended for rapid concept analysis, trade studies, and educational exploration of lunar south-pole landing conditions. It is not a substitute for flight dynamics software, precision navigation products, or official mission operations analysis.

## License

This project is currently unlicensed unless otherwise specified by the repository owner.

## Future enhancements

- Additional landing-site datasets and filters
- More detailed power and thermal modeling
- Mission duration optimization tools
- Multi-site ranking and scoring
- Expanded lunar terrain and shadow analytics
