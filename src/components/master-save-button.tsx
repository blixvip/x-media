"use client";

import { useState } from 'react';
import Link from 'next/link';
import { BookmarkIcon, CheckIcon, LoaderCircleIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ReferenceInput } from '@/x-master/lib/x-references';

export function MasterSaveButton({ reference }: { reference: ReferenceInput }) {
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [signin, setSignin] = useState(false);
  async function save() {
    setBusy(true); setError(''); setSignin(false);
    try {
      const response = await fetch('/api/x-master/references', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(reference) });
      const data = await response.json();
      if (!response.ok || !data.item?.id) { setSignin(response.status === 401 || response.status === 503); throw new Error(data.error || 'Save was not confirmed. Try again.'); }
      setSaved(true);
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not save. Try again.'); }
    finally { setBusy(false); }
  }
  return <div className="min-w-0">
    {saved ? <Button size="sm" variant="ghost" nativeButton={false} role="link" render={<Link href="/x-master?view=saved" />}><CheckIcon aria-hidden />Saved to X Master</Button> :
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void save()}>{busy ? <LoaderCircleIcon className="animate-spin" aria-hidden /> : <BookmarkIcon aria-hidden />}{busy ? 'Saving…' : 'Save to X Master'}</Button>}
    {error && <p role="status" className="mt-1 max-w-xs whitespace-normal text-xs text-destructive">{error}{signin && <> <Link className="underline" href="/x-master?view=saved&media=video">Open library</Link></>}</p>}
  </div>;
}
