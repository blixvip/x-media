import { buildStorylines, type EnrichedXSignal, type XStoryline } from "./x-radar-intelligence.ts";
import type { XTrend } from "./x-radar.ts";

export type BriefingPhase = "breaking" | "overnight" | "still_moving" | "anticipated";

export type MorningBriefingStory = {
  id: string;
  title: string;
  phase: BriefingPhase;
  momentum: number;
  post_count: number;
  unique_creators: number;
  post_ids: string[];
  top_post_url: string;
  latest_age_seconds: number;
  reasons: string[];
  personalized: boolean;
  trend_rank?: number;
};

const GENERIC_STORYLINES = new Set([
  "AI Agents", "Developer Tools", "AI & Creator Work", "Coding creators",
  "Models & launches", "Creator Conversation", "Creator watch",
]);
const ANTICIPATION = /\b(?:coming soon|coming next|next week|next month|tomorrow|waitlist|pre-?order|preview|teas(?:e|er|ing)|watch this space|cannot wait|can't wait|countdown|upcoming|on the horizon|roadmap|prepar(?:e|es|ed|ing) to (?:release|launch|ship)|working on (?:a |the )?new|building (?:a |the )?new)\b/i;

function readableHeadline(signal: EnrichedXSignal) {
  const text = (signal.body ?? signal.title).split(/\r?\n/).map((part) => part.trim()).find(Boolean) ?? signal.title;
  return text.replace(/\s+/g, " ").slice(0, 150);
}

function phaseFor(posts: EnrichedXSignal[]): BriefingPhase {
  const newestAge = Math.min(...posts.map((post) => post.age_seconds));
  const combined = posts.map((post) => `${post.title} ${post.body ?? ""}`).join(" ");
  if (ANTICIPATION.test(combined)) return "anticipated";
  if (newestAge <= 6 * 60 * 60 && posts.some((post) => post.is_big_launch || post.is_growing_fast || post.score.potential >= 70)) return "breaking";
  if (newestAge <= 18 * 60 * 60) return "overnight";
  return "still_moving";
}

function storyReasons(posts: EnrichedXSignal[], storyline?: XStoryline) {
  const reasons: string[] = [];
  if (phaseFor(posts) === "anticipated") reasons.push("Anticipation language rising");
  if (posts.some((post) => post.is_big_launch)) reasons.push("Major launch evidence");
  if (posts.some((post) => post.is_growing_fast)) reasons.push("Observed acceleration");
  const creators = new Set(posts.map((post) => post.creator?.username).filter(Boolean)).size;
  if (creators >= 2) reasons.push(`${creators} tracked creators discussing it`);
  if (storyline?.trend_rank) reasons.push(`X trend #${storyline.trend_rank}`);
  if (posts.some((post) => post.personalized)) reasons.push("Seen in your X home timeline");
  if (!reasons.length) reasons.push("High niche momentum");
  return reasons.slice(0, 4);
}

function momentumFor(posts: EnrichedXSignal[]) {
  const sorted = posts.map((post) => post.score.potential).sort((left, right) => right - left);
  const strongest = sorted[0] ?? 0;
  const average = sorted.reduce((total, score) => total + score, 0) / Math.max(1, sorted.length);
  const diversity = Math.min(10, new Set(posts.map((post) => post.creator?.username).filter(Boolean)).size * 2);
  return Math.min(100, Math.round(strongest * 0.65 + average * 0.25 + diversity));
}

export function buildMorningBriefing(
  signals: EnrichedXSignal[],
  trends: readonly XTrend[],
  keywords: readonly string[],
): MorningBriefingStory[] {
  const nicheTerms = keywords.map((keyword) => keyword.trim().toLocaleLowerCase("en-US")).filter(Boolean);
  const eligible = signals.filter((signal) => {
    const text = `${signal.title} ${signal.body ?? ""} ${signal.topic ?? ""}`.toLocaleLowerCase("en-US");
    const explicitNicheMatch = nicheTerms.some((term) => text.includes(term));
    return signal.age_seconds <= 3 * 24 * 60 * 60 && (signal.personalized || signal.score.relevance >= 20 || explicitNicheMatch);
  });
  const storylines = buildStorylines(eligible, trends);
  const usedPostIds = new Set<string>();
  const stories: MorningBriefingStory[] = [];

  for (const storyline of storylines) {
    if (GENERIC_STORYLINES.has(storyline.title)) continue;
    const posts = storyline.post_ids
      .map((id) => eligible.find((signal) => signal.id === id))
      .filter((signal): signal is EnrichedXSignal => Boolean(signal));
    if (!posts.length) continue;
    posts.forEach((post) => usedPostIds.add(post.id));
    const top = posts.slice().sort((left, right) => right.score.potential - left.score.potential)[0];
    const headline = readableHeadline(top);
    stories.push({
      id: `story-${storyline.id}`,
      title: headline.toLocaleLowerCase("en-US").includes(storyline.title.toLocaleLowerCase("en-US")) ? headline : `${storyline.title}: ${headline}`,
      phase: phaseFor(posts),
      momentum: momentumFor(posts),
      post_count: posts.length,
      unique_creators: new Set(posts.map((post) => post.creator?.username).filter(Boolean)).size,
      post_ids: posts.map((post) => post.id).slice(0, 8),
      top_post_url: top.source_url,
      latest_age_seconds: Math.min(...posts.map((post) => post.age_seconds)),
      reasons: storyReasons(posts, storyline),
      personalized: posts.some((post) => post.personalized),
      ...(storyline.trend_rank ? { trend_rank: storyline.trend_rank } : {}),
    });
  }

  for (const post of eligible) {
    if (usedPostIds.has(post.id)) continue;
    const anticipated = ANTICIPATION.test(`${post.title} ${post.body ?? ""}`);
    if (!post.personalized && !post.is_big_launch && !post.is_growing_fast && !anticipated && post.score.potential < 48) continue;
    stories.push({
      id: `post-${post.id}`,
      title: readableHeadline(post),
      phase: phaseFor([post]),
      momentum: momentumFor([post]),
      post_count: 1,
      unique_creators: post.creator?.username ? 1 : 0,
      post_ids: [post.id],
      top_post_url: post.source_url,
      latest_age_seconds: post.age_seconds,
      reasons: storyReasons([post]),
      personalized: post.personalized === true,
    });
  }

  const phasePriority: Record<BriefingPhase, number> = { breaking: 4, anticipated: 3, overnight: 2, still_moving: 1 };
  return stories
    .sort((left, right) => phasePriority[right.phase] - phasePriority[left.phase] || right.momentum - left.momentum || left.latest_age_seconds - right.latest_age_seconds)
    .slice(0, 24);
}
