"use client";

/* eslint-disable @next/next/no-img-element -- X media URLs are dynamic provider data. */

import {
  AlertTriangleIcon,
  ArrowUpRightIcon,
  CalendarArrowDownIcon,
  ChevronDownIcon,
  FilmIcon,
  ImageIcon,
  ImagesIcon,
  LoaderCircleIcon,
  PlayIcon,
  RefreshCwIcon,
  SearchIcon,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import { MediaHeader } from "./media-header";
import { FolderPicker } from "@/components/folders/folder-picker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type {
  ArchiveMediaItem,
  MediaArchiveResult,
} from "@/lib/tracker/media-archive";
import type { PostMediaType } from "@/lib/tracker/types";
import { cn } from "@/lib/utils";

import { PostMedia } from "./post-media";
import { useArchiveJobs } from "./use-archive-jobs";

type MediaFilter = "all" | PostMediaType;
type SortOrder = "latest" | "oldest";

const FILTERS: Array<{
  value: MediaFilter;
  label: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}> = [
  { value: "all", label: "All", icon: ImagesIcon },
  { value: "photo", label: "Photos", icon: ImageIcon },
  { value: "video", label: "Videos", icon: FilmIcon },
  { value: "animated_gif", label: "GIFs", icon: RefreshCwIcon },
];

const PAGE_SIZE = 60;

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function typeLabel(type: PostMediaType): string {
  if (type === "animated_gif") return "GIF";
  return type === "video" ? "Video" : "Photo";
}

function previewUrl(item: ArchiveMediaItem): string | undefined {
  return item.media.url ?? item.media.previewImageUrl;
}

