"use client";

import type { ReactNode } from "react";
import type { RadarView } from "@/x-master/lib/x-radar-view";
import { ArrowLeftIcon, PlayIcon } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export function MediaHeader({ source = "x", masterView, onMasterNavigate, actions }: {
  source?: "x" | "posts" | "reddit" | "folders" | "master";
  masterView?: RadarView;
  onMasterNavigate?: (view: RadarView) => void;
  actions?: ReactNode;
}) {
  return <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-md">
    <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center gap-2 px-3 py-2 xl:flex-nowrap sm:gap-3 sm:px-6 lg:px-8">
      <Link href="/" aria-label="X Media home" className="flex shrink-0 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="relative flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-blue-500/20 bg-blue-500/10 text-blue-700 sm:size-9 sm:rounded-xl dark:text-blue-300">
          <PlayIcon className="relative z-10 size-5" aria-hidden />
          <span aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_85%_10%,rgba(27,175,122,0.34),transparent_58%)]" />
        </span>
        <span className="block"><span className="block font-semibold tracking-tight">X Media</span><span className="hidden text-xs text-muted-foreground md:block">Media & workspace</span></span>
      </Link>
      <nav aria-label="Media source" className="order-3 flex w-full min-w-0 items-center gap-0.5 overflow-x-auto rounded-lg border bg-card p-1 [&_a]:shrink-0 [&_a]:px-2 xl:order-none xl:ml-5 xl:w-auto sm:gap-1 sm:[&_a]:px-2.5">
        <Button size="sm" variant={source === "x" ? "secondary" : "ghost"} nativeButton={false} role="link" render={<Link href="/" aria-current={source === "x" ? "page" : undefined} />}>Media</Button>
        <Button size="sm" variant={source === "posts" ? "secondary" : "ghost"} nativeButton={false} role="link" render={<Link href="/posts" aria-current={source === "posts" ? "page" : undefined} />}>Tweets</Button>
        <Button size="sm" variant={source === "reddit" ? "secondary" : "ghost"} nativeButton={false} role="link" render={<Link href="/reddit" aria-current={source === "reddit" ? "page" : undefined} />}>Reddit</Button>
        <Button size="sm" variant={source === "folders" ? "secondary" : "ghost"} nativeButton={false} role="link" render={<Link href="/folders" aria-current={source === "folders" ? "page" : undefined} />}>Folders</Button>
        {([{ view: "posts", label: "Feed" }, { view: "trending", label: "Trending" }, { view: "saved", label: "Saved" }, { view: "drafts", label: "Drafts" }] as const).map(({ view, label }) =>
          <Button key={view} size="sm" variant={source === "master" && masterView === view ? "secondary" : "ghost"} nativeButton={false} role="link" render={<Link href={`/x-master?view=${view}`} aria-current={source === "master" && masterView === view ? "page" : undefined} onClick={event => {
            if (onMasterNavigate && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0) { event.preventDefault(); onMasterNavigate(view); }
          }} />}>{label}</Button>)}
      </nav>
      <div className="ml-auto flex items-center gap-0 sm:gap-2">
        <Button size="sm" variant="ghost" nativeButton={false} role="link" render={<Link href="/sync" />}>Synced saves</Button>
        <Button className="size-7 p-0 sm:h-8 sm:w-auto sm:px-2.5" variant="ghost" nativeButton={false} role="link" render={<Link href="/dashboard" aria-label="Dashboard" />}><ArrowLeftIcon aria-hidden /><span className="hidden sm:inline">Dashboard</span></Button>
        {actions}
        <ThemeToggle />
      </div>
    </div>
  </header>;
}
