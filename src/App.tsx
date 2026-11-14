import { useEffect, useMemo, useState } from 'react'
import { Download, Pause, Play } from 'lucide-react'
import paleBlueDot from './assets/palebluedot.jpeg'
import { LANDING_SITES, type LandingSite } from './data/sites'
import { calculateLunarVectors, initializeEphemerisCache } from './utils/astronomyEngine'
import { LunarTerrain3D } from './components/LunarTerrain3D'
import './App.css'

const START = Date.parse('2026-11-14T12:00:00Z')
const HOUR = 3_600_000
const MAX_HOURS = 720
const CUSTOM_HORIZON_PROFILE: number[] = []
const isPsrIceTrap = (site: LandingSite) => site.elevationMeters <= -1000 || Math.max(...site.horizonProfile) > 5
const horizonForSite = (site: LandingSite): number[] | undefined => site.id === 'custom' ? undefined : site.horizonProfile
const calculateSiteVectors = (site: LandingSite, timestamp: Date) =>
  calculateLunarVectors(site.lat, site.lon, timestamp, horizonForSite(site), site.id)

const summarizeSite = (site: LandingSite) => {
  let power = 0
  let comms = 0
  let continuousPowerHours = 0
  for (let hour = 0; hour <= MAX_HOURS; hour += 1) {
    const vectors = calculateSiteVectors(site, new Date(START + hour * HOUR))
    power += vectors.solarPowerEfficiency
    comms += Number(vectors.dteCommsActive)
    continuousPowerHours += Number(vectors.isSunlit)
  }
  return {
    power: power / 721,
    comms: comms / 721 * 100,
    continuousPower: continuousPowerHours / 721 * 100,
    dteHours: comms,
  }
}

type SiteSummary = ReturnType<typeof summarizeSite>

function getMissionVerdict(site: LandingSite, summary: SiteSummary, solarLeader: boolean, solarTie: boolean) {
  if (isPsrIceTrap(site) && summary.continuousPower < 20) {
    return {
      tone: 'warning',
      headline: 'HIGH ICE-TRAP POTENTIAL',
      detail: summary.comms < 50
        ? 'Limited sunlight and Earth visibility; relay satellite support may be required.'
        : 'Limited sunlight; assess surface operations and thermal constraints.',
    }
  }
  if (solarLeader) {
    return {
      tone: 'good',
      headline: summary.continuousPower >= 85
        ? 'BEST FOR CONTINUOUS SOLAR POWER'
        : 'BEST SOLAR POWER AVAILABILITY',
      detail: summary.comms < 50
        ? `${summary.continuousPower.toFixed(1)}% sunlit samples; limited Earth visibility means relay support may be required.`
        : `${summary.continuousPower.toFixed(1)}% sunlit samples across the 30-day study.`,
    }
  }
  if (solarTie) {
    return {
      tone: 'info',
      headline: 'SIMILAR SOLAR AVAILABILITY',
      detail: summary.comms < 50
        ? 'Sunlit samples are comparable; limited Earth visibility may require relay support.'
        : 'Sunlit samples are comparable across the 30-day study.',
    }
  }
  if (summary.comms < 50) {
    return {
      tone: 'warning',
      headline: 'LIMITED DIRECT-TO-EARTH LINK',
      detail: 'Evaluate relay coverage for reliable mission communications.',
    }
  }
  return {
    tone: 'info',
    headline: 'LOWER SOLAR AVAILABILITY',
    detail: 'Compare power storage and operational windows against the alternate site.',
  }
}

const formatUtc = (date: Date) => date.toISOString().replace('T', ' ').replace('.000Z', ' UTC')

