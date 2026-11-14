/**
 * astronomyEngine.ts
 *
 * Pure TypeScript lunar-surface illumination / Earth-visibility engine.
 * No external astronomy libraries.
 *
 * Method
 * ------
 *  1. UTC -> Julian Date -> Julian centuries from J2000.0 (TT timescale).
 *  2. Fundamental lunar/solar arguments (Meeus, "Astronomical Algorithms" 2nd ed., ch. 25 & 47).
 *  3. Geocentric Moon (lon, lat, distance) from the principal periodic terms of ELP-2000/82
 *     as tabulated in Meeus ch. 47; geocentric Sun from the low-precision series of ch. 25.
 *  4. Sub-solar and sub-Earth selenographic points: the Moon->Sun and Moon->Earth direction
 *     vectors are rotated into the mean lunar body-fixed frame (Meeus ch. 53, optical libration;
 *     lunar equator inclined I = 1.54242 deg to the ecliptic, Cassini's laws).
 *       - subSolarLat   oscillates about +/-1.54 deg
 *       - subSolarLon   sweeps 360 deg per synodic month (mean 29.530588 d)
 *       - subEarthLat   optical libration in latitude  (~ +/-6.7 deg)
 *       - subEarthLon   optical libration in longitude (~ +/-7.9 deg)
 *  5. Observer-to-sub-point spherical trigonometry gives topocentric azimuth/elevation
 *     (geometric, no atmosphere, so no refraction). Parallax from the Moon's 1737.4 km radius
 *     is included (~0.26 deg for Earth, negligible for the Sun).
 *  6. Local horizon masks are linearly interpolated in azimuth.
 *  7. Event times are found by marching forward in 30-minute steps (max 720 h) and refining
 *     the bracketing step by bisection.
 *
 * Conventions
 * -----------
 *  - Selenographic latitude: degrees, +north. Longitude: degrees, +EAST (IAU / "astronautical").
 *  - Azimuth: degrees clockwise from lunar north, 0..360. Elevation: -90..+90.
 *  - horizonProfile: N evenly spaced horizon elevations (degrees); sample i is at azimuth
 *    i * 360 / N (so index 0 = North, wraps around). 360 samples = 1 deg resolution.
 *
 * Not modelled (all < ~0.05 deg): physical libration, aberration, nutation, solar/Earth disc
 * radius, and the ~1 s difference between UTC and UT1.
 */

// ---------------------------------------------------------------------------
// Constants & small helpers
// ---------------------------------------------------------------------------

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

const J2000_JD = 2451545.0;
const UNIX_EPOCH_JD = 2440587.5;
const MS_PER_DAY = 86_400_000;
/** TT - UTC = 32.184 s + 37 s (TAI - UTC, unchanged since 2017-01-01). */
const TT_MINUS_UTC_SECONDS = 69.184;

const AU_KM = 149_597_870.7;
const MOON_RADIUS_KM = 1737.4;
/** Inclination of the mean lunar equator to the ecliptic (Meeus ch. 53). */
const LUNAR_EQUATOR_INCLINATION_DEG = 1.54242;

const SYNODIC_MONTH_DAYS = 29.530588; // documented mean; the model produces it from the orbit

const SCAN_STEP_MS = 30 * 60 * 1000;
const SCAN_MAX_HOURS = 720;
const BISECTION_ITERATIONS = 22; // 1800 s / 2^22 ~ 0.4 ms

const norm360 = (deg: number): number => ((deg % 360) + 360) % 360;
const norm180 = (deg: number): number => {
  const d = norm360(deg);
  return d >= 180 ? d - 360 : d;
};
/** Horner evaluation, coefficients in ascending powers of t. */
const poly = (t: number, c: readonly number[]): number =>
  c.reduceRight((acc, k) => acc * t + k, 0);

