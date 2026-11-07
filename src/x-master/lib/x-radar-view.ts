export type RadarView = "trending" | "brief" | "posts" | "create" | "drafts" | "library" | "media" | "analytics" | "basics" | "saved";
export type PostFilter = "latest" | "for_you" | "launches" | "growing";

export function parseRadarView(value: unknown): { view: RadarView; filter: PostFilter } {
  if (value === "trending") return { view: "trending", filter: "latest" };
  if (value === "launches") return { view: "posts", filter: "launches" };
  if (value === "fast") return { view: "posts", filter: "growing" };
  if (value === "all" || value === "queue" || value === "posts") return { view: "posts", filter: "latest" };
  if (value === "saved") return { view: "saved", filter: "latest" };
  if (value === "drafts") return { view: "drafts", filter: "latest" };
  if (value === "create") return { view: "create", filter: "latest" };
  if (value === "library") return { view: "library", filter: "latest" };
  if (value === "media") return { view: "media", filter: "latest" };
  if (value === "analytics") return { view: "analytics", filter: "latest" };
  if (value === "basics") return { view: "basics", filter: "latest" };
  if (["brief", "topics", "creators", "storylines"].includes(String(value))) return { view: "brief", filter: "latest" };
  return { view: "posts", filter: "latest" };
}