function App() {
  const [timestamp, setTimestamp] = useState(() => new Date(START))
  const [clock, setClock] = useState(() => new Date())
  const [siteAId, setSiteAId] = useState('shackleton-rim')
  const [siteBId, setSiteBId] = useState('haworth-crater')
  const [customA, setCustomA] = useState<{ lat: number; lon: number } | null>(null)
  const [customB, setCustomB] = useState<{ lat: number; lon: number } | null>(null)
  const [playing, setPlaying] = useState(false)
  const [cacheReady, setCacheReady] = useState(false)
  const [cacheError, setCacheError] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let active = true
    initializeEphemerisCache().then(() => {
      if (active) setCacheReady(true)
    }).catch((error: unknown) => {
      console.error('Unable to load JPL Horizons cache; using the analytical model instead.', error)
      if (active) setCacheError(error instanceof Error ? error.message : 'Unknown cache loading error')
    })
    return () => { active = false }
  }, [])

  const offset = Math.max(0, Math.min(MAX_HOURS, Math.round((timestamp.getTime() - START) / HOUR)))
  const setOffset = (hours: number) => setTimestamp(new Date(START + Math.max(0, Math.min(MAX_HOURS, hours)) * HOUR))

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      setTimestamp(current => new Date(Math.min(START + MAX_HOURS * HOUR, current.getTime() + 2 * HOUR)))
    }, 100)
    return () => window.clearInterval(timer)
  }, [playing])

  const siteA = LANDING_SITES.find(site => site.id === siteAId) ?? LANDING_SITES[0]
  const siteB = LANDING_SITES.find(site => site.id === siteBId) ?? LANDING_SITES[4]
  const a = customA
    ? { ...siteA, id: 'custom', lat: customA.lat, lon: customA.lon, elevationMeters: 0, horizonProfile: CUSTOM_HORIZON_PROFILE, name: `${siteA.name} · Custom` }
    : siteA
  const b = customB
    ? { ...siteB, id: 'custom', lat: customB.lat, lon: customB.lon, elevationMeters: 0, horizonProfile: CUSTOM_HORIZON_PROFILE, name: `${siteB.name} · Custom` }
    : siteB
  const summaryA = useMemo(() => summarizeSite(a), [a.lat, a.lon, a.horizonProfile, cacheReady])
  const summaryB = useMemo(() => summarizeSite(b), [b.lat, b.lon, b.horizonProfile, cacheReady])
  const solarSiteA = summaryA.continuousPower > summaryB.continuousPower
  const solarSiteB = summaryB.continuousPower > summaryA.continuousPower
  const solarTie = !solarSiteA && !solarSiteB
  const verdictA = getMissionVerdict(a, summaryA, solarSiteA, solarTie)
  const verdictB = getMissionVerdict(b, summaryB, solarSiteB, solarTie)
  const activeSource = cacheError ? 'ANALYTICAL FALLBACK' : cacheReady ? 'JPL DE441 CACHE' : 'LOADING EPHEMERIS'

  const exportCsv = () => {
    const rows = [['UTC', 'A Solar Elevation', 'A Earth Elevation', 'A Power Efficiency %', 'A Comms', 'B Solar Elevation', 'B Earth Elevation', 'B Power Efficiency %', 'B Comms']]
    for (let hour = 0; hour <= MAX_HOURS; hour += 1) {
      const time = new Date(START + hour * HOUR)
      const x = calculateSiteVectors(a, time)
      const y = calculateSiteVectors(b, time)
      rows.push([
        time.toISOString(), x.sunElevation.toFixed(4), x.earthElevation.toFixed(4), x.solarPowerEfficiency.toFixed(2), x.dteCommsActive ? 'LOCKED' : 'BLACKOUT',
        y.sunElevation.toFixed(4), y.earthElevation.toFixed(4), y.solarPowerEfficiency.toFixed(2), y.dteCommsActive ? 'LOCKED' : 'BLACKOUT',
      ])
    }
    const url = URL.createObjectURL(new Blob([rows.map(row => row.join(',')).join('\r\n')], { type: 'text/csv' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'lunar-navigators-30-day-log.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="mission-console">
      <header className="flight-header">
        <div className="flight-header__inner">
          <div className="brand-lockup">
            <img className="brand-mark" src={paleBlueDot} alt="Pale Blue Dot" />
            <div>
              <p className="eyebrow">THE LUNAR NAVIGATORS</p>
              <h1>LUNAR SOUTH POLE MISSION EVALUATOR</h1>
            </div>
          </div>
          <div className="header-telemetry">
            <div className="clock-block">
              <span className="field-label">LIVE UTC</span>
              <time className="numeric" dateTime={clock.toISOString()}>{formatUtc(clock)}</time>
            </div>
            <span className={`source-badge ${cacheError ? 'source-badge--warning' : cacheReady ? 'source-badge--ready' : ''}`}>
              <span className="status-dot" />{activeSource}
            </span>
            <button type="button" className="button button--export" onClick={exportCsv}>
              <Download size={14} /> <span>EXPORT CSV</span>
            </button>
          </div>
        </div>
      </header>

      {cacheError && <p role="status" className="cache-warning">JPL cache unavailable ({cacheError}); analytical calculations active.</p>}

      <section className="console-content">
        <div className="section-heading">
          <div>
            <p className="eyebrow">MISSION ANALYSIS <span className="divider-slash">//</span> 30-DAY WINDOW</p>
            <h2>Landing Site Comparison</h2>
          </div>
          <div className="mission-time">
            <span className="field-label">SIMULATION TIME</span>
            <time className="numeric" dateTime={timestamp.toISOString()}>{formatUtc(timestamp)}</time>
          </div>
        </div>

        <div className="site-grid">
          <SiteCard
            label="SITE A"
            site={a}
            siteId={siteAId}
            timestamp={timestamp}
            cacheReady={cacheReady}
            custom={customA}
            onSelectSite={id => { setSiteAId(id); setCustomA(null) }}
            onApplyCustom={setCustomA}
          />
          <SiteCard
            label="SITE B"
            site={b}
            siteId={siteBId}
            timestamp={timestamp}
            cacheReady={cacheReady}
            custom={customB}
            onSelectSite={id => { setSiteBId(id); setCustomB(null) }}
            onApplyCustom={setCustomB}
          />
        </div>

        <section className="viability-panel" aria-labelledby="viability-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">MISSION VIABILITY <span className="divider-slash">//</span> 30-DAY TRADE STUDY</p>
              <h2 id="viability-title">Power &amp; Communications Summary</h2>
            </div>
            <span className="comparison-tag">
              {summaryA.continuousPower === summaryB.continuousPower
                ? 'POWER TIE'
                : summaryA.continuousPower > summaryB.continuousPower
                  ? 'POWER EDGE · SITE A'
                  : 'POWER EDGE · SITE B'}
            </span>
          </div>
          <div className="viability-metrics">
            <ViabilityMetric label="SITE A · SUNLIT SAMPLES" value={`${summaryA.continuousPower.toFixed(1)}%`} detail={`${summaryA.dteHours.toFixed(0)} / 720 DTE hours`} />
            <ViabilityMetric label="SITE B · SUNLIT SAMPLES" value={`${summaryB.continuousPower.toFixed(1)}%`} detail={`${summaryB.dteHours.toFixed(0)} / 720 DTE hours`} />
          </div>
          <div className="mission-verdicts" aria-label="Plain-language mission assessment">
            <VerdictBanner site="SITE A" verdict={verdictA} />
            <VerdictBanner site="SITE B" verdict={verdictB} />
          </div>
          <div className="delta-strip numeric">
            <span>AVERAGE POWER DELTA (A − B) <b className="accent-amber">{(summaryA.power - summaryB.power).toFixed(2)}%</b></span>
            <span>DTE UPTIME DELTA (A − B) <b className="accent-cyan">{(summaryA.comms - summaryB.comms).toFixed(2)} pp</b></span>
          </div>
        </section>

        <aside className="sources-panel">
          <p className="eyebrow">DATA SOURCES &amp; REFERENCES</p>
          <ul>
            <li><b>Topography:</b> Preset 3D terrain uses local 80 m/pixel NASA LRO LOLA patches at true vertical scale; the DEM drives rendered terrain shadows, while analytical visibility still uses each site's horizon profile. Custom positions remain schematic with a flat horizon. See the <a href="https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/FLOAT_IMG/" target="_blank" rel="noreferrer">LOLA data node</a>, <a href="https://quickmap.lroc.asu.edu/" target="_blank" rel="noreferrer">NASA LRO QuickMap</a>, and <a href="https://trek.nasa.gov/moon/" target="_blank" rel="noreferrer">NASA Moon Trek</a>.</li>
            <li><b>Ephemeris:</b> Preset sites use hourly topocentric vectors from the JPL Horizons cache with interpolation; custom positions use analytical Meeus / principal ELP-2000/82 calculations. Compare with <a href="https://ssd.jpl.nasa.gov/horizons/" target="_blank" rel="noreferrer">NASA JPL Horizons</a>.</li>
          </ul>
        </aside>
      </section>

      <footer className="timeline-dock">
        <div className="timeline-dock__inner">
          <div className="timeline-controls">
            <button type="button" className={`button button--play ${playing ? 'is-playing' : ''}`} aria-label={playing ? 'Pause' : 'Play'} onClick={() => setPlaying(value => !value)}>
              {playing ? <Pause size={15} /> : <Play size={15} />}
              <span>{playing ? 'PAUSE' : 'PLAY'}</span>
            </button>
            <span className="dock-time numeric">{formatUtc(timestamp)}</span>
            <div className="timeline-actions">
              <button type="button" className="button button--quiet" onClick={() => setOffset(offset + 24)}>+24H</button>
              <button type="button" className="button button--quiet" onClick={() => setOffset(offset + 168)}>+168H</button>
              <button type="button" className="button button--quiet" onClick={() => { setPlaying(false); setOffset(0) }}>RESET</button>
            </div>
          </div>
          <div className="timeline-slider-row">
            <span className="timeline-bound numeric">T+{offset}H</span>
            <input aria-label="Timeline hour" type="range" min="0" max={MAX_HOURS} step="1" value={offset} onChange={event => setOffset(Number(event.target.value))} className="timeline-slider" />
            <span className="timeline-bound numeric">720H</span>
          </div>
        </div>
      </footer>
    </main>
  )
}

interface SiteCardProps {
  label: string
  site: LandingSite
  siteId: string
  timestamp: Date
  cacheReady: boolean
  custom: { lat: number; lon: number } | null
  onSelectSite: (id: string) => void
  onApplyCustom: (coords: { lat: number; lon: number } | null) => void
}

function SiteCard({ label, site, siteId, timestamp, cacheReady, custom, onSelectSite, onApplyCustom }: SiteCardProps) {
  const [customMode, setCustomMode] = useState(false)
  const [latitude, setLatitude] = useState(String(site.lat))
  const [longitude, setLongitude] = useState(String(site.lon))
  const [customError, setCustomError] = useState('')
  const vectors = useMemo(() => calculateSiteVectors(site, timestamp), [site, timestamp, cacheReady])

  useEffect(() => {
    setLatitude(String(site.lat))
    setLongitude(String(site.lon))
  }, [site.id, site.lat, site.lon])

  const applyCustomCoordinates = () => {
    const lat = latitude.trim() === '' ? NaN : Number(latitude)
    const lon = longitude.trim() === '' ? NaN : Number(longitude)
    if (!Number.isFinite(lat) || lat < -90 || lat > -80) {
      setCustomError('Latitude must be between −90° and −80° for this south-pole evaluator.')
      return
    }
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      setCustomError('Longitude must be between −180° and 180°.')
      return
    }
    setCustomError('')
    onApplyCustom({ lat, lon })
  }

  const countdown = (hours: number | null) => hours === null
    ? 'NO EVENT / 30D'
    : `${Math.floor(hours)}H ${String(Math.round((hours % 1) * 60)).padStart(2, '0')}M`

  return (
    <article className="site-panel">
      <header className="site-panel__header">
        <div className="site-identity">
          <span className="site-index">{label}</span>
          <div>
            <h3>{site.name}</h3>
            <span className="site-coordinates numeric">{site.lat.toFixed(2)}° / {site.lon.toFixed(2)}° <span>LAT / LON</span></span>
          </div>
        </div>
        <div className="site-tools">
          <select aria-label={`${label} landing site`} value={siteId} onChange={event => onSelectSite(event.target.value)}>
            {LANDING_SITES.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select>
          <button type="button" className={`button button--quiet ${customMode ? 'is-active' : ''}`} aria-expanded={customMode} onClick={() => { setCustomMode(value => !value); setCustomError('') }}>
            {customMode ? 'CLOSE COORDS' : 'CUSTOM COORDS'}
          </button>
        </div>
      </header>

      {customMode && (
        <div className="custom-coordinates">
          <label>LATITUDE
            <input aria-label={`${label} custom latitude`} type="number" min="-90" max="-80" step="any" value={latitude} onChange={event => { setLatitude(event.target.value); setCustomError('') }} />
          </label>
          <label>LONGITUDE
            <input aria-label={`${label} custom longitude`} type="number" min="-180" max="180" step="any" value={longitude} onChange={event => { setLongitude(event.target.value); setCustomError('') }} />
          </label>
          <button type="button" className="button button--apply" onClick={applyCustomCoordinates}>APPLY POSITION</button>
          {customError && <p role="alert" className="custom-error">{customError}</p>}
          <p className="custom-note">Custom positions use a flat mathematical horizon; local elevation data is not loaded.</p>
        </div>
      )}

      {custom && <p className="custom-active">CUSTOM POSITION ACTIVE · {site.lat.toFixed(2)}° / {site.lon.toFixed(2)}°</p>}
      {isPsrIceTrap(site) && <p className="risk-flag">PSR / ICE-TRAP ZONE · ZERO DIRECT SUNLIGHT EXPECTED</p>}

      <div className="terrain-frame">
        <LunarTerrain3D site={site} sunAzimuth={vectors.sunAzimuth} sunElevation={vectors.sunElevation} earthAzimuth={vectors.earthAzimuth} earthElevation={vectors.earthElevation} />
      </div>

      <div className="status-row">
        <span className={`status-flag ${vectors.isSunlit ? 'status-flag--good' : 'status-flag--bad'}`}>
          <i />SOLAR POWER · {vectors.isSunlit ? 'ACTIVE' : 'SHADOWED'}
        </span>
        <span className={`status-flag ${vectors.dteCommsActive ? 'status-flag--good' : 'status-flag--bad'}`}>
          <i />DTE COMMS · {vectors.dteCommsActive ? 'LOCKED' : 'BLACKOUT'}
        </span>
        <span className="ephemeris-source">EPHEMERIS · {vectors.ephemerisSource}</span>
      </div>

      <div className="telemetry-grid">
        <Telemetry label="SOLAR ELEVATION / AZIMUTH" value={`${vectors.sunElevation.toFixed(2)}° / ${vectors.sunAzimuth.toFixed(2)}°`} tone="amber" />
        <Telemetry label="ARRAY POWER EFFICIENCY" value={`${vectors.solarPowerEfficiency.toFixed(1)}%`} tone="amber" />
        <Telemetry label="NEXT SUNSET / SUNRISE" value={countdown(vectors.hoursToNextSunEvent)} tone="amber" />
        <Telemetry label="EARTH ELEVATION / AZIMUTH" value={`${vectors.earthElevation.toFixed(2)}° / ${vectors.earthAzimuth.toFixed(2)}°`} tone="cyan" />
        <Telemetry label="NEXT EARTHSET / RISE" value={countdown(vectors.hoursToNextEarthEvent)} tone="cyan" />
      </div>
    </article>
  )
}

function Telemetry({ label, value, tone }: { label: string; value: string; tone: 'amber' | 'cyan' }) {
  return (
    <div className={`telemetry-cell telemetry-cell--${tone}`}>
      <span className="field-label">{label}</span>
      <span className="telemetry-value numeric">{value}</span>
    </div>
  )
}

function ViabilityMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="viability-metric">
      <span className="field-label">{label}</span>
      <strong className="numeric">{value}</strong>
      <span>{detail}</span>
    </div>
  )
}

function VerdictBanner({ site, verdict }: {
  site: string
  verdict: { tone: string; headline: string; detail: string }
}) {
  return (
    <article className={`verdict-banner verdict-banner--${verdict.tone}`}>
      <span className="field-label">{site} · MISSION ASSESSMENT</span>
      <h3>{verdict.headline}</h3>
      <p>{verdict.detail}</p>
    </article>
  )
}

export default App
