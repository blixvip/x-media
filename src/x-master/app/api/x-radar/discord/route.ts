import { nodeRuntime } from "@/x-master/lib/node-runtime";
import { radarDatabase } from '@/x-master/lib/x-radar-monitor';
import { initializeRadarStore } from '@/x-master/lib/x-radar-monitor-store';
import { parseDiscordWebhookUrl } from '@/x-master/lib/x-discord-alerts';

export async function GET() {
  let env:Record<string,unknown>={};
  try{const runtime=(await nodeRuntime());env=runtime.env as Record<string,unknown>;}catch{env=process.env;}
  let heartbeat:{at:string;mode:string}|null=null;
  try{const db=await radarDatabase();await initializeRadarStore(db);const row=await db.prepare("SELECT value FROM x_radar_monitor_state WHERE id='heartbeat'").first<{value:string}>();heartbeat=row?JSON.parse(row.value):null;}catch{/* Status remains explicit. */}
  const active=!!heartbeat&&Date.now()-Date.parse(heartbeat.at)<5*60000;
  return Response.json({configured:env.X_RADAR_ALERTS_ENABLED==='true'&&!!parseDiscordWebhookUrl(env.DISCORD_X_RADAR_WEBHOOK_URL),mode:'background_outbox',monitor:active?heartbeat!.mode:'inactive',last_scan:heartbeat?.at??null}, {headers:{'cache-control':'private, no-store'}});
}
// Only the scheduler owns external delivery; loading the UI never sends alerts.
export async function POST() {return Response.json({detail:'Alerts are delivered by the background monitor, not the browser.'},{status:409});}
