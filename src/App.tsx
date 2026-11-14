import { useEffect, useMemo, useState } from 'react'
import { Download, Pause, Play } from 'lucide-react'
import { LANDING_SITES, type LandingSite } from './data/sites'
import { calculateLunarVectors } from './utils/astronomyEngine'
import { LunarTerrain3D } from './components/LunarTerrain3D'

const START = Date.parse('2026-11-14T12:00:00Z')
const HOUR = 3_600_000
const MAX_HOURS = 720
const isPsrIceTrap = (site: LandingSite) => site.elevationMeters <= -1000 || Math.max(...site.horizonProfile) > 5

function App() {
  const [timestamp, setTimestamp] = useState(() => new Date(START))
  const [siteAId, setSiteAId] = useState('shackleton-rim')
  const [siteBId, setSiteBId] = useState('haworth-crater')
  const [customA, setCustomA] = useState<{lat:number;lon:number}|null>(null)
  const [customB, setCustomB] = useState<{lat:number;lon:number}|null>(null)
  const [playing, setPlaying] = useState(false)
  const offset = Math.max(0, Math.min(MAX_HOURS, Math.round((timestamp.getTime()-START)/HOUR)))
  const setOffset = (hours:number) => setTimestamp(new Date(START+Math.max(0,Math.min(MAX_HOURS,hours))*HOUR))

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => setTimestamp(current => new Date(Math.min(START+MAX_HOURS*HOUR,current.getTime()+2*HOUR))),100)
    return () => window.clearInterval(timer)
  },[playing])

  const siteA = LANDING_SITES.find(site=>site.id===siteAId) ?? LANDING_SITES[0]
  const siteB = LANDING_SITES.find(site=>site.id===siteBId) ?? LANDING_SITES[4]
  const a = customA ? {...siteA,lat:customA.lat,lon:customA.lon,name:`${siteA.name} · Custom`} : siteA
  const b = customB ? {...siteB,lat:customB.lat,lon:customB.lon,name:`${siteB.name} · Custom`} : siteB
  const summarize = (site: LandingSite) => { let power=0,comms=0; for(let h=0;h<=MAX_HOURS;h++){const v=calculateLunarVectors(site.lat,site.lon,new Date(START+h*HOUR),site.horizonProfile);power+=v.solarPowerEfficiency;comms+=Number(v.dteCommsActive)} return {power:power/721,comms:comms/721*100} }
  const sa=summarize(a), sb=summarize(b)
  const exportCsv=()=>{const rows=[['UTC','A Solar Elevation','A Earth Elevation','A Power Efficiency %','A Comms','B Solar Elevation','B Earth Elevation','B Power Efficiency %','B Comms']];for(let h=0;h<=MAX_HOURS;h++){const t=new Date(START+h*HOUR),x=calculateLunarVectors(a.lat,a.lon,t,a.horizonProfile),y=calculateLunarVectors(b.lat,b.lon,t,b.horizonProfile);rows.push([t.toISOString(),x.sunElevation.toFixed(4),x.earthElevation.toFixed(4),x.solarPowerEfficiency.toFixed(2),x.dteCommsActive?'LOCKED':'BLACKOUT',y.sunElevation.toFixed(4),y.earthElevation.toFixed(4),y.solarPowerEfficiency.toFixed(2),y.dteCommsActive?'LOCKED':'BLACKOUT'])}const url=URL.createObjectURL(new Blob([rows.map(r=>r.join(',')).join('\r\n')],{type:'text/csv'}));const link=document.createElement('a');link.href=url;link.download='lunar-navigators-30-day-log.csv';link.click();URL.revokeObjectURL(url)}

  return <main className="min-h-screen bg-slate-950 pb-36 text-slate-100">
    <header className="border-b border-slate-800 px-5 py-5 lg:px-10"><div className="mx-auto flex max-w-[1440px] items-center justify-between"><div><p className="text-[10px] font-bold tracking-[.22em] text-cyan-300">THE LUNAR NAVIGATORS</p><h1 className="mt-1 text-xl font-semibold">South Pole Mission Evaluator</h1></div><button onClick={exportCsv} className="flex items-center gap-2 rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-200"><Download size={14}/> Export 30-day CSV</button></div></header>
    <section className="mx-auto max-w-[1440px] px-5 py-7 lg:px-10"><div className="mb-5"><h2 className="text-2xl font-semibold">Landing site comparison</h2><p className="mt-1 text-sm text-slate-400">Live lunar illumination and Earth visibility · {timestamp.toISOString().replace('T',' ').replace('.000Z',' UTC')}</p></div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2"><SiteCard label="SITE A" site={a} timestamp={timestamp} siteId={siteAId} setSiteId={id=>{setSiteAId(id);setCustomA(null)}} custom={customA} setCustom={setCustomA}/><SiteCard label="SITE B" site={b} timestamp={timestamp} siteId={siteBId} setSiteId={id=>{setSiteBId(id);setCustomB(null)}} custom={customB} setCustom={setCustomB}/></div>
      <div className="my-5 rounded-xl border border-slate-700 bg-slate-900 p-4"><div className="text-xs font-bold text-cyan-200">30-DAY COMPARISON · HOURLY EPHEMERIS SAMPLES</div><div className="mt-2 grid gap-2 text-sm text-slate-300 sm:grid-cols-2"><div>Average power delta (A − B): <b>{(sa.power-sb.power).toFixed(2)}%</b></div><div>Comms uptime delta (A − B): <b>{(sa.comms-sb.comms).toFixed(2)} percentage points</b></div></div></div>
    </section>
    <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/95 px-5 py-3 backdrop-blur-xl"><div className="mx-auto max-w-[1440px]"><div className="mb-2 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><button aria-label={playing?'Pause':'Play'} onClick={()=>setPlaying(value=>!value)} className="grid h-9 w-9 place-items-center rounded-full border border-cyan-400/40 bg-cyan-400/10 text-cyan-300">{playing?<Pause size={15}/>:<Play size={15}/>}</button><span className="font-mono text-xs text-slate-200">{timestamp.toISOString().replace('T',' ').replace('.000Z',' UTC')}</span></div><div className="flex gap-2">{[['+24h',24],['+168h',168]].map(([text,hours])=><button key={text} onClick={()=>setOffset(offset+Number(hours))} className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-cyan-400">{text}</button>)}<button onClick={()=>{setPlaying(false);setOffset(0)}} className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-cyan-400">Reset</button></div></div><div className="flex items-center gap-3"><span className="text-[10px] text-slate-500">T+{offset}h</span><input aria-label="Timeline hour" type="range" min="0" max={MAX_HOURS} step="1" value={offset} onChange={event=>setOffset(Number(event.target.value))} className="timeline-slider h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-slate-800"/><span className="text-[10px] text-slate-500">720h</span></div></div></footer>
  </main>
}

function SiteCard({label,site,timestamp,siteId,setSiteId,custom,setCustom}:{label:string;site:LandingSite;timestamp:Date;siteId:string;setSiteId:(id:string)=>void;custom:{lat:number;lon:number}|null;setCustom:(coords:{lat:number;lon:number}|null)=>void}) {
  const [customMode,setCustomMode]=useState(false)
  const [lat,setLat]=useState(String(site.lat));const [lon,setLon]=useState(String(site.lon))
  const vectors=useMemo(()=>calculateLunarVectors(site.lat,site.lon,timestamp,site.horizonProfile),[site,timestamp])
  const countdown=(hours:number|null)=>hours===null?'—':`${Math.floor(hours)}h ${String(Math.round((hours%1)*60)).padStart(2,'0')}m`
  return <article className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-4"><span className="text-xs font-bold tracking-widest text-cyan-300">{label}</span><select aria-label={`${label} landing site`} value={siteId} onChange={event=>setSiteId(event.target.value)} className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100">{LANDING_SITES.map(option=><option key={option.id} value={option.id}>{option.name}</option>)}</select><button onClick={()=>setCustomMode(value=>!value)} className="rounded-md border border-slate-700 px-3 py-2 text-xs text-slate-300">{customMode?'Hide custom coords':'Custom coordinates'}</button></div>
    {customMode&&<div className="grid grid-cols-2 gap-2 border-b border-slate-800 p-3"><label className="text-[10px] text-slate-400">Latitude<input type="number" min="-90" max="-80" value={lat} onChange={e=>setLat(e.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2 text-xs text-white"/></label><label className="text-[10px] text-slate-400">Longitude<input type="number" min="-180" max="180" value={lon} onChange={e=>setLon(e.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2 text-xs text-white"/></label><button onClick={()=>setCustom({lat:Number(lat),lon:Number(lon)})} className="col-span-2 rounded bg-cyan-400 px-3 py-2 text-xs font-semibold text-slate-950">Apply coordinates</button></div>}
    {custom&&<div className="px-4 pt-3 text-[10px] text-cyan-200">CUSTOM POSITION · {site.lat.toFixed(2)}°, {site.lon.toFixed(2)}°</div>}
    {isPsrIceTrap(site)&&<div className="mx-4 mt-3 inline-flex rounded-full border border-amber-300/50 bg-amber-300/15 px-3 py-1.5 text-[9px] font-bold text-amber-200">PSR / Ice-Trap Zone: Zero Direct Sunlight Expected</div>}
    <div className="h-[330px]"><LunarTerrain3D site={site} sunAzimuth={vectors.sunAzimuth} sunElevation={vectors.sunElevation} earthAzimuth={vectors.earthAzimuth} earthElevation={vectors.earthElevation}/></div>
    <div className="flex flex-wrap gap-2 px-4 pt-4"><Badge active={vectors.isSunlit} yes="SOLAR POWER: ACTIVE" no="SOLAR POWER: SHADOWED"/><Badge active={vectors.dteCommsActive} yes="DTE COMMS: LOCKED" no="DTE COMMS: BLACKOUT"/></div>
    <div className="grid grid-cols-2 gap-2 p-4">{[["SOLAR ELEVATION / AZIMUTH",`${vectors.sunElevation.toFixed(2)}° / ${vectors.sunAzimuth.toFixed(2)}°`],["ARRAY POWER EFFICIENCY",`${vectors.solarPowerEfficiency.toFixed(1)}%`],["EARTH ELEVATION / AZIMUTH",`${vectors.earthElevation.toFixed(2)}° / ${vectors.earthAzimuth.toFixed(2)}°`],["NEXT SUNSET",countdown(vectors.hoursToNextSunEvent)],["NEXT EARTHSET",countdown(vectors.hoursToNextEarthEvent)]].map(([title,value])=><div key={title} className="rounded-lg border border-slate-800 bg-slate-950/70 p-3"><div className="text-[9px] tracking-wider text-slate-500">{title}</div><div className="mt-1 font-mono text-xs text-slate-100">{value}</div></div>)}</div>
  </article>
}

function Badge({active,yes,no}:{active:boolean;yes:string;no:string}){return <span className={`rounded-full px-3 py-1.5 text-[9px] font-bold tracking-wider ${active?'bg-emerald-300 text-slate-950':'bg-rose-400 text-slate-950'}`}>{active?yes:no}</span>}

export default App
