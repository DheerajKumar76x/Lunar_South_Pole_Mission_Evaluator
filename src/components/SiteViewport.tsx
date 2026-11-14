import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, MapPin } from 'lucide-react'
import { LANDING_SITES, type LandingSite } from '../data/sites'
import { calculateLunarVectors } from '../utils/astronomyEngine'

interface SiteViewportProps {
  site: LandingSite
  onSelectSite: (site: LandingSite) => void
  onCustomCoords: (lat: number, lon: number) => void
  timestamp: Date
}

const formatAngle = (angle: number) => `${angle.toFixed(1)}°`
const formatCountdown = (hours: number | null) => {
  if (hours === null) return 'No event in 30 days'
  const totalMinutes = Math.max(0, Math.round(hours * 60))
  return `${Math.floor(totalMinutes / 60)}h ${String(totalMinutes % 60).padStart(2, '0')}m`
}

function polarPoint(azimuth: number, elevation: number, radius: number) {
  const distance = radius * (90 - Math.max(-10, Math.min(90, elevation))) / 90
  const radians = azimuth * Math.PI / 180
  return { x: 120 + distance * Math.sin(radians), y: 120 - distance * Math.cos(radians) }
}

function PolarSkyPlot({ site, sunAzimuth, sunElevation, earthAzimuth, earthElevation }: {
  site: LandingSite
  sunAzimuth: number
  sunElevation: number
  earthAzimuth: number
  earthElevation: number
}) {
  const horizon = site.horizonProfile.map((elevation, index) => polarPoint(index * 10, elevation, 94))
  const outer = site.horizonProfile.map((_, index) => polarPoint(index * 10, 0, 94))
  const terrainPath = [...horizon, ...outer.reverse()].map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
  const sun = polarPoint(sunAzimuth, sunElevation, 94)
  const earth = polarPoint(earthAzimuth, earthElevation, 94)

  return <svg viewBox="0 0 240 240" role="img" aria-label="Polar sky plot with terrain horizon and live Sun and Earth positions" className="mx-auto block h-[260px] w-full max-w-[300px]">
    <defs><radialGradient id={`sky-${site.id}`}><stop offset="0%" stopColor="#0e2438"/><stop offset="100%" stopColor="#020617"/></radialGradient><filter id={`glow-${site.id}`} x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <circle cx="120" cy="120" r="94" fill={`url(#sky-${site.id})`} stroke="#475569" strokeWidth="1"/>
    <circle cx="120" cy="120" r="47" fill="none" stroke="#334155" strokeDasharray="2 4"/><circle cx="120" cy="120" r="70.5" fill="none" stroke="#334155" strokeDasharray="2 4"/>
    <path d="M120 22V218 M22 120H218 M50.7 50.7L189.3 189.3 M189.3 50.7L50.7 189.3" stroke="#1e293b" strokeWidth=".7"/>
    <polygon points={terrainPath} fill="#64748b" fillOpacity=".65" stroke="#94a3b8" strokeOpacity=".85" strokeWidth="1.1"/>
    <text x="120" y="14" textAnchor="middle" fill="#94a3b8" fontSize="8">N · 0° AZ</text><text x="120" y="236" textAnchor="middle" fill="#64748b" fontSize="7">S</text><text x="120" y="75" textAnchor="middle" fill="#64748b" fontSize="7">45°</text><text x="120" y="122" textAnchor="middle" fill="#e2e8f0" fontSize="7">90°</text><text x="17" y="123" textAnchor="middle" fill="#64748b" fontSize="7">W</text><text x="223" y="123" textAnchor="middle" fill="#64748b" fontSize="7">E</text>
    <line x1="120" y1="120" x2={sun.x} y2={sun.y} stroke="#fbbf24" strokeOpacity=".42" strokeWidth="1"/><circle cx={sun.x} cy={sun.y} r="4.5" fill="#fbbf24" stroke="#fef3c7" strokeWidth="1" filter={`url(#glow-${site.id})`}/>
    <line x1="120" y1="120" x2={earth.x} y2={earth.y} stroke="#22d3ee" strokeOpacity=".4" strokeWidth="1"/><circle cx={earth.x} cy={earth.y} r="4.5" fill="#22d3ee" stroke="#cffafe" strokeWidth="1" filter={`url(#glow-${site.id})`}/>
  </svg>
}

function TelemetryCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="min-h-[88px] rounded-lg border border-slate-800 bg-slate-950/70 p-3"><div className="mb-2 text-[9px] font-semibold tracking-[.13em] text-slate-500">{title}</div><div className="font-mono text-[12px] leading-relaxed text-slate-200">{children}</div></div>
}

export function SiteViewport({ site, onSelectSite, onCustomCoords, timestamp }: SiteViewportProps) {
  const [customMode, setCustomMode] = useState(false)
  const [latitude, setLatitude] = useState(String(site.lat))
  const [longitude, setLongitude] = useState(String(site.lon))
  const [coordsError, setCoordsError] = useState('')

  useEffect(() => {
    setLatitude(String(site.lat))
    setLongitude(String(site.lon))
    setCustomMode(site.id.endsWith('-custom'))
  }, [site.id, site.lat, site.lon])

  const vectors = useMemo(() => calculateLunarVectors(site.lat, site.lon, timestamp, site.horizonProfile), [site, timestamp])
  const earthMargin = vectors.earthElevation - vectors.earthHorizonLimit
  const moonTrekUrl = `https://trek.nasa.gov/moon/#v=0.1&x=${site.lon}&y=${site.lat}&z=8&p=moon&l=eqc&locale=en` 

  const applyCustomCoordinates = () => {
    const lat = Number(latitude)
    const lon = Number(longitude)
    if (!Number.isFinite(lat) || lat < -90 || lat > -80) {
      setCoordsError('Latitude must be between −90° and −80°.')
      return
    }
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      setCoordsError('Longitude must be between −180° and 180°.')
      return
    }
    setCoordsError('')
    onCustomCoords(lat, lon)
  }

  return <article className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60 shadow-[0_18px_50px_-36px_rgba(0,0,0,.9)]">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2"><MapPin size={15} className="shrink-0 text-cyan-300"/><div className="min-w-0"><h2 className="truncate text-sm font-semibold text-slate-100">{site.name}</h2><p className="font-mono text-[9px] text-slate-500">{site.lat.toFixed(2)}°, {site.lon.toFixed(2)}°</p></div></div>
      <div className="flex flex-wrap items-center gap-2">
        {!customMode && <select aria-label="Choose lunar landing site" value={site.id} onChange={(event)=>{const selected=LANDING_SITES.find(({id})=>id===event.target.value);if(selected)onSelectSite(selected)}} className="max-w-[190px] rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-[10px] text-slate-200 outline-none focus:border-cyan-400"><option value={site.id}>{site.name}</option>{LANDING_SITES.filter(({id})=>id!==site.id).map(option=><option key={option.id} value={option.id}>{option.name}</option>)}</select>}
        <button type="button" aria-pressed={customMode} onClick={()=>{setCustomMode(value=>!value);setCoordsError('')}} className={`rounded-md border px-2.5 py-2 text-[10px] font-medium ${customMode?'border-cyan-400 bg-cyan-400/15 text-cyan-200':'border-slate-700 text-slate-300 hover:border-slate-500'}`}>Custom Coordinates</button>
        <a href={moonTrekUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 px-2.5 py-2 text-[10px] text-slate-300 hover:border-cyan-400/60 hover:text-cyan-200">Verify in NASA Moon Trek <ExternalLink size={11}/></a>
      </div>
    </header>

    {customMode && <div className="grid grid-cols-1 gap-2 border-b border-slate-800 bg-slate-950/50 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <label className="text-[9px] font-semibold tracking-widest text-slate-500">LATITUDE<input aria-label="Custom latitude" type="number" min="-90" max="-80" step="0.01" value={latitude} onChange={event=>setLatitude(event.target.value)} className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-2 font-mono text-xs text-slate-100 outline-none focus:border-cyan-400"/></label>
      <label className="text-[9px] font-semibold tracking-widest text-slate-500">LONGITUDE<input aria-label="Custom longitude" type="number" min="-180" max="180" step="0.01" value={longitude} onChange={event=>setLongitude(event.target.value)} className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-2 font-mono text-xs text-slate-100 outline-none focus:border-cyan-400"/></label>
      <button type="button" onClick={applyCustomCoordinates} className="rounded-md bg-cyan-400 px-3 py-2 text-[10px] font-bold text-slate-950 hover:bg-cyan-300">Apply coordinates</button>
      {coordsError && <p role="alert" className="text-[10px] text-rose-300 sm:col-span-3">{coordsError}</p>}
    </div>}

    <div className="flex flex-wrap gap-2 border-b border-slate-800 px-4 py-3">
      <span className={`rounded-full border px-3 py-1.5 text-[9px] font-extrabold tracking-[.1em] ${vectors.isSunlit?'border-amber-300/60 bg-amber-300 text-slate-950':'border-indigo-300/50 bg-indigo-300 text-slate-950'}`}>SOLAR POWER: {vectors.isSunlit?'ACTIVE':'SHADOWED'} · {vectors.solarPowerEfficiency.toFixed(1)}%</span>
      <span className={`rounded-full border px-3 py-1.5 text-[9px] font-extrabold tracking-[.1em] ${vectors.dteCommsActive?'border-cyan-200 bg-cyan-300 text-slate-950':'border-slate-500 bg-slate-700 text-slate-100'}`}>DTE COMMS: {vectors.dteCommsActive?'LOCKED':'BLACKOUT'}</span>
    </div>

    <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(250px,.92fr)]">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        <TelemetryCard title="SOLAR · ELEV / AZIM">{formatAngle(vectors.sunElevation)} / {formatAngle(vectors.sunAzimuth)}<br/><span className="text-amber-300">ARRAY INCIDENCE {vectors.solarPowerEfficiency.toFixed(1)}%</span></TelemetryCard>
        <TelemetryCard title="EARTH · ELEV / AZIM">{formatAngle(vectors.earthElevation)} / {formatAngle(vectors.earthAzimuth)}<br/><span className={earthMargin>0?'text-cyan-300':'text-rose-300'}>LINK MARGIN {earthMargin>=0?'+':''}{earthMargin.toFixed(2)}° · {vectors.dteCommsActive?'LOCKED':'BLACKOUT'}</span></TelemetryCard>
        <TelemetryCard title={`NEXT ${vectors.isSunlit?'SUNSET':'SUNRISE'}`}>{formatCountdown(vectors.hoursToNextSunEvent)}</TelemetryCard>
        <TelemetryCard title={`NEXT ${vectors.dteCommsActive?'EARTHSET':'EARTHRISE'}`}>{formatCountdown(vectors.hoursToNextEarthEvent)}</TelemetryCard>
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-2 pb-2 pt-3"><div className="flex items-center justify-between px-2"><span className="text-[9px] font-semibold tracking-[.15em] text-slate-400">POLAR SKY & HORIZON</span><span className="font-mono text-[8px] text-slate-600">0° HORIZON · 90° ZENITH</span></div><PolarSkyPlot site={site} sunAzimuth={vectors.sunAzimuth} sunElevation={vectors.sunElevation} earthAzimuth={vectors.earthAzimuth} earthElevation={vectors.earthElevation}/><div className="flex justify-center gap-4 text-[9px] font-mono"><span className="flex items-center gap-1.5 text-amber-300"><i className="h-2 w-2 rounded-full bg-amber-300"/> SUN</span><span className="flex items-center gap-1.5 text-cyan-300"><i className="h-2 w-2 rounded-full bg-cyan-300"/> EARTH</span><span className="flex items-center gap-1.5 text-slate-400"><i className="h-2 w-2 rounded-sm bg-slate-500"/> TERRAIN MASK</span></div></div>
    </div>
    <div className="border-t border-slate-800 px-4 py-2 text-right font-mono text-[9px] text-slate-600">UTC {timestamp.toISOString().replace('T',' ').replace('.000Z','Z')}</div>
  </article>
}