function MediaCard({
  item,
  jobId,
  onOpen,
}: {
  item: ArchiveMediaItem;
  jobId: string;
  onOpen: (item: ArchiveMediaItem) => void;
}) {
  const preview = previewUrl(item);
  const isPlayable = item.media.type !== "photo";
  const alt =
    item.media.altText?.trim() ||
    `${typeLabel(item.media.type)} from @${new URL(item.postUrl).pathname.split("/")[1]}`;
  const text = item.postText?.trim();
  const itemName = text ? (text.length > 60 ? `${text.slice(0, 60)}…` : text) : alt;

  return (
    <article className="group overflow-hidden rounded-xl border bg-card shadow-xs transition-shadow hover:shadow-sm">
      <button
        type="button"
        className="relative block aspect-[4/3] w-full overflow-hidden bg-black text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        onClick={() => onOpen(item)}
        aria-label={`View ${typeLabel(item.media.type).toLowerCase()} from ${formatDate(item.createdAt)}`}
      >
        {preview ? (
          <img
            src={preview}
            alt={alt}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <span className="grid size-full place-items-center bg-muted text-muted-foreground">
            <ImagesIcon className="size-8" aria-hidden />
          </span>
        )}
        <span className="absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-md border border-white/15 bg-black/75 px-2 py-1 text-[11px] font-medium text-white shadow-sm backdrop-blur-sm">
          {isPlayable ? (
            <PlayIcon className="size-3 fill-current" aria-hidden />
          ) : (
            <ImageIcon className="size-3" aria-hidden />
          )}
          {typeLabel(item.media.type)}
        </span>
      </button>
      <div className="space-y-2 p-3">
        <p className="line-clamp-2 min-h-10 text-sm leading-5 text-foreground/85">
          {item.postText}
        </p>
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
          <a
            href={item.postUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open post '${itemName}' on X`}
            className="inline-flex shrink-0 items-center gap-1 rounded-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Post
            <ArrowUpRightIcon className="size-3" aria-hidden />
          </a>
        </div>
        <FolderPicker media={{ source: "x", id: item.id, jobId }} label={`Add '${itemName}' to folders`} />
      </div>
    </article>
  );
}

function ArchiveResults({ result, jobId, onRepair }: { result: MediaArchiveResult; jobId: string; onRepair: (postId: string) => Promise<void> }) {
  const [filter, setFilter] = useState<MediaFilter>("video");
  const [sortOrder, setSortOrder] = useState<SortOrder>("latest");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<ArchiveMediaItem | null>(null);
  const [repairing, setRepairing] = useState(false);
  const [playbackAttempt, setPlaybackAttempt] = useState(0);
  const [repairError, setRepairError] = useState<string | null>(null);
  const selectedMedia = result.items.find((item) => item.id === selected?.id) ?? selected;

  const counts = useMemo(
    () => ({
      all: result.items.length,
      photo: result.items.filter((item) => item.media.type === "photo").length,
      video: result.items.filter((item) => item.media.type === "video").length,
      animated_gif: result.items.filter(
        (item) => item.media.type === "animated_gif",
      ).length,
    }),
    [result.items],
  );

  const filteredItems = useMemo(() => {
    const matching =
      filter === "all"
        ? [...result.items]
        : result.items.filter((item) => item.media.type === filter);
    matching.sort((a, b) => {
      const difference = Date.parse(b.createdAt) - Date.parse(a.createdAt);
      return sortOrder === "latest" ? difference : -difference;
    });
    return matching;
  }, [filter, result.items, sortOrder]);

  const visibleItems = filteredItems.slice(0, visibleCount);

  function selectFilter(value: MediaFilter) {
    setFilter(value);
    setVisibleCount(PAGE_SIZE);
  }

  return (
    <section className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6 lg:px-8" aria-label="Collected media">
      <div className="mt-8 flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="size-12">
            <AvatarImage
              src={result.profileImageUrl}
              alt=""
              referrerPolicy="no-referrer"
            />
            <AvatarFallback>{initials(result.displayName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold tracking-tight">
              {result.displayName}
            </h2>
            <p className="truncate text-sm text-muted-foreground">
              @{result.username}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={result.mode === "scraper" ? "secondary" : "outline"}>
            {result.access === "official"
              ? "Official X archive"
              : result.access === "cookie"
                ? "Free X search"
                : "No login required"}
          </Badge>
          <Badge variant="outline">
            {result.complete ? "Available results collected" : "Available public media"}
          </Badge>
        </div>
      </div>

      {result.warning && (
        <Alert className="mt-5 border-amber-500/25 bg-amber-500/5">
          <AlertTriangleIcon className="text-amber-600" aria-hidden />
          <AlertTitle>{result.complete ? "About these results" : "Partial results"}</AlertTitle>
          <AlertDescription>{result.warning}</AlertDescription>
        </Alert>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Media found</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{result.items.length.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Posts scanned</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{result.postsScanned.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Batches read</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{result.pagesFetched.toLocaleString()}</p>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1" role="group" aria-label="Media type">
          {FILTERS.map((item) => {
            const Icon = item.icon;
            const active = filter === item.value;
            return (
              <Button
                key={item.value}
                type="button"
                size="sm"
                variant="ghost"
                aria-pressed={active}
                className={cn(
                  "shrink-0 text-muted-foreground",
                  active && "bg-background text-foreground shadow-xs hover:bg-background",
                )}
                onClick={() => selectFilter(item.value)}
              >
                <Icon data-icon="inline-start" aria-hidden />
                {item.label}
                <span className="tabular-nums text-muted-foreground">{counts[item.value]}</span>
              </Button>
            );
          })}
        </div>

        <Select
          value={sortOrder}
          onValueChange={(value) => {
            if (value === "latest" || value === "oldest") {
              setSortOrder(value);
              setVisibleCount(PAGE_SIZE);
            }
          }}
        >
          <SelectTrigger className="h-9 w-full sm:w-44" aria-label="Sort media">
            <CalendarArrowDownIcon className="size-4 text-muted-foreground" aria-hidden />
            <SelectValue>
              {sortOrder === "latest" ? "Latest first" : "Oldest first"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="latest">Latest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filteredItems.length > 0 ? (
        <>
          <p className="mt-4 text-xs text-muted-foreground">
            Showing {visibleItems.length.toLocaleString()} of {filteredItems.length.toLocaleString()} matching attachments
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleItems.map((item) => (
              <MediaCard key={item.id} item={item} jobId={jobId} onOpen={(item) => { setSelected(item); setRepairError(null); }} />
            ))}
          </div>
          {visibleItems.length < filteredItems.length && (
            <div className="mt-8 flex justify-center">
              <Button
                type="button"
                variant="outline"
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
              >
                Load {Math.min(PAGE_SIZE, filteredItems.length - visibleItems.length)} more
                <ChevronDownIcon data-icon="inline-end" aria-hidden />
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="mt-8 rounded-xl border border-dashed p-10 text-center">
          <ImagesIcon className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <h3 className="mt-3 font-medium">No {filter === "all" ? "media" : FILTERS.find((item) => item.value === filter)?.label.toLowerCase()}</h3>
          <p className="mt-1 text-sm text-muted-foreground">Try another category or username.</p>
        </div>
      )}

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="gap-0 overflow-hidden p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
          {selected && (
            <>
              <SheetHeader className="border-b p-5 pr-14">
                <SheetTitle>{typeLabel(selected.media.type)} from @{result.username}</SheetTitle>
                <SheetDescription>{formatDate(selected.createdAt)}</SheetDescription>
              </SheetHeader>
              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                <PostMedia key={`${selectedMedia?.id}:${playbackAttempt}`} media={selectedMedia ? [selectedMedia.media] : []} detail
                  videoUrlOverride={selectedMedia?.media.type !== "photo" && selectedMedia?.media.variants.length ? `/api/media-archive/jobs/${jobId}/video?item=${encodeURIComponent(selectedMedia.id)}&attempt=${playbackAttempt}` : undefined}
                  onPlaybackError={() => setRepairError("This video link could not play. Refresh the link or open the original post.")} />
                {selected.media.type !== "photo" && (
                  <div className="mt-3 space-y-2">
                    <Button variant="outline" disabled={repairing} onClick={async () => {
                      setRepairing(true); setRepairError(null);
                      try { await onRepair(selected.postId); setPlaybackAttempt((attempt) => attempt + 1); }
                      catch (error) { setRepairError(error instanceof Error ? error.message : "Could not refresh the video link."); }
                      finally { setRepairing(false); }
                    }}>
                      <RefreshCwIcon className={repairing ? "animate-spin" : ""} data-icon="inline-start" aria-hidden />
                      {repairing ? "Refreshing link…" : "Refresh video link"}
                    </Button>
                    {repairError && <p className="text-sm text-destructive" role="alert">{repairError}</p>}
                  </div>
                )}
                <p className="mt-5 text-base leading-7 text-foreground/90">{selected.postText}</p>
                <div className="mt-4"><FolderPicker key={selected.id} media={{ source: "x", id: selected.id, jobId }} /></div>
                <Button
                  className="mt-5"
                  variant="outline"
                  nativeButton={false}
                  render={<a href={selected.postUrl} target="_blank" rel="noopener noreferrer" />}
                >
                  Open original post
                  <ArrowUpRightIcon data-icon="inline-end" aria-hidden />
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}

export function MediaArchiveExplorer() {
  const { username, setUsername, view, saved, error, setError, loading, active, collect, action } = useArchiveJobs();
  const result = view?.result;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await collect(username);
  }

  return (
    <div className="min-h-screen bg-background">
      <MediaHeader />

      <section className="mx-auto max-w-3xl px-4 pt-14 pb-2 text-center sm:px-6 sm:pt-20">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Public X videos, together
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-pretty text-muted-foreground sm:text-base">
          Enter an X (Twitter) username to find public videos, photos, and GIFs. Browse your saved library by type, latest, or oldest.
        </p>

        <form className="mx-auto mt-8 max-w-2xl" onSubmit={submit}>
          <div className="flex flex-col gap-2 sm:flex-row">
            <InputGroup className="h-11 flex-1 bg-card shadow-xs">
              <InputGroupAddon>
                <InputGroupText className="text-base">@</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="username"
                aria-label="X username"
                autoComplete="off"
                spellCheck={false}
                disabled={loading}
                className="h-11 text-base"
              />
            </InputGroup>
            <Button type="submit" size="lg" className="h-11 sm:min-w-36" disabled={loading}>
              {loading ? (
                <LoaderCircleIcon className="animate-spin" data-icon="inline-start" aria-hidden />
              ) : (
                <SearchIcon data-icon="inline-start" aria-hidden />
              )}
              {loading ? "Opening…" : "Find media"}
            </Button>
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            No login or API key. Your library is saved on this computer; videos stream when played. Older posts may be unavailable.
          </p>
        </form>

        {error && (
          <Alert variant="destructive" className="mx-auto mt-5 max-w-2xl text-left">
            <AlertTriangleIcon aria-hidden />
            <AlertTitle>Archive unavailable</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {saved.length > 0 && <div className="mt-5 flex flex-wrap items-center justify-center gap-2" role="group" aria-label="Saved accounts">
          <span className="text-xs text-muted-foreground">Saved:</span>
          {saved.map((account) => <Button key={account.username} variant="ghost" size="sm" disabled={loading} onClick={() => void collect(account.username)}>@{account.username} · {account.count}</Button>)}
        </div>}
        {view && <div className="mt-6 flex flex-col gap-4 rounded-xl border bg-card p-4 text-left sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0" role="status" aria-live="polite">
            <p className="flex items-center gap-2 font-medium">
              {active && <LoaderCircleIcon className={view.job.status === "running" ? "size-4 animate-spin" : "size-4"} aria-hidden />}
              @{view.job.username} · {view.job.status === "running" ? "Collecting" : view.job.status === "waiting" ? "Waiting to retry" : view.job.status === "queued" ? "Queued" : view.job.status === "cancelled" ? "Stopped" : view.job.status === "failed" ? "Could not refresh" : view.job.status === "unavailable" ? "Unavailable" : "Saved collection"}
            </p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{view.job.message}</p>
            {view.job.retryAt && <p className="mt-1 text-sm">Next attempt: {formatDate(new Date(view.job.retryAt).toISOString())}</p>}
            {view.collectedAt && <p className="mt-2 text-xs text-muted-foreground">{view.source === "live" ? "Latest collection" : "Saved copy"}: {formatDate(view.collectedAt)} · {view.job.newItems} new media this run</p>}
          </div>
          <Button variant="outline" className="shrink-0" onClick={() => void action(active ? "cancel" : "retry").catch((e: Error) => setError(e.message))}>
            {active ? "Stop collection" : "Refresh collection"}
          </Button>
        </div>}

      </section>

      {result && result.items.length > 0 ? (
        <ArchiveResults key={result.username} result={result} jobId={view.job.id} onRepair={(postId) => action("repair", postId)} />
      ) : view ? (
        <section className="mx-auto mt-8 max-w-3xl px-4 pb-16 text-center" aria-label="Collection status">
          <div className="rounded-xl border border-dashed p-8">
            {active ? <LoaderCircleIcon className={cn("mx-auto size-7 text-muted-foreground", view.job.status === "running" && "animate-spin")} aria-hidden /> : <ImagesIcon className="mx-auto size-7 text-muted-foreground" aria-hidden />}
            <h2 className="mt-3 font-medium">{active ? view.job.status === "running" ? "Looking for public media" : "Your search is waiting to run" : view.job.status === "cancelled" ? "Search stopped" : "No public media returned"}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{active ? "No results yet. This does not mean the account has no videos. Media will appear here as soon as it is found." : "The collector has not saved media for this account. This does not establish that the account has no videos."}</p>
          </div>
        </section>
      ) : null}
    </div>
  );
}