type Vec3 = readonly [number, number, number];

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface LunarVectors {
  sunAzimuth: number;
  sunElevation: number;
  sunHorizonLimit: number;
  isSunlit: boolean;
  /** 0..100. sin(elevation) x 100 when sunlit (cosine of incidence on a level surface). */
  solarPowerEfficiency: number;
  earthAzimuth: number;
  earthElevation: number;
  earthHorizonLimit: number;
  /** Direct-to-Earth comms line of sight: earthElevation > earthHorizonLimit. */
  dteCommsActive: boolean;
  /** Hours until the next sunrise/sunset (state change of isSunlit); null if none within 720 h. */
  hoursToNextSunEvent: number | null;
  /** Hours until the next Earthrise/Earthset (state change of dteCommsActive); null if none within 720 h. */
  hoursToNextEarthEvent: number | null;
}

export interface LunarElements {
  /** Moon's mean longitude L' (deg). */
  moonMeanLongitude: number;
  /** Mean elongation of the Moon D (deg). */
  moonMeanElongation: number;
  /** Sun's mean anomaly M (deg). */
  sunMeanAnomaly: number;
  /** Moon's mean anomaly M' (deg). */
  moonMeanAnomaly: number;
  /** Moon's argument of latitude F (deg). */
  moonArgumentOfLatitude: number;
  /** Longitude of the Moon's mean ascending node (deg). */
  moonAscendingNode: number;
  /** Sun's mean longitude L0 (deg). */
  sunMeanLongitude: number;
}

export interface SelenographicPoints {
  subSolarLat: number;
  subSolarLon: number;
  subEarthLat: number;
  subEarthLon: number;
  /** Earth-Moon distance (km). */
  earthMoonDistanceKm: number;
  /** Moon-Sun distance (km). */
  moonSunDistanceKm: number;
}

// ---------------------------------------------------------------------------
// Step 1: time
// ---------------------------------------------------------------------------

/** Julian Date (UTC scale) of a JS Date. */
export function toJulianDate(date: Date): number {
  return date.getTime() / MS_PER_DAY + UNIX_EPOCH_JD;
}

/** Julian centuries from J2000.0 for a given Julian Date. */
export function julianCenturiesFromJ2000(jd: number): number {
  return (jd - J2000_JD) / 36525;
}

// ---------------------------------------------------------------------------
// Step 2: orbital elements
// ---------------------------------------------------------------------------

export function computeLunarElements(T: number): LunarElements {
  return {
    moonMeanLongitude: norm360(
      poly(T, [218.3164477, 481267.88123421, -0.0015786, 1 / 538841, -1 / 65194000]),
    ),
    moonMeanElongation: norm360(
      poly(T, [297.8501921, 445267.1114034, -0.0018819, 1 / 545868, -1 / 113065000]),
    ),
    sunMeanAnomaly: norm360(poly(T, [357.5291092, 35999.0502909, -0.0001536, 1 / 24490000])),
    moonMeanAnomaly: norm360(
      poly(T, [134.9633964, 477198.8675055, 0.0087414, 1 / 69699, -1 / 14712000]),
    ),
    moonArgumentOfLatitude: norm360(
      poly(T, [93.272095, 483202.0175233, -0.0036539, -1 / 3526000, 1 / 863310000]),
    ),
    moonAscendingNode: norm360(
      poly(T, [125.0445479, -1934.1362891, 0.0020754, 1 / 467441, -1 / 60616000]),
    ),
    sunMeanLongitude: norm360(poly(T, [280.46646, 36000.76983, 0.0003032])),
  };
}

// ---------------------------------------------------------------------------
// Geocentric Moon (Meeus ch. 47, principal terms)
// ---------------------------------------------------------------------------

