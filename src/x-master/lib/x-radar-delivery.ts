import { parseDiscordWebhookUrl } from './x-discord-alerts.ts';
import { dispatchRadarOutbox, initializeRadarStore } from './x-radar-monitor-store.ts';
import type { D1DatabaseLike } from './x-automation-store.ts';
import type { RadarEvent } from './x-radar-awareness.ts';

export function radarDiscordMessage(event:RadarEvent) {
  const clean=(text:string)=>Array.from(text.replace(/@/g,'＠'),char=>char.charCodeAt(0)<32?' ':char).join('').slice(0,400);
  return {content:`[${event.kind.toUpperCase()}] ${clean(event.title)}`,allowed_mentions:{parse:[]},embeds:[{title:clean(event.title),url:event.url,description:clean(event.summary),fields:[{name:'Why this alert',value:clean(event.why)},{name:'Evidence',value:`${event.author_count} authors in our sample · ${event.confirmation}`}]}]};
}
export async function deliverRadarAlerts(db:D1DatabaseLike,env:{X_RADAR_ALERTS_ENABLED?:string;DISCORD_X_RADAR_WEBHOOK_URL?:string}) {
  const url=parseDiscordWebhookUrl(env.DISCORD_X_RADAR_WEBHOOK_URL);
  if(env.X_RADAR_ALERTS_ENABLED!=='true'||!url)return {sent:0,failed:0,enabled:false};
  await initializeRadarStore(db);
  return {...await dispatchRadarOutbox(db,async event=>{
    const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(radarDiscordMessage(event)),redirect:'error',signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error('Delivery failed');
  }),enabled:true};
}
