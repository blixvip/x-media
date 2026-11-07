"use client";
/* eslint-disable @next/next/no-img-element -- Local collector images are already cached and thumbnailed. */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, ArrowRightIcon, ArrowUpRightIcon, BookmarkIcon, CheckIcon, CopyIcon, DownloadIcon, ImagesIcon, LoaderCircleIcon, RefreshCwIcon, SearchIcon, Undo2Icon, XIcon, ZoomInIcon } from "lucide-react";
import { MediaHeader } from "@/components/tracker/media-header";
import { FolderPicker } from "@/components/folders/folder-picker";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { Meme, MemeList, RedditStats } from "@/lib/reddit/types";
import { RedditSettingsPanel } from "./reddit-settings";
import { RedditTV } from "./reddit-tv";

export async function redditApi<T>(path: string, data?: unknown, method = "POST", signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/reddit/${path}`, { signal, cache: "no-store", method: data === undefined ? "GET" : method,
    headers: data === undefined ? undefined : { "Content-Type": "application/json" }, body: data === undefined ? undefined : JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The request failed. Please retry.");
  return result;
}
export const selectClass = "h-9 min-w-0 rounded-lg border border-input bg-card px-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";
const tabs = [["explore", "All memes"], ["picks", "For you"], ["saved", "Saved"], ["review", "Review"], ["tv", "TV"], ["settings", "Settings"]];
const count = (value: number | null) => value === null ? "—" : new Intl.NumberFormat("en", { notation: "compact" }).format(value);
const date = (value: number | null) => value ? new Date(value * 1000).toLocaleDateString(undefined, { dateStyle: "medium" }) : "Date unavailable";

export async function copyMeme(meme: Meme) {
  if (!navigator.clipboard?.write || !window.ClipboardItem) throw new Error("Image copying is unavailable in this browser. Use Download original.");
  const png = (async () => {
    const response = await fetch(meme.originalUrl);
    if (!response.ok) throw new Error("The original image is unavailable.");
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0); bitmap.close();
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not copy this image.")), "image/png"));
  })();
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}

function MemeImage({ meme, original = false, zoom = false, onLoad }: { meme: Meme; original?: boolean; zoom?: boolean; onLoad?: () => void }) {
  const [failed, setFailed] = useState(false);
  return failed ? <span className="flex min-h-48 items-center justify-center p-5 text-center text-sm text-muted-foreground">Image unavailable. Open the Reddit post to view the source.</span> :
    <img src={original ? meme.originalUrl : meme.thumbnailUrl} alt={meme.title} loading={original ? "eager" : "lazy"} decoding="async"
      onError={() => setFailed(true)} onLoad={onLoad} className={original ? zoom ? "max-w-none" : "max-h-[65dvh] w-full object-contain" : "size-full object-contain"} />;
}

export function RedditExplorer({ view }: { view: string }) {
  const [rows, setRows] = useState<Meme[]>([]);
  const [stats, setStats] = useState<RedditStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [undo, setUndo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState("");
  const [source, setSource] = useState("");
  const [sort, setSort] = useState("best");
  const [selected, setSelected] = useState<Meme | null>(null);
  const [updates, setUpdates] = useState<Record<string, Meme>>({});
  const [zoom, setZoom] = useState(false);
  const [reason, setReason] = useState("not_funny");
  const requestId = useRef(0);

  const loadStats = useCallback(async () => { setStats(await redditApi<RedditStats>("stats")); }, []);
  const load = useCallback(async (nextCursor?: string, nextBatch = false) => {
    const id = ++requestId.current;
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ view, q: query, tier, source, sort, limit: "60", cursor: nextCursor || "0" });
      const data = view === "picks" ? await redditApi<MemeList>("picks", nextBatch ? {} : undefined) : await redditApi<MemeList>(`memes?${params}`);
      if (id !== requestId.current) return;
      setRows(previous => nextCursor ? [...previous, ...data.memes.filter(meme => !previous.some(row => row.id === meme.id))] : data.memes);
      setCursor(data.nextCursor || null); setTotal(data.total ?? data.memes.length);
      await loadStats();
    } catch (e) { if (id === requestId.current) setError((e as Error).message); }
    finally { if (id === requestId.current) setLoading(false); }
  }, [view, query, tier, source, sort, loadStats]);

  useEffect(() => {
    if (["settings", "tv"].includes(view)) return;
    const sequence = requestId;
    const timer = setTimeout(() => void load(), 200);
    return () => { clearTimeout(timer); sequence.current++; };
  }, [load, view]);
  useEffect(() => {
    const initial = setTimeout(() => void loadStats().catch(() => {}), 0);
    const events = new EventSource("/api/reddit/events");
    events.addEventListener("update", () => void loadStats().catch(() => {}));
    return () => { clearTimeout(initial); events.close(); };
  }, [loadStats]);

  const navigate = useCallback((direction: number) => {
    if (!selected) return;
    const next = rows[rows.findIndex(meme => meme.id === selected.id) + direction];
    if (next) { setSelected(next); setZoom(false); }
  }, [rows, selected]);
  useEffect(() => {
    if (!selected) return;
    const key = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest("input,select,textarea,button")) return;
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); navigate(event.key === "ArrowRight" ? 1 : -1); }
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [selected, navigate]);

  async function feedback(meme: Meme, action: string) {
    setBusy(true); setError("");
    try {
      const result = await redditApi<{ eventId: string; meme: Meme }>(`feedback/${meme.id}`, { action, reason: action === "reject" ? reason : undefined });
      setUpdates(previous => ({ ...previous, [meme.id]: result.meme }));
      setUndo(result.eventId); setNotice(action === "reject" ? "Meme rejected" : action === "unfavorite" ? "Removed from saved" : action === "favorite" ? "Meme saved" : "Meme kept");
      const remove = action === "reject" || view === "review" || (view === "saved" && action === "unfavorite");
      setRows(previous => remove ? previous.filter(row => row.id !== meme.id) : previous.map(row => row.id === meme.id ? result.meme : row));
      if (remove) setTotal(previous => Math.max(0, previous - 1));
      if (selected?.id === meme.id) setSelected(remove ? null : result.meme);
      await loadStats();
      return result.meme;
    } catch (e) { setError((e as Error).message); return null; }
    finally { setBusy(false); }
  }

  async function run(action: () => Promise<unknown>, message?: string) {
    setBusy(true); setError("");
    try { await action(); if (message) setNotice(message); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return <div className="min-h-screen bg-background">
    <MediaHeader source="reddit" />
    <section className="mx-auto max-w-3xl px-4 pt-14 pb-2 text-center sm:px-6 sm:pt-20">
      <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">Your Reddit memes, together</h1>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-pretty text-muted-foreground sm:text-base">AI and coding humor from your communities. Browse your collection, save favorites, and keep the finds that land.</p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground" aria-live="polite">
        {stats && <><span>{count(stats.stored)} collected</span><span>{count(stats.saved)} saved</span><span>{count(stats.pendingReview)} to review</span></>}
        <Button size="sm" variant="outline" disabled={busy || stats?.refreshing} onClick={() => void run(async () => { await redditApi("refresh", {}); await loadStats(); }, "Collection started. New finds will appear when you refresh this view.")}>
          <RefreshCwIcon className={stats?.refreshing ? "animate-spin" : ""} aria-hidden />{stats?.refreshing ? "Collecting…" : "Find new memes"}
        </Button>
      </div>
    </section>
    <section className="mx-auto mt-8 w-full max-w-7xl px-4 pb-16 sm:px-6 lg:px-8" aria-label="Reddit collection">
      <nav aria-label="Reddit views" className="flex gap-1 overflow-x-auto border-b pb-3">
        {tabs.map(([key, title]) => <Button key={key} variant={key === view ? "secondary" : "ghost"} nativeButton={false} role="link" render={<Link href={key === "explore" ? "/reddit" : `/reddit/${key}`} aria-current={key === view ? "page" : undefined} />}>{title}</Button>)}
      </nav>
      {error && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" role="alert"><span>{error}</span><Button variant="outline" onClick={() => void load()}>Retry</Button></div>}
      {notice && <div className="mt-4 flex flex-wrap items-center gap-3 text-sm" role="status"><span>{notice}</span>{undo && <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => { const restored = await redditApi<{ meme: Meme }>("undo", { eventId: undo }); setUpdates(previous => ({ ...previous, [restored.meme.id]: restored.meme })); setUndo(null); if (!["tv", "settings"].includes(view)) await load(); }, "Change undone")}><Undo2Icon aria-hidden />Undo</Button>}<Button size="icon-sm" variant="ghost" aria-label="Dismiss notification" onClick={() => setNotice("")}><XIcon aria-hidden /></Button></div>}
      {view === "settings" ? <RedditSettingsPanel stats={stats} /> : view === "tv" ? <RedditTV updates={updates} onOpen={meme => { setSelected(meme); setZoom(false); }} onFeedback={feedback} busy={busy} /> : <>
        {view !== "picks" && <div className="mt-5 flex flex-wrap items-center gap-2" role="search" aria-label="Filter Reddit memes">
          <InputGroup className="h-9 w-full bg-card sm:w-72"><InputGroupAddon><SearchIcon aria-hidden /></InputGroupAddon><InputGroupInput aria-label="Search memes" placeholder="Search memes, text, or topics" value={query} onChange={event => setQuery(event.target.value)} /></InputGroup>
          <select className={selectClass} aria-label="Rank" value={tier} onChange={event => setTier(event.target.value)}><option value="">All ranks</option>{["S", "A", "B"].map(rank => <option key={rank}>{rank}</option>)}</select>
          <select className={`${selectClass} max-w-52`} aria-label="Community" value={source} onChange={event => setSource(event.target.value)}><option value="">All communities</option>{stats?.sources.map(name => <option key={name} value={name}>r/{name}</option>)}</select>
          <select className={selectClass} aria-label="Sort memes" value={sort} onChange={event => setSort(event.target.value)}><option value="best">Best first</option><option value="newest">Newest first</option><option value="votes">Most upvotes</option></select>
        </div>}
        <div className="my-4 flex items-center justify-between gap-3 text-sm text-muted-foreground"><span role="status">{loading ? "Loading memes…" : `${total.toLocaleString()} ${view === "picks" ? "picks" : "memes"}`}</span><Button variant="ghost" size="sm" disabled={loading} onClick={() => void load(undefined, view === "picks")}>{view === "picks" ? "Next batch" : "Refresh view"}<ArrowRightIcon aria-hidden /></Button></div>
        {rows.length > 0 ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map(meme => <article key={meme.id} className="group overflow-hidden rounded-xl border bg-card shadow-xs transition-shadow hover:shadow-sm">
            <button type="button" onClick={() => { setSelected(meme); setZoom(false); }} aria-label={`View ${meme.title}`} className="relative block aspect-[4/3] w-full overflow-hidden bg-muted text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"><MemeImage meme={meme} /><span className="absolute right-2 bottom-2 rounded-md border border-white/15 bg-black/75 px-2 py-1 text-xs font-medium text-white">{meme.tier} rank</span></button>
            <div className="space-y-2 p-3"><p className="line-clamp-2 min-h-10 text-sm leading-5 text-foreground/85">{meme.title}</p><div className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span className="truncate">r/{meme.subreddit}</span><span className="shrink-0 tabular-nums">{count(meme.score)} upvotes</span></div>
              <div className="flex flex-wrap items-center gap-1 pt-1"><Button variant={meme.favorite ? "secondary" : "ghost"} size="sm" disabled={busy} aria-label={meme.favorite ? `Unsave ${meme.title}` : `Save ${meme.title}`} aria-pressed={meme.favorite} onClick={() => void feedback(meme, meme.favorite ? "unfavorite" : "favorite")}><BookmarkIcon className={meme.favorite ? "fill-current" : ""} aria-hidden />{meme.favorite ? "Saved" : "Save"}</Button><FolderPicker media={{ source: "reddit", id: meme.id }} label={`Add '${meme.title}' to folders`} />{view === "review" && <Button variant="ghost" size="sm" disabled={busy} onClick={() => void feedback(meme, "keep")}><CheckIcon aria-hidden />Keep</Button>}<a className="ml-auto inline-flex items-center gap-1 rounded-sm text-xs underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring" href={meme.permalink} target="_blank" rel="noopener noreferrer" aria-label={`Open Reddit post '${meme.title}'`}>Post<ArrowUpRightIcon className="size-3" aria-hidden /></a></div>
            </div>
          </article>)}
        </div> : <div className="rounded-xl border border-dashed p-10 text-center">{loading ? <LoaderCircleIcon className="mx-auto size-7 animate-spin text-muted-foreground" aria-hidden /> : <ImagesIcon className="mx-auto size-7 text-muted-foreground" aria-hidden />}<h2 className="mt-3 font-medium">{loading ? "Opening your collection" : view === "saved" ? "Your favorites belong here" : view === "review" ? "Nothing waiting for review" : view === "picks" ? "No unseen picks ready" : "No memes match this view"}</h2><p className="mt-2 text-sm text-muted-foreground">{view === "saved" ? "Save a meme from All memes to find it here." : "Try All memes, clear your filters, or find new memes."}</p></div>}
        {cursor && <div className="mt-8 text-center"><Button variant="outline" disabled={loading} onClick={() => void load(cursor)}>{loading ? "Loading…" : "Load more"}</Button></div>}
      </>}
    </section>
    <Sheet open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}>
      <SheetContent className="overflow-hidden data-[side=right]:w-full data-[side=right]:sm:max-w-3xl">
        {selected && <><SheetHeader className="pr-14"><SheetTitle>{selected.title}</SheetTitle><SheetDescription>r/{selected.subreddit} · {date(selected.created)} · {count(selected.score)} upvotes</SheetDescription></SheetHeader>
          <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-5">
            <div className="overflow-auto rounded-xl bg-muted"><MemeImage key={selected.id} meme={selected} original zoom={zoom} onLoad={() => void redditApi(`seen/${selected.id}`, {}).catch(() => {})} /></div>
            <div className="mt-3 flex flex-wrap items-center gap-2"><Badge variant="outline">{selected.tier} rank</Badge><Button variant="ghost" size="sm" aria-pressed={zoom} onClick={() => setZoom(!zoom)}><ZoomInIcon aria-hidden />{zoom ? "Fit image" : "Zoom"}</Button><Button variant="ghost" size="icon-sm" aria-label="Previous meme" disabled={rows.findIndex(row => row.id === selected.id) <= 0} onClick={() => navigate(-1)}><ArrowLeftIcon aria-hidden /></Button><Button variant="ghost" size="icon-sm" aria-label="Next meme" disabled={rows.findIndex(row => row.id === selected.id) < 0 || rows.findIndex(row => row.id === selected.id) >= rows.length - 1} onClick={() => navigate(1)}><ArrowRightIcon aria-hidden /></Button></div>
            <div className="mt-4 flex flex-wrap gap-2"><FolderPicker key={selected.id} media={{ source: "reddit", id: selected.id }} /><Button variant={selected.favorite ? "secondary" : "default"} disabled={busy} onClick={() => void feedback(selected, selected.favorite ? "unfavorite" : "favorite")}><BookmarkIcon aria-hidden />{selected.favorite ? "Unsave" : "Save meme"}</Button><Button variant="outline" disabled={busy} onClick={() => void feedback(selected, "keep")}><CheckIcon aria-hidden />Keep</Button><Button variant="outline" disabled={busy} onClick={() => void run(() => copyMeme(selected), "Image copied")}><CopyIcon aria-hidden />Copy image</Button><Button variant="outline" nativeButton={false} role="link" render={<a href={`/api/reddit/download/${selected.id}`} download />}><DownloadIcon aria-hidden />Download original</Button><Button variant="outline" nativeButton={false} role="link" render={<a href={selected.permalink} target="_blank" rel="noopener noreferrer" />}><ArrowUpRightIcon aria-hidden />Reddit post</Button></div>
            <div className="mt-5 flex flex-wrap gap-2 border-t pt-4"><select aria-label="Rejection reason" className={selectClass} value={reason} onChange={event => setReason(event.target.value)}><option value="not_funny">Not funny</option><option value="off_topic">Off topic</option><option value="seen">Seen this</option><option value="unreadable">Hard to read</option></select><Button variant="destructive" disabled={busy} onClick={() => void feedback(selected, "reject")}><XIcon aria-hidden />Reject</Button></div>
            {notice && <p className="mt-3 text-sm" role="status">{notice}</p>}{error && <p className="mt-3 text-sm text-destructive" role="alert">{error}</p>}
          </div></>}
      </SheetContent>
    </Sheet>
  </div>;
}