/** [D, M, M', F, sum_l (1e-6 deg, sine), sum_r (1e-3 km, cosine)]. Rows 33+ omit distance (<10 km each). */
const MOON_LON_DIST_TERMS: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
  [0, 0, 1, 0, 6288774, -20905355],
  [2, 0, -1, 0, 1274027, -3699111],
  [2, 0, 0, 0, 658314, -2955968],
  [0, 0, 2, 0, 213618, -569925],
  [0, 1, 0, 0, -185116, 48888],
  [0, 0, 0, 2, -114332, -3149],
  [2, 0, -2, 0, 58793, 246158],
  [2, -1, -1, 0, 57066, -152138],
  [2, 0, 1, 0, 53322, -170733],
  [2, -1, 0, 0, 45758, -204586],
  [0, 1, -1, 0, -40923, -129620],
  [1, 0, 0, 0, -34720, 108743],
  [0, 1, 1, 0, -30383, 104755],
  [2, 0, 0, -2, 15327, 10321],
  [0, 0, 1, 2, -12528, 0],
  [0, 0, 1, -2, 10980, 79661],
  [4, 0, -1, 0, 10675, -34782],
  [0, 0, 3, 0, 10034, -23210],
  [4, 0, -2, 0, 8548, -21636],
  [2, 1, -1, 0, -7888, 24208],
  [2, 1, 0, 0, -6766, 30824],
  [1, 0, -1, 0, -5163, -8379],
  [1, 1, 0, 0, 4987, -16675],
  [2, -1, 1, 0, 4036, -12831],
  [2, 0, 2, 0, 3994, -10445],
  [4, 0, 0, 0, 3861, -11650],
  [2, 0, -3, 0, 3665, 14403],
  [0, 1, -2, 0, -2689, -7003],
  [2, 0, -1, 2, -2602, 0],
  [2, -1, -2, 0, 2390, 10056],
  [1, 0, 1, 0, -2348, 6322],
  [2, -2, 0, 0, 2236, -9884],
  [0, 1, 2, 0, -2120, 0],
  [0, 2, 0, 0, -2069, 0],
  [2, -2, -1, 0, 2048, 0],
  [2, 0, 1, -2, -1773, 0],
  [2, 0, 0, 2, -1595, 0],
  [4, -1, -1, 0, 1215, 0],
  [0, 0, 2, 2, -1110, 0],
  [3, 0, -1, 0, -892, 0],
  [2, 1, 1, 0, -810, 0],
  [4, -1, -2, 0, 759, 0],
  [0, 2, -1, 0, -713, 0],
  [2, 2, -1, 0, -700, 0],
  [2, 1, -2, 0, 691, 0],
  [2, -1, 0, -2, 596, 0],
  [4, 0, 1, 0, 549, 0],
  [0, 0, 4, 0, 537, 0],
  [4, -1, 0, 0, 520, 0],
  [1, 0, -2, 0, -487, 0],
  [2, 1, 0, -2, -399, 0],
  [0, 0, 2, -2, -381, 0],
  [1, 1, 1, 0, 351, 0],
  [3, 0, -2, 0, -340, 0],
  [4, 0, -3, 0, 330, 0],
  [2, -1, 2, 0, 327, 0],
  [0, 2, 1, 0, -323, 0],
  [1, 1, -1, 0, 299, 0],
  [2, 0, 3, 0, 294, 0],
];

