export type XMeme = {
  id: string;
  title: string;
  src: string;
  poster: string;
  duration_seconds: number;
  tags: string[];
};

export const X_MEMES: readonly XMeme[] = Object.freeze([
  { id: "homelander-cry", title: "Homelander cry", src: "/memes/homelander-cry.mp4", poster: "/memes/thumbs/homelander-cry.jpg", duration_seconds: 5, tags: ["cry", "sad", "pain", "dramatic", "reaction"] },
  { id: "splitnow-how-do-you-know", title: "How do you know I use SplitNOW?", src: "/memes/splitnow-how-do-you-know.mp4", poster: "/memes/thumbs/splitnow-how-do-you-know.jpg", duration_seconds: 9, tags: ["split now", "obvious", "flex", "product", "reaction"] },
  { id: "delete-this-now", title: "Delete this now", src: "/memes/delete-this-now.mp4", poster: "/memes/thumbs/delete-this-now.jpg", duration_seconds: 8, tags: ["delete", "bad take", "stop", "reaction"] },
  { id: "calm-scenes", title: "Calm scenes", src: "/memes/calm-scenes.mp4", poster: "/memes/thumbs/calm-scenes.jpg", duration_seconds: 9, tags: ["calm", "chaos", "everything fine", "disaster", "reaction"] },
  { id: "openclaw-reaction", title: "Me after my OpenClaw", src: "/memes/openclaw-reaction.mp4", poster: "/memes/thumbs/openclaw-reaction.jpg", duration_seconds: 16, tags: ["open claw", "openclaw", "ai", "agent", "automation", "reaction"] },
  { id: "clash-builder", title: "Clash builder", src: "/memes/clash-builder.mp4", poster: "/memes/thumbs/clash-builder.jpg", duration_seconds: 10, tags: ["builder", "building", "coding", "shipping", "game"] },
  { id: "reaction-ezj2vp", title: "Reaction clip", src: "/memes/reaction-ezj2vp.mp4", poster: "/memes/thumbs/reaction-ezj2vp.jpg", duration_seconds: 11, tags: ["reaction", "surprised", "mood"] },
  { id: "dialed-in", title: "Dialed in", src: "/memes/dialed-in.mp4", poster: "/memes/thumbs/dialed-in.jpg", duration_seconds: 18, tags: ["dialed in", "focused", "locked in", "grind", "work"] },
  { id: "meow-meow", title: "Meow meow", src: "/memes/meow-meow.mp4", poster: "/memes/thumbs/meow-meow.jpg", duration_seconds: 25, tags: ["cat", "meow", "cute", "silly", "reaction"] },
  { id: "thanos", title: "Thanos", src: "/memes/thanos.mp4", poster: "/memes/thumbs/thanos.jpg", duration_seconds: 14, tags: ["thanos", "inevitable", "marvel", "power", "reaction"] },
  { id: "tuff-monkeys", title: "Tuff monkeys", src: "/memes/tuff-monkeys.mp4", poster: "/memes/thumbs/tuff-monkeys.jpg", duration_seconds: 25, tags: ["monkey", "tough", "gang", "team", "reaction"] },
  { id: "test-clip", title: "Test clip", src: "/memes/test-clip.mp4", poster: "/memes/thumbs/test-clip.jpg", duration_seconds: 70, tags: ["test", "clip", "reaction"] },
]);

function searchable(value: string) {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, " ").trim();
}

export function filterMemeLibrary(memes: readonly XMeme[], query: string): XMeme[] {
  const terms = searchable(query).split(" ").filter(Boolean);
  if (!terms.length) return [...memes];
  return memes.filter((meme) => {
    const haystack = searchable(`${meme.title} ${meme.tags.join(" ")}`);
    return terms.every((term) => haystack.includes(term));
  });
}
