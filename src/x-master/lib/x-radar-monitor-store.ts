import type { D1DatabaseLike } from './x-automation-store.ts';
import { notificationKey, type RadarEvent, type MetricSample } from './x-radar-awareness.ts';

export const RADAR_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS x_radar_events (id TEXT PRIMARY KEY, payload TEXT NOT NULL, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL, importance INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_radar_events_last_seen ON x_radar_events(last_seen)`,
  `CREATE TABLE IF NOT EXISTS x_radar_outbox (id TEXT PRIMARY KEY, payload TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL, lease_until INTEGER NOT NULL DEFAULT 0, claim TEXT, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_radar_outbox_due ON x_radar_outbox(state,next_attempt)`,
  `CREATE TABLE IF NOT EXISTS x_radar_samples (id TEXT PRIMARY KEY, observed_at INTEGER NOT NULL, value INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS x_radar_monitor_state (id TEXT PRIMARY KEY, value TEXT NOT NULL)`,
];
export async function initializeRadarStore(db: D1DatabaseLike) { for(const sql of RADAR_SCHEMA) await db.prepare(sql).run(); }
export async function listRadarEvents(db: D1DatabaseLike,now = new Date()): Promise<RadarEvent[]> {
  const rows = await db.prepare('SELECT payload,first_seen,last_seen FROM x_radar_events WHERE last_seen >= ? ORDER BY importance DESC,last_seen DESC LIMIT 100').bind(now.getTime()-7*86400000).all<{payload:string;first_seen:number;last_seen:number}>();
  return (rows.results??[]).flatMap(row=>{try {const e=JSON.parse(row.payload) as RadarEvent;return Date.parse(e.published_at)>=now.getTime()-7*86400000?[{...e,first_seen_at:new Date(row.first_seen).toISOString(),last_seen_at:new Date(row.last_seen).toISOString()}]:[];}catch{return [];}});
}
export async function persistRadarEvents(db: D1DatabaseLike, events: RadarEvent[], now = new Date()) {
  for (const event of events) {
    const previous = await db.prepare('SELECT payload FROM x_radar_events WHERE id = ?').bind(event.id).first<{payload:string}>();
    const before = previous ? JSON.parse(previous.payload) as RadarEvent : undefined;
    // Partial source failures must not downgrade an already-confirmed story.
    const next = before?.confirmation==='official' && event.confirmation!=='official' ? before : event;
    await db.prepare(`INSERT INTO x_radar_events (id,payload,first_seen,last_seen,importance) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,last_seen=excluded.last_seen,importance=excluded.importance`).bind(next.id,JSON.stringify(next),now.getTime(),now.getTime(),next.importance).run();
    if (next.alert && Date.parse(next.published_at)>=now.getTime()-48*3600000) await db.prepare('INSERT OR IGNORE INTO x_radar_outbox (id,payload,next_attempt,created_at) VALUES (?,?,?,?)').bind(notificationKey(next),JSON.stringify(next),now.getTime(),now.getTime()).run();
  }
  const cutoff=now.getTime()-7*86400000;
  await db.batch([
    db.prepare('DELETE FROM x_radar_events WHERE last_seen < ?').bind(cutoff),
    db.prepare('DELETE FROM x_radar_samples WHERE observed_at < ?').bind(cutoff),
    db.prepare('DELETE FROM x_radar_outbox WHERE created_at < ?').bind(cutoff),
  ]);
}
export async function readMetricSamples(db:D1DatabaseLike) {
  const rows=await db.prepare('SELECT id,observed_at,value FROM x_radar_samples').all<{id:string;observed_at:number;value:number}>();
  return new Map((rows.results??[]).map(row=>[row.id,{at:row.observed_at,value:row.value} satisfies MetricSample]));
}
export async function saveMetricSamples(db:D1DatabaseLike,samples:Map<string,MetricSample>) {
  const statements=[...samples].slice(0,500).map(([id,s])=>db.prepare('INSERT INTO x_radar_samples (id,observed_at,value) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET observed_at=excluded.observed_at,value=excluded.value WHERE excluded.observed_at-x_radar_samples.observed_at >= 60000').bind(id,s.at,s.value));
  for(let i=0;i<statements.length;i+=50)await db.batch(statements.slice(i,i+50));
}
export async function dispatchRadarOutbox(db:D1DatabaseLike,send:(event:RadarEvent)=>Promise<void>,now=new Date()) {
  const rows=await db.prepare("SELECT id,payload,attempts FROM x_radar_outbox WHERE state != 'sent' AND next_attempt <= ? AND lease_until <= ? AND created_at >= ? ORDER BY created_at,id LIMIT 10").bind(now.getTime(),now.getTime(),now.getTime()-48*3600000).all<{id:string;payload:string;attempts:number}>();
  let sent=0;let failed=0;
  for(const row of rows.results??[]) {
    const claim=crypto.randomUUID();
    const result=await db.prepare("UPDATE x_radar_outbox SET state='sending',claim=?,lease_until=? WHERE id=? AND state != 'sent' AND lease_until <= ?").bind(claim,now.getTime()+60000,row.id,now.getTime()).run();
    if(!result.meta?.changes)continue;
    try {
      await send(JSON.parse(row.payload));
      await db.prepare("UPDATE x_radar_outbox SET state='sent',lease_until=0 WHERE id=? AND claim=?").bind(row.id,claim).run();sent++;
    }catch{
      await db.prepare("UPDATE x_radar_outbox SET state='pending',attempts=attempts+1,lease_until=0,next_attempt=? WHERE id=? AND claim=?").bind(now.getTime()+Math.min(3600000,60000*2**Math.min(row.attempts,6)),row.id,claim).run();failed++;
    }
  }
  return {sent,failed};
}