/** [D, M, M', F, sum_b (1e-6 deg, sine)]. */
const MOON_LAT_TERMS: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [0, 0, 0, 1, 5128122],
  [0, 0, 1, 1, 280602],
  [0, 0, 1, -1, 277693],
  [2, 0, 0, -1, 173237],
  [2, 0, -1, 1, 55413],
  [2, 0, -1, -1, 46271],
  [2, 0, 0, 1, 32573],
  [0, 0, 2, 1, 17198],
  [2, 0, 1, -1, 9266],
  [0, 0, 2, -1, 8822],
  [2, -1, 0, -1, 8216],
  [2, 0, -2, -1, 4324],
  [2, 0, 1, 1, 4200],
  [2, 1, 0, -1, -3359],
  [2, -1, -1, 1, 2463],
  [2, -1, 0, 1, 2211],
  [2, -1, -1, -1, 2065],
  [0, 1, -1, -1, -1870],
  [4, 0, -1, -1, 1828],
  [0, 1, 0, 1, -1794],
  [0, 0, 0, 3, -1749],
  [0, 1, -1, 1, -1565],
  [1, 0, 0, 1, -1491],
  [0, 1, 1, 1, -1475],
  [0, 1, 1, -1, -1410],
  [0, 1, 0, -1, -1344],
  [1, 0, 0, -1, -1335],
  [0, 0, 3, 1, 1107],
  [4, 0, 0, -1, 1021],
  [4, 0, -1, 1, 833],
  [0, 0, 1, -3, 777],
  [4, 0, -2, 1, 671],
  [2, 0, 0, -3, 607],
  [2, 0, 2, -1, 596],
  [2, -1, 1, -1, 491],
  [2, 0, -2, 1, -451],
  [0, 0, 3, -1, 439],
  [2, 0, 2, 1, 422],
  [2, 0, -3, -1, 421],
  [2, 1, -1, 1, -366],
  [2, 1, 0, 1, -351],
  [4, 0, 0, 1, 331],
  [2, -1, 1, 1, 315],
  [2, -2, 0, -1, 302],
  [0, 0, 1, 3, -283],
  [2, 1, 1, -1, -229],
  [1, 1, 0, -1, 223],
  [1, 1, 0, 1, 223],
  [0, 1, -2, -1, -220],
  [2, 1, -1, -1, -220],
  [1, 0, 1, 1, -185],
  [2, -1, -2, -1, 181],
  [0, 1, 2, 1, -177],
  [4, 0, -2, -1, 176],
  [4, -1, -1, -1, 166],
  [1, 0, 1, -1, -164],
  [4, 0, 1, -1, 132],
  [1, 0, -1, -1, -119],
  [4, -1, 0, -1, 115],
  [2, -2, 0, 1, 107],
];

interface MoonEcliptic {
  /** Geocentric ecliptic longitude, mean equinox of date (deg). */
  lonDeg: number;
  /** Geocentric ecliptic latitude (deg). */
  latDeg: number;
  /** Earth-Moon distance (km). */
  distanceKm: number;
}

function computeMoonEcliptic(T: number, el: LunarElements): MoonEcliptic {
  const D = el.moonMeanElongation * DEG;
  const M = el.sunMeanAnomaly * DEG;
  const Mp = el.moonMeanAnomaly * DEG;
  const F = el.moonArgumentOfLatitude * DEG;
  const Lp = el.moonMeanLongitude * DEG;

  // Eccentricity-of-Earth's-orbit factor for terms containing M.
  const E = 1 - 0.002516 * T - 0.0000074 * T * T;
  const eFactor = (m: number): number => (m === 0 ? 1 : Math.abs(m) === 1 ? E : E * E);

  let sumL = 0;
  let sumR = 0;
  for (const [d, m, mp, f, cl, cr] of MOON_LON_DIST_TERMS) {
    const arg = d * D + m * M + mp * Mp + f * F;
    const e = eFactor(m);
    sumL += cl * e * Math.sin(arg);
    if (cr !== 0) sumR += cr * e * Math.cos(arg);
  }

  let sumB = 0;
  for (const [d, m, mp, f, cb] of MOON_LAT_TERMS) {
    const arg = d * D + m * M + mp * Mp + f * F;
    sumB += cb * eFactor(m) * Math.sin(arg);
  }

  // Additive terms (Venus, Jupiter, flattening of the Earth).
  const A1 = (119.75 + 131.849 * T) * DEG;
  const A2 = (53.09 + 479264.29 * T) * DEG;
  const A3 = (313.45 + 481266.484 * T) * DEG;
  sumL += 3958 * Math.sin(A1) + 1962 * Math.sin(Lp - F) + 318 * Math.sin(A2);
  sumB +=
    -2235 * Math.sin(Lp) +
    382 * Math.sin(A3) +
    175 * Math.sin(A1 - F) +
    175 * Math.sin(A1 + F) +
    127 * Math.sin(Lp - Mp) -
    115 * Math.sin(Lp + Mp);

  return {
    lonDeg: norm360(el.moonMeanLongitude + sumL / 1e6),
    latDeg: sumB / 1e6,
    distanceKm: 385000.56 + sumR / 1000,
  };
}

// ---------------------------------------------------------------------------
// Geocentric Sun (Meeus ch. 25, low precision ~0.01 deg)
// ---------------------------------------------------------------------------

