import type { LaunchEvent } from "./x-growth-copilot";

export type DiscordLaunchMessage = {
  content: string;
  allowed_mentions: { parse: [] };
  embeds: Array<{
    title: string;
    description: string;
    url: string;
    color: number;
    fields: Array<{ name: string; value: string; inline: boolean }>;
    footer: { text: string };
  }>;
};

function safeDiscordText(value: string, maximum: number): string {
  return value
    .replace(/@/g, "＠")
    .split("")
    .map((character) => character >= " " && character !== "\u007f" ? character : " ")
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

export function parseDiscordWebhookUrl(value: unknown): URL | null {
  if (typeof value !== "string" || value.length > 500) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "discord.com" || url.username || url.password || url.search || url.hash) return null;
    if (!/^\/api\/webhooks\/\d{5,25}\/[A-Za-z0-9._-]{6,200}$/.test(url.pathname)) return null;
    return url;
  } catch {
    return null;
  }
}

export function discordLaunchMessage(event: LaunchEvent): DiscordLaunchMessage {
  const evidence = event.evidence.find((item) => item.official) || event.evidence[0];
  if (!evidence) throw new Error("Launch alert requires evidence.");
  const label = event.confirmation === "official" ? "OFFICIAL" : event.confirmation === "corroborated" ? "CORROBORATED" : "UNVERIFIED";
  const entity = safeDiscordText(event.entity, 120);
  const lifecycle = event.lifecycle === "launching" ? "Launching now" : event.lifecycle === "anticipated_unverified" ? "Time-bound chatter; verify before posting" : "Confirmed";
  return {
    content: `[${label}] Launch watch: **${entity}**`,
    allowed_mentions: { parse: [] },
    embeds: [{
      title: entity,
      description: safeDiscordText(`${lifecycle}. ${evidence.summary}`, 500),
      url: evidence.url,
      color: event.confirmation === "official" ? 0x52dfa0 : 0xffb74d,
      fields: [
        { name: "Importance", value: String(event.importance), inline: true },
        { name: "Confidence", value: String(event.confidence), inline: true },
        { name: "Evidence", value: `${event.evidence.length} ${event.evidence.length === 1 ? "source" : "sources"}`, inline: true },
      ],
      footer: { text: "X Growth Copilot · human review required" },
    }],
  };
}
