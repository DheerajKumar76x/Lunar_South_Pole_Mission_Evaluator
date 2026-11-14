# South Pole Mission Evaluator

A React + TypeScript lunar mission planning dashboard for comparing potential landing sites around the Moon's south pole. The app simulates solar and Earth geometry, tracks power and communications viability, and helps mission planners compare candidate sites over a 30-day lunar cycle.

## Overview

This project models the lighting and communications environment for multiple lunar landing sites and visualizes how each site changes over time. It is designed for rapid comparison of candidate landing locations based on:

- Solar elevation and azimuth
- Earth elevation and visibility
- Power efficiency estimates
- Direct-to-Earth (DTE) communications windows
- Terrain and horizon constraints
- PSR / ice-trap risk indicators

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

This application is intended as a mission-planning visualization tool and is best suited for early concept analysis, trade studies, and educational exploration of lunar south-pole landing conditions.

## License

This project is currently unlicensed unless otherwise specified by the repository owner.