function computeSunGeocentric(T: number, el: LunarElements): { lonDeg: number; distanceKm: number } {
  const M = el.sunMeanAnomaly * DEG;
  const C =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * M) +
    0.000289 * Math.sin(3 * M);
  const trueLon = norm360(el.sunMeanLongitude + C);
  const nu = (el.sunMeanAnomaly + C) * DEG;
  const e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T * T;
  const rAU = (1.000001018 * (1 - e * e)) / (1 + e * Math.cos(nu));
  return { lonDeg: trueLon, distanceKm: rAU * AU_KM };
}

// ---------------------------------------------------------------------------
// Steps 3 & 4: sub-solar and sub-Earth selenographic points
// ---------------------------------------------------------------------------

const eclipticVector = (lonDeg: number, latDeg: number, r: number): Vec3 => {
  const cb = Math.cos(latDeg * DEG);
  return [r * cb * Math.cos(lonDeg * DEG), r * cb * Math.sin(lonDeg * DEG), r * Math.sin(latDeg * DEG)];
};

/**
 * Selenographic (lat, lon[east+]) of the surface point that lies directly beneath the given
 * ecliptic direction as seen from the Moon's centre.
 *
 * The ecliptic frame is rotated by -Omega about z (so the x axis points to the mean ascending
 * node), then by +I about x (tilting the ecliptic plane onto the mean lunar equator). The prime
 * meridian sits at psi = 180 deg + F in that frame (Meeus ch. 53, l' = A - F), so
 * lon = psi - 180 deg - F. Fed with the Earth direction this reproduces Meeus' optical
 * libration l', b'.
 */
function directionToSelenographic(v: Vec3, omegaDeg: number, fDeg: number): { lat: number; lon: number } {
  const [x, y, z] = v;
  const len = Math.hypot(x, y, z);
  const co = Math.cos(omegaDeg * DEG);
  const so = Math.sin(omegaDeg * DEG);
  const ci = Math.cos(LUNAR_EQUATOR_INCLINATION_DEG * DEG);
  const si = Math.sin(LUNAR_EQUATOR_INCLINATION_DEG * DEG);

  const x1 = x * co + y * so;
  const y1 = -x * so + y * co;
  const y2 = y1 * ci - z * si;
  const z2 = y1 * si + z * ci;

  const psi = Math.atan2(y2, x1) * RAD;
  return {
    lat: Math.asin(Math.max(-1, Math.min(1, z2 / len))) * RAD,
    lon: norm180(psi - 180 - fDeg),
  };
}

/**
 * Sub-solar and sub-Earth selenographic points for T Julian centuries from J2000.0 (TT).
 */
export function computeSelenographicPoints(T: number): SelenographicPoints {
  const el = computeLunarElements(T);
  const moon = computeMoonEcliptic(T, el);
  const sun = computeSunGeocentric(T, el);

  const moonVec = eclipticVector(moon.lonDeg, moon.latDeg, moon.distanceKm); // Earth -> Moon
  const sunVec = eclipticVector(sun.lonDeg, 0, sun.distanceKm); // Earth -> Sun

  const moonToEarth: Vec3 = [-moonVec[0], -moonVec[1], -moonVec[2]];
  const moonToSun: Vec3 = [sunVec[0] - moonVec[0], sunVec[1] - moonVec[1], sunVec[2] - moonVec[2]];

  const earthPt = directionToSelenographic(moonToEarth, el.moonAscendingNode, el.moonArgumentOfLatitude);
  const sunPt = directionToSelenographic(moonToSun, el.moonAscendingNode, el.moonArgumentOfLatitude);

  return {
    subSolarLat: sunPt.lat,
    subSolarLon: sunPt.lon,
    subEarthLat: earthPt.lat,
    subEarthLon: earthPt.lon,
    earthMoonDistanceKm: moon.distanceKm,
    moonSunDistanceKm: Math.hypot(...moonToSun),
  };
}

// ---------------------------------------------------------------------------
// Step 5: topocentric azimuth / elevation by spherical trigonometry
// ---------------------------------------------------------------------------

