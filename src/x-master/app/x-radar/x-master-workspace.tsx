"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import type { AutomationQueueItem } from "../../lib/x-automation-store";
import { buildXMasterIntent, summarizeXMasterPerformance } from "../../lib/x-master-client";
import type { ContentFormat, GeneratedArtifact } from "../../lib/x-content-engine";
import type { ManualTweetDraft } from "../../lib/x-draft-workspace";
import type { MediaJob, XMasterDraft } from "../../lib/x-master-store";
import type { StyleRecord } from "../../lib/x-style-memory";
import styles from "./x-radar.module.css";

const FORMATS: Array<{ id: ContentFormat; label: string; hint: string }> = [
  { id: "x_post", label: "Post", hint: "One sharp standalone take" },
  { id: "x_reply", label: "Reply", hint: "Add useful context to a post" },
  { id: "x_quote", label: "Quote", hint: "Frame the source with your angle" },
  { id: "thread", label: "Thread", hint: "Develop the idea step by step" },
  { id: "article", label: "Article", hint: "Build a substantial evidence-led draft" },
  { id: "meme", label: "Meme", hint: "Generate a visual concept and caption" },
];
const TONES = ["direct", "just typing", "funny", "calm", "persuasive", "educational"];

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...init, headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers } });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "X Master request failed.");
  return payload;
}

