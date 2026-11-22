export function scrollbarMetrics({ viewport, content, track, offset }: {
  viewport: number; content: number; track: number; offset: number;
}) {
  const maxOffset = Math.max(0, content - viewport);
  const boundedOffset = Math.max(0, Math.min(maxOffset, offset));
  const scrollable = viewport > 0 && track > 0 && maxOffset > 1;
  const thumbSize = scrollable ? Math.min(track, Math.max(32, viewport / content * track)) : track;
  const travel = Math.max(0, track - thumbSize);
  const thumbOffset = scrollable ? boundedOffset / maxOffset * travel : 0;
  return { maxOffset, offset: boundedOffset, scrollable, thumbSize, thumbOffset, travel };
}

export function offsetFromThumb(position: number, metrics: { travel: number; maxOffset: number }) {
  if (metrics.travel <= 0) return 0;
  return Math.max(0, Math.min(metrics.maxOffset, position / metrics.travel * metrics.maxOffset));
}
