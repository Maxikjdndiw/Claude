/** Tiny inline sparkline (SVG). */
export function Spark({ values, width = 64, height = 18 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return <span class="muted">—</span>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => `${((i / (values.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`)
    .join(' ');
  const up = values[values.length - 1] >= values[0];
  return (
    <svg width={width} height={height} class="spark">
      <polyline points={pts} fill="none" stroke={up ? '#3f9a62' : '#d4574a'} stroke-width="1.5" />
    </svg>
  );
}