/**
 * Azimuth (0..360, clockwise from north) and elevation (-90..90) of a body whose sub-point is
 * (subLat, subLon), seen from an observer at (obsLat, obsLon) on the lunar surface.
 *
 * For a body at infinity this is exactly the spherical-trig result
 *   sin(el) = sin(phi) sin(phi0) + cos(phi) cos(phi0) cos(lam0 - lam)
 *   tan(az) = sin(dlam) cos(phi0) / (cos(phi) sin(phi0) - sin(phi) cos(phi0) cos(dlam))
 * written here in local east/north/up components so it stays well-behaved at the poles
 * (azimuth is then referenced to the supplied longitude's meridian). When `distanceKm` is
 * given, the observer's offset from the Moon's centre (parallax) is removed as well.
 */
function azElFromSubPoint(
  obsLatDeg: number,
  obsLonDeg: number,
  subLatDeg: number,
  subLonDeg: number,
  distanceKm?: number,
): { azimuth: number; elevation: number } {
  const phi = obsLatDeg * DEG;
  const lam = obsLonDeg * DEG;
  const phi0 = subLatDeg * DEG;
  const lam0 = subLonDeg * DEG;

  const sp = Math.sin(phi);
  const cp = Math.cos(phi);
  const sl = Math.sin(lam);
  const cl = Math.cos(lam);

  // Unit vector to the body and observer's radial unit vector (body-fixed frame).
  let tx = Math.cos(phi0) * Math.cos(lam0);
  let ty = Math.cos(phi0) * Math.sin(lam0);
  let tz = Math.sin(phi0);

  if (distanceKm !== undefined && Number.isFinite(distanceKm) && distanceKm > 0) {
    tx = distanceKm * tx - MOON_RADIUS_KM * cp * cl;
    ty = distanceKm * ty - MOON_RADIUS_KM * cp * sl;
    tz = distanceKm * tz - MOON_RADIUS_KM * sp;
  }

  const east = -sl * tx + cl * ty;
  const north = -sp * cl * tx - sp * sl * ty + cp * tz;
  const up = cp * cl * tx + cp * sl * ty + sp * tz;

  return {
    azimuth: norm360(Math.atan2(east, north) * RAD),
    elevation: Math.atan2(up, Math.hypot(east, north)) * RAD,
  };
}

// ---------------------------------------------------------------------------
// Step 6: local horizon
// ---------------------------------------------------------------------------

/**
 * Linearly interpolates the horizon elevation at `azimuthDeg` (wrapping through north).
 * Sample i of an N-sample profile sits at azimuth i * 360 / N. Missing/empty profile -> 0.
 */
export function interpolateHorizonElevation(
  horizonProfile: readonly number[] | undefined,
  azimuthDeg: number,
): number {
  if (!horizonProfile || horizonProfile.length === 0) return 0;
  const n = horizonProfile.length;
  if (n === 1) return horizonProfile[0];

  const pos = (norm360(azimuthDeg) / 360) * n;
  const base = Math.floor(pos);
  const frac = pos - base;
  const i0 = base % n;
  const i1 = (i0 + 1) % n;
  return horizonProfile[i0] * (1 - frac) + horizonProfile[i1] * frac;
}

// ---------------------------------------------------------------------------
// State evaluation at an instant
// ---------------------------------------------------------------------------

type Snapshot = Omit<LunarVectors, 'hoursToNextSunEvent' | 'hoursToNextEarthEvent'>;

