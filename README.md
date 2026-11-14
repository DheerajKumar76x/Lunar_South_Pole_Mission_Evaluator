# South Pole Mission Evaluator

A React + TypeScript lunar mission planning dashboard for comparing potential landing sites around the Moon's south pole. The app simulates solar and Earth geometry, tracks power and communications constraints, and compares candidate landing-site viability using a data-driven mission-planning workflow.

## Overview

This project models the lighting and communications environment for multiple lunar landing sites and visualizes how each site changes over time. It is designed for rapid comparison of candidate locations for lunar south-pole missions, with emphasis on long-duration illumination, Earth visibility, and terrain hazards.

- Solar elevation and azimuth
- Earth elevation and visibility
- Power efficiency estimates
- Direct-to-Earth (DTE) communications windows
- Terrain and horizon constraints
- PSR / ice-trap risk indicators

## NASA Data & Ephemeris Provenance

This project explicitly uses NASA open-data references and lunar mission context to ground the site catalog and analytical engine in real lunar mission planning data:

- Topography & Landing Site Coordinates: Derived and verified using NASA LRO QuickMap (Arizona State University / NASA Lunar Reconnaissance Orbiter Camera) and NASA Moon Trek (Lunar Orbiter Laser Altimeter / LOLA elevation datasets).
- Ephemeris & Celestial Mechanics: Client-side analytical propagation based on Meeus Astronomical Algorithms and the ELP-2000/82 lunar series, benchmarked against NASA JPL Horizons topocentric lunar ephemerides.
- Mission Architecture Context: Canadian Space Agency (CSA) Moon Exploration Portal and NASA Artemis South Pole exploration documentation, including Artemis III candidate landing regions and related south-pole mission planning references.
- Curated site assumptions: Landing-site coordinates and terrain profiles are treated as mission-planning approximations based on NASA LRO topography, not as flight-certified real-time navigation products.

## Features

- Compare two landing sites side by side
- Choose from curated south-pole landing locations
- Override coordinates with custom site inputs
- Animate site conditions across a 30-day time window
- View 3D lunar terrain rendering for each location
- Export comparison data as CSV
- Flag low-illumination or hazardous polar zones

## Tech Stack

- React 18
- TypeScript
- Vite
- Tailwind CSS
- Three.js
- Lucide React

## Project Structure

```text
src/
  App.tsx                # Main mission comparison interface
  components/
    LunarTerrain3D.tsx   # 3D terrain visualization
  data/
    sites.ts             # Landing site definitions and terrain profiles
  utils/
    astronomyEngine.ts   # Solar/Earth geometry calculations
  index.css              # Global styling
```

## Getting Started

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

Then open the local URL shown in the terminal, typically:

```text
http://localhost:5173
```

### Build for production

```bash
npm run build
```

### Lint the project

```bash
npm run lint
```

## Mission Evaluation Logic

The evaluator computes site metrics using lunar ephemeris and local horizon geometry. Key outputs include:

- Sunlit vs shadowed conditions
- Approximate power generation efficiency
- Earth visibility windows for communications
- Site viability over a multi-day mission timeline

## Notes

This application is intended as a mission-planning visualization tool and is best suited for early concept analysis, trade studies, and educational exploration of lunar south-pole landing conditions. It is not a substitute for flight dynamics, mission operations software, or NASA-certified navigation analysis.

## License

This project is currently unlicensed unless otherwise specified by the repository owner.
