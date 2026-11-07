export const observedMetricNames = ['views', 'likes', 'reposts', 'replies'] as const;
export type ObservedMetric = typeof observedMetricNames[number];
export type ObservedMetrics = Partial<Record<ObservedMetric, number>>;
export type MetricChange = { metric: ObservedMetric; delta: number };
export type MetricSnapshot = { at: string; metrics: ObservedMetrics };

export function observedMetricChanges(previous: MetricSnapshot | undefined, current: MetricSnapshot): MetricChange[] {
  if (!previous) return [];
  const gap = Date.parse(current.at) - Date.parse(previous.at);
  if (!Number.isFinite(gap) || gap <= 0 || gap > 300_000) return [];
  return observedMetricNames.flatMap(metric => {
    const before = previous.metrics[metric];
    const after = current.metrics[metric];
    if (typeof before !== 'number' || typeof after !== 'number'
      || !Number.isSafeInteger(before) || !Number.isSafeInteger(after)
      || before < 0 || after < 0 || before === after) return [];
    return [{ metric, delta: after - before }];
  });
}
