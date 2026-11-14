export interface LolaHeightmap {
  width: number
  height: number
  resolutionMeters: number
  referenceElevationMeters: number
  minimumRelativeElevationMeters: number
  maximumRelativeElevationMeters: number
  elevationsMeters: number[]
}

interface LolaTerrainData {
  source: string
  product: string
  sourceResolutionMeters: number
  patchResolutionMeters: number
  verticalExaggeration: number
  sourceUrl: string
  sites: Record<string, LolaHeightmap>
}

let terrainDataPromise: Promise<LolaTerrainData> | null = null

function isHeightmap(value: unknown): value is LolaHeightmap {
  if (!value || typeof value !== 'object') return false
  const map = value as Record<string, unknown>
  const width = map.width
  const height = map.height
  const elevations = map.elevationsMeters
  return Number.isInteger(width)
    && Number.isInteger(height)
    && typeof width === 'number'
    && typeof height === 'number'
    && width > 1
    && height > 1
    && Array.isArray(elevations)
    && elevations.length === width * height
    && elevations.every((sample: unknown) => typeof sample === 'number' && Number.isFinite(sample))
}

async function loadTerrainData(): Promise<LolaTerrainData> {
  const response = await fetch('/data/lolaHeightmaps.json')
  if (!response.ok) {
    throw new Error(`LOLA terrain data request failed with HTTP ${response.status}.`)
  }
  const data: unknown = await response.json()
  if (!data || typeof data !== 'object' || !('sites' in data)) {
    throw new Error('LOLA terrain data has an invalid structure.')
  }
  const terrain = data as LolaTerrainData
  if (!terrain.sites || Object.values(terrain.sites).some(map => !isHeightmap(map))) {
    throw new Error('LOLA terrain data contains an invalid heightmap.')
  }
  return terrain
}

export async function getLolaHeightmap(siteId: string): Promise<LolaHeightmap> {
  terrainDataPromise ??= loadTerrainData()
  let terrain: LolaTerrainData
  try {
    terrain = await terrainDataPromise
  } catch (error) {
    terrainDataPromise = null
    throw error
  }
  const heightmap = terrain.sites[siteId]
  if (!heightmap) {
    throw new Error(`No NASA LOLA heightmap is available for preset site "${siteId}".`)
  }
  return heightmap
}
