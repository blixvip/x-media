import { nodeRuntime } from "@/x-master/lib/node-runtime";
import type { D1DatabaseLike } from './x-automation-store.ts';
import type { GrowthSignal } from './x-growth-copilot.ts';
import { buildRadarEvents, measuredGrowth, type MetricSample } from './x-radar-awareness.ts';
import { initializeRadarStore, listRadarEvents, persistRadarEvents, readMetricSamples, saveMetricSamples } from './x-radar-monitor-store.ts';

let localDatabase:Promise<D1DatabaseLike>|undefined;
export async function radarDatabase():Promise<D1DatabaseLike> {
  try {const runtime=(await nodeRuntime());if(runtime.env.DB)return runtime.env.DB as unknown as D1DatabaseLike;}catch{/* Node local runtime. */}
  localDatabase ??= (async()=>{
    const {mkdir}=await import('node:fs/promises');const {resolve,dirname}=await import('node:path');
    const path=process.env.X_RADAR_LOCAL_STATE_PATH || resolve('work','radar-awareness.sqlite');
    await mkdir(dirname(path),{recursive:true});
    const {openLocalRadarDatabase}=await import('./x-radar-local-db.ts');return openLocalRadarDatabase(path);
  })();
  return localDatabase;
}
export type RadarMonitorInput={signals:GrowthSignal[];trends:Array<{name:string;rank:number}>;keywords:string[];observedAt?:string};
export async function updateRadarAwareness(input:RadarMonitorInput,db:D1DatabaseLike,now=new Date()) {
  await initializeRadarStore(db);
  const old=await readMetricSamples(db);const samples=new Map<string,MetricSample>();const growth=new Map();
  const at=input.observedAt&&Number.isFinite(Date.parse(input.observedAt))?Math.min(now.getTime(),Date.parse(input.observedAt)):now.getTime();
  for(const post of input.signals.filter(p=>p.source==='x')) {
    const metrics=post.observed_metrics;
    // Missing fields are unknown. Never manufacture a rate from an incomplete snapshot.
    if(!metrics || ![metrics.likes,metrics.replies,metrics.reposts].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0))continue;
    const sample={at,value:metrics.likes!+metrics.replies!+metrics.reposts!};samples.set(post.id,sample);
    growth.set(post.id,measuredGrowth(old.get(post.id),sample));
  }
  const events=buildRadarEvents(input.signals,input.trends,input.keywords,now,growth);
  await persistRadarEvents(db,events,now);await saveMetricSamples(db,samples);
  return {events:await listRadarEvents(db,now),storage:'durable' as const,checked_at:now.toISOString()};
}
