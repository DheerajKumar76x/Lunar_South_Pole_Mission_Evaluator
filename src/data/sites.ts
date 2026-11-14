export interface LandingSite {
  id: string
  name: string
  lat: number
  lon: number
  elevationMeters: number
  /** Terrain elevation angle in degrees at each 10° azimuth, starting at 0° North clockwise. */
  horizonProfile: number[]
}

export const LANDING_SITES: LandingSite[] = [
  {
    id: 'shackleton-rim',
    name: 'Shackleton Crater Rim',
    lat: -89.54,
    lon: 137.0,
    elevationMeters: 2100,
    // Mostly low rim obstruction, with a sharp crater drop-off along the western arc.
    horizonProfile: [0.7, 0.8, 0.6, 0.9, 1.0, 0.8, 0.5, 0.6, 0.9, 1.1, 0.8, 0.6, 0.5, 0.7, 0.9, 1.0, 0.8, 0.6, 0.4, 0.3, 0.2, 0.1, -4.8, -12.6, -18.4, -21.0, -17.2, -10.8, -3.4, 0.2, 0.5, 0.7, 0.9, 1.2, 1.0, 0.8],
  },
  {
    id: 'malapert-massif',
    name: 'Malapert Massif',
    lat: -86.00,
    lon: 2.7,
    elevationMeters: 5000,
    // Elevated massif: a depressed Earth-facing horizon near 0° longitude, higher terrain around the rest.
    horizonProfile: [0.0, -0.2, -0.5, -0.3, 0.1, 0.5, 1.0, 1.8, 2.7, 3.5, 4.2, 4.8, 5.1, 4.7, 4.2, 3.8, 3.2, 2.8, 2.2, 1.8, 1.5, 1.2, 1.0, 1.3, 1.8, 2.5, 3.2, 3.7, 3.1, 2.4, 1.8, 1.4, 1.0, 0.7, 0.4, 0.1],
  },
  {
    id: 'connecting-ridge',
    name: 'Connecting Ridge',
    lat: -89.45,
    lon: -136.0,
    elevationMeters: 1950,
    // Narrow, low ridge profile associated with long-duration illumination.
    horizonProfile: [0.3, 0.5, 0.7, 0.9, 1.1, 1.3, 1.0, 0.8, 0.6, 0.4, 0.2, 0.1, 0.3, 0.5, 0.8, 1.0, 1.2, 1.4, 1.5, 1.2, 0.9, 0.6, 0.4, 0.2, 0.1, 0.3, 0.5, 0.7, 0.9, 1.1, 1.3, 1.5, 1.2, 0.9, 0.6, 0.4],
  },
  {
    id: 'nobile-rim',
    name: 'Nobile Crater Rim 1',
    lat: -85.30,
    lon: 31.5,
    elevationMeters: 1200,
    // Moderate obstruction from the crater rim, varying around the full azimuth.
    horizonProfile: [1.2, 1.5, 1.8, 2.1, 2.4, 2.8, 3.1, 3.4, 3.2, 2.9, 2.6, 2.3, 2.0, 1.8, 1.5, 1.2, 1.0, 1.3, 1.7, 2.1, 2.5, 2.9, 3.3, 3.5, 3.2, 2.8, 2.5, 2.2, 1.9, 1.6, 1.3, 1.0, 1.2, 1.5, 1.8, 1.3],
  },
  {
    id: 'haworth-crater',
    name: 'Haworth Crater Floor/Rim',
    lat: -87.45,
    lon: -5.0,
    elevationMeters: -1800,
    // Deep crater walls create high obstruction and frequent local shadowing.
    horizonProfile: [5.0, 5.5, 6.2, 7.0, 7.8, 8.4, 8.9, 8.2, 7.6, 6.8, 6.1, 5.6, 5.1, 4.8, 5.3, 6.0, 6.7, 7.4, 8.1, 8.8, 8.5, 7.9, 7.2, 6.5, 5.8, 5.2, 4.7, 5.1, 5.7, 6.4, 7.1, 7.8, 8.4, 8.9, 7.6, 6.2],
  },
]
