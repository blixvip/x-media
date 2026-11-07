import type { PostMedia } from './tracker/types';
import type { ReferenceInput } from '@/x-master/lib/x-references';

type PostSource = { id: string; username: string; text: string; createdAt: string; media: PostMedia[] };
const safeUrl = (value: string | undefined, host: string) => {
  try { const url = new URL(value || ''); return url.protocol === 'https:' && url.hostname === host && !url.username && !url.password ? url.href : undefined; } catch { return undefined; }
};

/** Preserve every attachment's order so delayed video resolution selects the correct file. */
export function masterReference(post: PostSource): ReferenceInput {
  return {
    post_id: post.id, source_url: `https://x.com/${post.username}/status/${post.id}`,
    source_text: post.text, author_name: post.username, author_handle: post.username,
    published_at: post.createdAt, complete: !/(?:…|\.\.\.)\s*$/.test(post.text),
    attachments: post.media.slice(0, 8).map((media, position) => {
      const video = media.type !== 'photo';
      const source = video ? [...media.variants].filter(v => v.contentType === 'video/mp4' || /\.mp4(?:\?|$)/i.test(v.url)).sort((a,b) => (b.bitRate || 0) - (a.bitRate || 0)).map(v => safeUrl(v.url, 'video.twimg.com')).find(Boolean) : safeUrl(media.url, 'pbs.twimg.com');
      return { kind: video ? 'video' : 'image', position, source_url: source, preview_url: safeUrl(media.previewImageUrl, 'pbs.twimg.com') };
    }),
  };
}
