"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon, ExternalLinkIcon, EyeIcon, HeartIcon, MessageCircleIcon, Repeat2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Post } from "@/lib/posts/types";
import { MasterSaveButton } from '@/components/master-save-button';
import { masterReference } from '@/lib/master-reference';

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
export function formatCount(value: number | null) { return value === null ? "—" : compact.format(value); }
export function postDate(value: string) { return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }); }

function PostVideo({ post, media, url }: { post: Post; media: Post["media"][number]; url: string }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const src = `/api/posts/video?${new URLSearchParams({ username: post.username, post: post.id, media: media.mediaKey })}`;
  return <div className="posts-video">
    <video key={attempt} src={src} controls preload={attempt ? "metadata" : "none"} poster={media.previewImageUrl} playsInline aria-label={media.type === "animated_gif" ? "Tweet GIF" : "Tweet video"} onError={() => setFailed(true)}>
      <a href={url}>Watch on X</a>
    </video>
    {failed && <p role="status" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span>Video could not load.</span><button type="button" className="text-primary underline underline-offset-4" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>Try again</button>
      <a className="text-primary underline underline-offset-4" href={url} target="_blank" rel="noreferrer">Watch on X</a>
    </p>}
  </div>;
}

export function PostCard({ post, rank, short }: { post: Post; rank: number; short: boolean }) {
  const [expanded, setExpanded] = useState(false), [copied, setCopied] = useState(false);
  const url = `https://x.com/${post.username}/status/${post.id}`;
  const long = post.text.length > 650;
  async function copy() {
    try { await navigator.clipboard.writeText(post.text); setCopied(true); toast.success("Tweet text copied"); }
    catch { toast.error("Clipboard access failed. You can select and copy the tweet text."); }
  }
  return <article className="posts-row" data-post-id={post.id} data-likes={post.likes ?? ""} data-date={post.createdAt}>
    <span className="posts-rank" aria-label={`Result ${rank}`}>{String(rank).padStart(2, "0")}</span>
    <div className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">@{post.username}</span><span aria-hidden>·</span>
        <time dateTime={post.createdAt} title={new Date(post.createdAt).toUTCString()}>{postDate(post.createdAt)}</time>
        {post.isReply && <span className="posts-tag">Reply</span>}
        {post.isQuote && <span className="posts-tag">Quote post</span>}
        {short && <span className="posts-tag">{post.characterCount} characters</span>}
      </div>
      <p className="posts-text">{post.text ? long && !expanded ? `${post.text.slice(0, 650)}…` : post.text : "Media post"}</p>
      {long && <Button className="mt-1 px-0" variant="link" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>{expanded ? "Show less" : "Read full tweet"}</Button>}
      {!!post.media.length && <div className="posts-media">
        {post.media.map(media => media.type === "photo" ?
          <a key={media.mediaKey} href={media.url} target="_blank" rel="noreferrer" className="posts-image-link" aria-label="Open full-size image">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={media.url} alt={media.altText || "Image attached to tweet"} loading="lazy" />
          </a> : media.variants.length ?
          <PostVideo key={media.mediaKey} post={post} media={media} url={url} /> : <a key={media.mediaKey} href={url} target="_blank" rel="noreferrer" className="posts-image-link" aria-label="Watch media on X">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={media.previewImageUrl} alt="Video preview — open on X to watch" loading="lazy" />
          </a>)}
      </div>}
      {post.isQuote && <a className="mt-3 inline-block text-xs text-primary underline underline-offset-4" href={url} target="_blank" rel="noreferrer">Read the quoted post on X</a>}
      <div className="posts-row-footer">
        <div className="posts-metrics">
          {([["Likes", post.likes, HeartIcon], ["Reposts", post.reposts, Repeat2Icon], ["Replies", post.replies, MessageCircleIcon], ["Views", post.views, EyeIcon]] as const).map(([label, count, Icon]) =>
            <span key={label} className={label === "Likes" ? "text-foreground" : ""} title={`${label}: ${count === null ? "not available" : count.toLocaleString()} · checked ${postDate(post.fetchedAt)}`} aria-label={`${count === null ? "Unavailable" : count.toLocaleString()} ${label.toLowerCase()}`}><Icon aria-hidden /><span>{formatCount(count)}</span></span>)}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <MasterSaveButton key={post.id} reference={masterReference(post)} />
          <Button size="sm" variant="ghost" onClick={() => void copy()} aria-label={`Copy tweet ${rank} text`}>{copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}<span>Copy</span></Button>
          <Button size="sm" variant="ghost" nativeButton={false} role="link" render={<a href={url} target="_blank" rel="noreferrer" />} aria-label={`Open tweet ${rank} on X`}><ExternalLinkIcon aria-hidden /><span>Open</span></Button>
        </div>
      </div>
    </div>
  </article>;
}
