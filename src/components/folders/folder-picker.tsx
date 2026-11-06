"use client";

import { useState } from "react";
import { FolderPlusIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { mediaKey, type FolderList, type FolderSummary, type MediaReference } from "@/lib/folders/types";

export async function foldersApi<T>(path = "", method = "GET", data?: unknown): Promise<T> {
  const response = await fetch(`/api/folders${path}`, { method, cache: "no-store", headers: data === undefined ? undefined : { "Content-Type": "application/json" }, body: data === undefined ? undefined : JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not update your folders. Please retry.");
  return result;
}

export function FolderPicker({ media, onSaved, label }: { media: MediaReference; onSaved?: () => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const [folders, setFolders] = useState<FolderSummary[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  async function load() {
    setLoading(true); setReady(false); setError("");
    try { const data = await foldersApi<FolderList>(`?itemKey=${encodeURIComponent(mediaKey(media))}`); setFolders(data.folders); setSelected(data.memberships); setReady(true); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }
  async function create() {
    setBusy(true); setError("");
    try { const folder = await foldersApi<FolderSummary>("", "POST", { name }); setFolders(previous => [...previous, folder]); setSelected(previous => [...previous, folder.id]); setName(""); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function save() {
    setBusy(true); setError("");
    try { await foldersApi("/memberships", "PUT", { media, folderIds: selected }); setOpen(false); onSaved?.(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <>
    <Button variant="ghost" size="sm" aria-label={label} onClick={() => { setOpen(true); setName(""); void load(); }}><FolderPlusIcon aria-hidden />Folders</Button>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
      <DialogContent>
        <DialogHeader className="pr-8"><DialogTitle>Organize in folders</DialogTitle><DialogDescription>Choose one or more folders. Uncheck a folder to remove this item from it.</DialogDescription></DialogHeader>
        {loading ? <p role="status" className="py-5 text-sm text-muted-foreground">Loading your folders…</p> : ready && <>
          <div className="max-h-64 space-y-1 overflow-y-auto" role="group" aria-label="Choose folders">
            {folders.length ? folders.map(folder => <label key={folder.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-3 hover:bg-muted">
              <input type="checkbox" className="size-4 shrink-0 accent-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" disabled={busy} checked={selected.includes(folder.id)} onChange={event => setSelected(previous => event.target.checked ? [...previous, folder.id] : previous.filter(id => id !== folder.id))} />
              <span className="min-w-0 flex-1 break-words">{folder.name}</span><span className="shrink-0 text-xs tabular-nums text-muted-foreground">{folder.count}</span>
            </label>) : <p className="py-3 text-sm text-muted-foreground">Create your first folder below.</p>}
          </div>
          <form className="flex items-end gap-2 border-t pt-4" onSubmit={event => { event.preventDefault(); void create(); }}>
            <label className="min-w-0 flex-1 space-y-2 text-sm"><span>New folder</span><Input className="h-9" value={name} onChange={event => setName(event.target.value)} maxLength={80} placeholder="e.g. Coding memes" disabled={busy} /></label>
            <Button type="submit" variant="outline" disabled={busy || !name.trim()} aria-label="Create folder"><PlusIcon aria-hidden />Create</Button>
          </form>
        </>}
        {error && <div role="alert" className="text-sm text-destructive">{error}{!ready && <Button className="ml-2" size="sm" variant="outline" onClick={() => void load()}>Retry</Button>}</div>}
        <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button disabled={busy || loading || !ready} onClick={() => void save()}>{busy ? "Saving…" : "Save folders"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