export function XMasterCreate({ connected }: { connected: boolean }) {
  const [source, setSource] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [format, setFormat] = useState<ContentFormat>("x_post");
  const [tone, setTone] = useState("direct");
  const [artifact, setArtifact] = useState<GeneratedArtifact | null>(null);
  const [memory, setMemory] = useState<{ examples: number; rejections: number } | null>(null);
  const [state, setState] = useState<"idle" | "working" | "saving">("idle");
  const [message, setMessage] = useState("");

  async function generate() {
    if (!source.trim()) { setMessage("Add a topic, source post, transcript, or rough idea first."); return; }
    setState("working"); setMessage(""); setArtifact(null);
    try {
      const result = await jsonRequest<{ artifact: GeneratedArtifact; memory: { examples: number; rejections: number } }>("/api/x-master/generate", { method: "POST", body: JSON.stringify({ format, source_text: source, ...(sourceUrl.trim() ? { source_url: sourceUrl } : {}), tone }) });
      setArtifact(result.artifact); setMemory(result.memory);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Generation failed."); }
    finally { setState("idle"); }
  }

  async function saveDraft() {
    if (!artifact) return;
    setState("saving"); setMessage("");
    try {
      await jsonRequest("/api/x-master/drafts", { method: "POST", body: JSON.stringify({ source_text: source, source_url: sourceUrl || undefined, body: artifact.primary, format: artifact.format.replace(/^x_/, ""), state: "ready" }) });
      window.dispatchEvent(new Event("x-master:drafts-changed"));
      setMessage("Draft saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save draft."); }
    finally { setState("idle"); }
  }

  return <>
    <section className={styles.viewIntro}><div><p className={styles.eyebrow}>WRITE A POST</p><h1>Write a post</h1><p>Turn a trend, X post, TikTok transcript, or raw thought into content trained on your saved voice.</p></div><span className={styles.resultCount}>OpenAI + voice memory</span></section>
    <div className={styles.masterStudio}>
      <section className={styles.masterComposer}>
        <header><div><p className={styles.eyebrow}>SOURCE</p><h2>Start with an idea</h2></div><span>{source.length} / 12,000</span></header>
        <label><span>Topic, post, transcript, or rough idea</span><textarea rows={10} maxLength={12_000} value={source} onChange={(event) => setSource(event.target.value)} placeholder="Paste the signal or write the thought you want to develop…" /></label>
        <label><span>Source X URL <small>optional</small></span><input type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://x.com/creator/status/…" /></label>
        <details><summary>Format and writing style</summary><div className={styles.masterOptions}><label><span>Format</span><select value={format} onChange={(event) => setFormat(event.target.value as ContentFormat)}>{FORMATS.map((item) => <option key={item.id} value={item.id}>{item.label} — {item.hint}</option>)}</select></label><label><span>Voice</span><select value={tone} onChange={(event) => setTone(event.target.value)}>{TONES.map((item) => <option key={item}>{item}</option>)}</select></label></div>
        </details>
        {!connected && <p className={styles.masterNotice}>Connect X in Settings to unlock your private creator workspace.</p>}
        <button className={styles.masterPrimary} type="button" disabled={!connected || state !== "idle" || !source.trim()} onClick={() => void generate()}>{state === "working" ? "Building the angle…" : "Generate draft"}</button>
        {message && <p className={styles.masterMessage} role="status">{message}</p>}
      </section>
      <aside className={styles.masterOutput}>
        <header><div><p className={styles.eyebrow}>OUTPUT</p><h2>{artifact ? FORMATS.find((item) => item.id === artifact.format)?.label : "Your next post"}</h2></div>{artifact && <span>{artifact.generator_version === "openrouter-fallback-v1" ? "Fallback" : "OpenAI"}</span>}</header>
        {!artifact ? <div className={styles.masterEmpty}><strong>Ready when the source is.</strong><p>Your saved examples shape the voice. Rejected drafts tell the engine what to avoid.</p></div> : <>
          {artifact.image_url && <Image className={styles.masterGeneratedImage} src={artifact.image_url} alt="Generated meme draft" width={1024} height={1024} unoptimized />}
          <textarea rows={artifact.format === "article" ? 18 : 8} value={artifact.article_markdown ?? artifact.primary} onChange={(event) => setArtifact((current) => current ? { ...current, ...(current.format === "article" ? { article_markdown: event.target.value } : { primary: event.target.value }) } : current)} />
          <div className={styles.masterOutputMeta}><span>{artifact.primary.length} chars</span><span>{memory?.examples ?? 0} examples</span><span>{memory?.rejections ?? 0} avoids</span><span>Review required</span></div>
          {artifact.alternatives.length > 0 && <details><summary>{artifact.alternatives.length} alternate angles</summary>{artifact.alternatives.map((item) => <article key={item.angle}><strong>{item.angle}</strong><p>{item.text}</p></article>)}</details>}
          <div className={styles.masterActions}><button type="button" disabled={state !== "idle"} onClick={() => void saveDraft()}>{state === "saving" ? "Saving…" : "Save draft"}</button><button type="button" onClick={() => void navigator.clipboard.writeText(artifact.article_markdown ?? artifact.primary)}>Copy</button>{artifact.primary.length <= 280 && <a href={buildXMasterIntent(artifact.primary, artifact.format, sourceUrl || undefined)} target="_blank" rel="noreferrer">Review on X ↗</a>}</div>
        </>}
      </aside>
    </div>
  </>;
}

export function XMasterLibrary({ connected }: { connected: boolean }) {
  const [collection, setCollection] = useState<"example" | "rejection">("example");
  const [records, setRecords] = useState<StyleRecord[]>([]);
  const [query, setQuery] = useState("");
  const [text, setText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "saving">("idle");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!connected) return;
    setState("loading"); setMessage("");
    try { const result = await jsonRequest<{ records: StyleRecord[] }>(`/api/x-master/library?collection=${collection}${query.trim() ? `&query=${encodeURIComponent(query.trim())}` : ""}`); setRecords(result.records); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not load voice memory."); }
    finally { setState("idle"); }
  }, [collection, connected, query]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  async function save() {
    setState("saving"); setMessage("");
    try { await jsonRequest("/api/x-master/library", { method: "POST", body: JSON.stringify({ collection, text, ...(sourceUrl ? { sourceUrl } : {}) }) }); setText(""); setSourceUrl(""); setMessage(collection === "example" ? "Added to your voice." : "Added to the avoid list."); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not save this post."); setState("idle"); }
  }

  async function remove(id: string) {
    try { await jsonRequest(`/api/x-master/library?collection=${collection}&id=${encodeURIComponent(id)}`, { method: "DELETE" }); setRecords((current) => current.filter((record) => record.id !== id)); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not remove this post."); }
  }

  return <>
    <section className={styles.viewIntro}><div><p className={styles.eyebrow}>WRITING STYLE</p><h1>Teach X Master how you sound</h1><p>Save posts worth emulating. Save weak generations as rejections. Both guide every future draft.</p></div><span className={styles.resultCount}>{records.length} loaded</span></section>
    <div className={styles.masterLibraryLayout}>
      <section className={styles.masterComposer}>
        <div className={styles.masterSegmented}><button type="button" aria-pressed={collection === "example"} onClick={() => setCollection("example")}>Style examples</button><button type="button" aria-pressed={collection === "rejection"} onClick={() => setCollection("rejection")}>Avoid patterns</button></div>
        <label><span>{collection === "example" ? "Post to learn from" : "Output to avoid"}</span><textarea rows={7} maxLength={30_000} value={text} onChange={(event) => setText(event.target.value)} placeholder={collection === "example" ? "Paste a strong post…" : "Paste a rejected generation…"} /></label>
        <label><span>Original X URL <small>optional</small></span><input type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://x.com/…/status/…" /></label>
        <button className={styles.masterPrimary} type="button" disabled={!connected || state !== "idle" || text.trim().split(/\s+/).length < 4} onClick={() => void save()}>{state === "saving" ? "Embedding…" : collection === "example" ? "Add to my voice" : "Never write like this"}</button>
        {message && <p className={styles.masterMessage} role="status">{message}</p>}
      </section>
      <section className={styles.masterLibrary}>
        <header><div><p className={styles.eyebrow}>{collection === "example" ? "LIBRARY" : "REJECTIONS"}</p><h2>{collection === "example" ? "Saved writing" : "Patterns to avoid"}</h2></div><label><span>Search saved writing</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="founder stories, AI launches…" /></label></header>
        {state === "loading" ? <div className={styles.masterEmpty}><strong>Reading your memory…</strong></div> : records.length ? <ol>{records.map((record) => <li key={record.id}><div><span>{record.metadata.tone ?? record.metadata.category ?? collection}</span><small>{record.metadata.authorHandle ? `@${record.metadata.authorHandle}` : "manual"}</small></div><p>{record.document}</p><footer><span>{record.metadata.tags.join(" · ")}</span><button type="button" onClick={() => void remove(record.id)}>Remove</button></footer></li>)}</ol> : <div className={styles.masterEmpty}><strong>No records found.</strong><p>Add one here or right-click a post with the X Master extension.</p></div>}
      </section>
    </div>
  </>;
}

function XMasterMediaOutcome({ result }: { result: Record<string, unknown> }) {
  const file = result.file && typeof result.file === "object" && !Array.isArray(result.file) ? result.file as Record<string, unknown> : null;
  const text = String(result.caption ?? file?.name ?? "Complete");
  const url = typeof file?.webViewLink === "string" && file.webViewLink.startsWith("https://") ? file.webViewLink : null;
  return url ? <a href={url} target="_blank" rel="noreferrer">{text} ↗</a> : <pre>{text}</pre>;
}

export function XMasterMedia({ connected }: { connected: boolean }) {
  const [kind, setKind] = useState<"x_video_drive" | "tiktok_captions">("x_video_drive");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [jobs, setJobs] = useState<MediaJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => { if (!connected) return; try { const result = await jsonRequest<{ jobs: MediaJob[] }>("/api/x-master/media/jobs"); setJobs(result.jobs); } catch { /* Empty state explains setup. */ } }, [connected]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  async function submit() { setBusy(true); setMessage(""); try { const result = await jsonRequest<{ job: MediaJob }>("/api/x-master/media/jobs", { method: "POST", body: JSON.stringify({ kind, source_url: url, ...(title ? { title } : {}) }) }); setJobs((current) => [result.job, ...current]); setUrl(""); setTitle(""); setMessage(result.job.state === "complete" ? "Media job complete." : "Media job queued."); } catch (error) { setMessage(error instanceof Error ? error.message : "Media job failed."); await load(); } finally { setBusy(false); } }
  return <>
    <section className={styles.viewIntro}><div><p className={styles.eyebrow}>MEDIA DESK</p><h1>Move video and ideas faster</h1><p>Send X video to your private Drive or pull a TikTok caption into the creator engine.</p></div><span className={styles.resultCount}>{jobs.length} jobs</span></section>
    <div className={styles.masterMediaLayout}>
      <section className={styles.masterComposer}><div className={styles.masterSegmented}><button type="button" aria-pressed={kind === "x_video_drive"} onClick={() => setKind("x_video_drive")}>X video → Drive</button><button type="button" aria-pressed={kind === "tiktok_captions"} onClick={() => setKind("tiktok_captions")}>TikTok → captions</button></div><label><span>{kind === "x_video_drive" ? "X post URL" : "TikTok URL"}</span><input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder={kind === "x_video_drive" ? "https://x.com/…/status/…" : "https://www.tiktok.com/@…/video/…"} /></label>{kind === "x_video_drive" && <label><span>Drive filename <small>optional</small></span><input value={title} maxLength={140} onChange={(event) => setTitle(event.target.value)} /></label>}<button className={styles.masterPrimary} type="button" disabled={!connected || busy || !url.trim()} onClick={() => void submit()}>{busy ? "Processing…" : kind === "x_video_drive" ? "Save video to Drive" : "Extract captions"}</button>{message && <p className={styles.masterMessage}>{message}</p>}</section>
      <section className={styles.masterLibrary}><header><div><p className={styles.eyebrow}>JOB HISTORY</p><h2>Recent media</h2></div></header>{jobs.length ? <ol>{jobs.map((job) => <li key={job.id}><div><span>{job.kind === "x_video_drive" ? "Drive" : "Captions"}</span><small>{job.state}</small></div><p>{job.title || job.source_url}</p>{job.result && <XMasterMediaOutcome result={job.result} />}{job.error && <small>{job.error}</small>}</li>)}</ol> : <div className={styles.masterEmpty}><strong>No media jobs yet.</strong><p>The private media service keeps Drive and downloader credentials away from the browser.</p></div>}</section>
    </div>
  </>;
}

export function XMasterAnalytics({ queue }: { queue: AutomationQueueItem[] }) {
  const metrics = useMemo(() => summarizeXMasterPerformance(queue), [queue]);
  const cards = [["Ready", metrics.ready], ["Published", metrics.published], ["Failed", metrics.failed], ["Total", metrics.total]] as const;
  return <><section className={styles.viewIntro}><div><p className={styles.eyebrow}>PERFORMANCE</p><h1>Learn what compounds</h1><p>See what X Master recommended, what shipped, and which action types dominate your queue.</p></div><span className={styles.resultCount}>{metrics.published} published</span></section><section className={styles.masterAnalytics}><div className={styles.masterMetricGrid}>{cards.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div><div className={styles.masterBreakdown}><header><h2>Action mix</h2><p>Current queue distribution</p></header>{[["Replies", metrics.replies], ["Quotes", metrics.quotes], ["Originals", metrics.originals], ["Reposts", metrics.reposts]].map(([label, value]) => <div key={label}><span>{label}</span><i><b style={{ width: `${metrics.total ? Math.round(Number(value) / metrics.total * 100) : 0}%` }} /></i><strong>{value}</strong></div>)}</div><div className={styles.masterEmpty}><strong>Outcome learning stays evidence-led.</strong><p>Published URLs and engagement outcomes improve recommendations without silently rewriting your voice library.</p></div></section></>;
}

export function XMasterDraftVault({ connected, legacyDrafts }: { connected: boolean; legacyDrafts: ManualTweetDraft[] }) {
  const [drafts, setDrafts] = useState<XMasterDraft[]>([]);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => { if (!connected) return; try { const result = await jsonRequest<{ drafts: XMasterDraft[] }>("/api/x-master/drafts"); setDrafts(result.drafts); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load durable drafts."); } }, [connected]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); const refresh = () => void load(); window.addEventListener("x-master:drafts-changed", refresh); return () => { window.clearTimeout(timer); window.removeEventListener("x-master:drafts-changed", refresh); }; }, [load]);
  useEffect(() => { if (!connected || !legacyDrafts.length) return; const key = `x-master:drafts-migrated:${legacyDrafts.map((item) => item.id).join(",")}`; if (localStorage.getItem(key)) return; void Promise.all(legacyDrafts.map((draft) => jsonRequest("/api/x-master/drafts", { method: "POST", body: JSON.stringify({ id: draft.id.replace(/:/g, "-"), text: draft.text, myDraft: draft.text, media_id: draft.meme_id, createdAt: draft.created_at, updatedAt: draft.updated_at }) }))).then(() => { localStorage.setItem(key, "1"); void load(); }).catch(() => { /* Retry next visit. */ }); }, [connected, legacyDrafts, load]);
  async function update(draft: XMasterDraft, body: string) { try { const result = await jsonRequest<{draft:XMasterDraft}>("/api/x-master/drafts", { method: "PATCH", body: JSON.stringify({ ...draft, body, updated_at: new Date().toISOString() }) }); setDrafts((current) => current.map((item) => item.id === draft.id ? result.draft : item)); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not update draft."); } }
  async function remove(id: string) { try { await jsonRequest(`/api/x-master/drafts?id=${encodeURIComponent(id)}`, { method: "DELETE" }); setDrafts((current) => current.filter((item) => item.id !== id)); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not delete draft."); } }
  return <section className={styles.draftLibrary}><header><div><h2>Synced drafts</h2></div><span>{drafts.length}</span></header>{message && <p className={styles.masterMessage}>{message}</p>}{!connected ? <div className={styles.draftWorkspaceEmpty}><strong>Connect X to sync drafts</strong><p>Your browser drafts remain untouched until then.</p></div> : drafts.length ? <ol>{drafts.map((draft) => <li className={styles.workspaceDraftCard} key={draft.id}><details><summary className={styles.draftPreview}>{draft.body || draft.source_text || "Empty draft"}</summary><div className={styles.workspaceDraftMeta}><span>{draft.format}</span><strong>{draft.author_handle ? `@${draft.author_handle}` : "Your draft"}</strong><small>{draft.state}</small></div><textarea aria-label="Edit synced draft" defaultValue={draft.body || draft.source_text} maxLength={32_000} rows={6} onBlur={(event) => void update(draft, event.currentTarget.value)} /><footer><span>{new Date(draft.updated_at).toLocaleDateString()}</span><div><a href={buildXMasterIntent(draft.body || draft.source_text, draft.format === "reply" ? "x_reply" : draft.format === "quote" ? "x_quote" : "x_post", draft.source_url ?? undefined)} target="_blank" rel="noreferrer">Review on X ↗</a><button className={styles.deleteDraftButton} type="button" onClick={() => void remove(draft.id)}>Delete</button></div></footer></details></li>)}</ol> : <div className={styles.draftWorkspaceEmpty}><strong>No synced drafts yet</strong><p>Save from Create, the extension, or the quick draft above.</p></div>}</section>;
}

export function XMasterExtensionPairing({ connected }: { connected: boolean }) {
  const [code, setCode] = useState("");
  const [devices, setDevices] = useState<Array<{ id: string; label: string; last_used_at: string; revoked_at: string | null }>>([]);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => { if (!connected) return; try { const result = await jsonRequest<{ devices: typeof devices }>("/api/x-master/extension/pair"); setDevices(result.devices); } catch { /* Pair button reports actionable errors. */ } }, [connected]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  async function pair() { setMessage(""); try { const result = await jsonRequest<{ code: string }>("/api/x-master/extension/pair", { method: "POST", body: JSON.stringify({ action: "create" }) }); setCode(result.code); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not create pairing code."); } }
  async function revoke(id: string) { try { await jsonRequest("/api/x-master/extension/pair", { method: "POST", body: JSON.stringify({ action: "revoke", id }) }); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not revoke extension."); } }
  async function importPrevious() { setMessage("Importing previous drafts…"); try { const result = await jsonRequest<{ imported: number; source_hash: string }>("/api/x-master/migrate", { method: "POST" }); setMessage(`Imported ${result.imported} previous drafts · verified ${result.source_hash.slice(0, 10)}`); window.dispatchEvent(new Event("x-master:drafts-changed")); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not import previous X Master data."); } }
  return <section><h3>Chrome extension</h3><p>Pair the unified side panel, inline reply writer, timeline capture, library, drafts, and Drive tools.</p>{code && <div className={styles.pairingCode}><span>ONE-TIME CODE</span><strong>{code}</strong><small>Enter this in the extension within 10 minutes.</small></div>}<button type="button" disabled={!connected} onClick={() => void pair()}>Generate pairing code</button>{devices.filter((device) => !device.revoked_at).map((device) => <div className={styles.extensionDevice} key={device.id}><div><strong>{device.label}</strong><small>Used {new Date(device.last_used_at).toLocaleDateString()}</small></div><button type="button" onClick={() => void revoke(device.id)}>Revoke</button></div>)}<button type="button" disabled={!connected} onClick={() => void importPrevious()}>Import previous X Master drafts</button>{message && <small>{message}</small>}</section>;
}
