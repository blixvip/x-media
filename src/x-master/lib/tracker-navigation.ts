export const trackerSources = [
  { id: 'all', label: 'All sources', mark: '◎' },
  { id: 'hacker_news', label: 'Hacker News', mark: 'Y' },
  { id: 'github', label: 'GitHub', mark: '⌘' },
  { id: 'bluesky', label: 'Bluesky', mark: '↗' },
  { id: 'youtube', label: 'YouTube', mark: '▶' },
] as const;
export type TrackerSource = typeof trackerSources[number]['id'];
export function parseTrackerSource(value: string | null): TrackerSource {
  return trackerSources.find(source => source.id === value)?.id ?? 'all';
}
export function filterTrackerSource<T extends { source: string }>(items: T[], source: TrackerSource): T[] {
  return source === 'all' ? items : items.filter(item => item.source === source);
}
export function trackerSourceUrl(source: TrackerSource): string {
  return source === 'all' ? '/?view=radar' : `/?view=radar&source=${source}`;
}