function evaluate(lat: number, lon: number, timeMs: number, horizonProfile?: readonly number[]): Snapshot {
  // Steps 1-4
  const jdUtc = timeMs / MS_PER_DAY + UNIX_EPOCH_JD;
  const jdTt = jdUtc + TT_MINUS_UTC_SECONDS / 86400;
  const T = julianCenturiesFromJ2000(jdTt);
  const pts = computeSelenographicPoints(T);

  // Step 5
  const sun = azElFromSubPoint(lat, lon, pts.subSolarLat, pts.subSolarLon, pts.moonSunDistanceKm);
  const earth = azElFromSubPoint(lat, lon, pts.subEarthLat, pts.subEarthLon, pts.earthMoonDistanceKm);

  // Step 6
  const sunHorizonLimit = interpolateHorizonElevation(horizonProfile, sun.azimuth);
  const earthHorizonLimit = interpolateHorizonElevation(horizonProfile, earth.azimuth);

  // Step 7
  const isSunlit = sun.elevation > sunHorizonLimit;
  const solarPowerEfficiency = isSunlit ? Math.max(0, Math.sin(sun.elevation * DEG)) * 100 : 0;

  return {
    sunAzimuth: sun.azimuth,
    sunElevation: sun.elevation,
    sunHorizonLimit,
    isSunlit,
    solarPowerEfficiency,
    earthAzimuth: earth.azimuth,
    earthElevation: earth.elevation,
    earthHorizonLimit,
    dteCommsActive: earth.elevation > earthHorizonLimit,
  };
}

/** Bisects (lo: state === baseState, hi: state !== baseState) and returns the transition time (ms). */
function refineTransition(
  loMs: number,
  hiMs: number,
  baseState: boolean,
  stateAt: (ms: number) => boolean,
): number {
  let lo = loMs;
  let hi = hiMs;
  for (let i = 0; i < BISECTION_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    if (stateAt(mid) === baseState) lo = mid;
    else hi = mid;
  }
  return hi;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Computes Sun and Earth topocentric vectors, illumination, DTE comms visibility and time to
 * the next rise/set events for a lunar-surface observer.
 *
 * @param lat            Selenographic latitude of the observer, degrees (-90..90, +north).
 * @param lon            Selenographic longitude of the observer, degrees (+east; any range).
 * @param timestamp      Instant of interest (UTC).
 * @param horizonProfile Optional horizon elevations (deg) at N evenly spaced azimuths starting
 *                       at north and increasing clockwise. Defaults to a flat 0 deg horizon.
 */
export function calculateLunarVectors(
  lat: number,
  lon: number,
  timestamp: Date,
  horizonProfile?: number[],
): LunarVectors {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new RangeError(`lat must be a finite number in [-90, 90], got ${lat}`);
  }
  if (!Number.isFinite(lon)) {
    throw new RangeError(`lon must be a finite number, got ${lon}`);
  }
  const t0 = timestamp instanceof Date ? timestamp.getTime() : NaN;
  if (!Number.isFinite(t0)) {
    throw new RangeError('timestamp must be a valid Date');
  }
  if (horizonProfile && horizonProfile.some((h) => !Number.isFinite(h))) {
    throw new RangeError('horizonProfile must contain only finite numbers');
  }

  const obsLon = norm180(lon);
  const at = (ms: number): Snapshot => evaluate(lat, obsLon, ms, horizonProfile);

  const now = at(t0);

  // Scan forward for the first change of sunlit / DTE state, then refine by bisection.
  let sunHours: number | null = null;
  let earthHours: number | null = null;
  const steps = Math.round((SCAN_MAX_HOURS * 3_600_000) / SCAN_STEP_MS);

  let prevMs = t0;
  for (let i = 1; i <= steps && (sunHours === null || earthHours === null); i++) {
    const ms = t0 + i * SCAN_STEP_MS;
    const snap = at(ms);

    if (sunHours === null && snap.isSunlit !== now.isSunlit) {
      const hit = refineTransition(prevMs, ms, now.isSunlit, (m) => at(m).isSunlit);
      sunHours = (hit - t0) / 3_600_000;
    }
    if (earthHours === null && snap.dteCommsActive !== now.dteCommsActive) {
      const hit = refineTransition(prevMs, ms, now.dteCommsActive, (m) => at(m).dteCommsActive);
      earthHours = (hit - t0) / 3_600_000;
    }
    prevMs = ms;
  }

  return { ...now, hoursToNextSunEvent: sunHours, hoursToNextEarthEvent: earthHours };
}

export { SYNODIC_MONTH_DAYS };