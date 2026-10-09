import { useEffect, useRef } from 'preact/hooks';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

export interface SeriesSpec {
  label: string;
  color: string;
  /** Dashed reference line (e.g. "normal price"). */
  dash?: boolean;
}

interface Props {
  /** x values in seconds since epoch, then one array per series. */
  x: number[];
  ys: (number | null)[][];
  series: SeriesSpec[];
  height?: number;
  width?: number;
  /** Format a y value for axis and legend. */
  fmt?: (v: number) => string;
}

const AXIS = { stroke: '#7b8794', font: '11px Inter, system-ui, sans-serif', grid: { stroke: '#eef2f5', width: 1 }, ticks: { show: false } };

/**
 * Thin wrapper around uPlot: 2px lines, recessive grid, one y-axis, and a
 * live legend that doubles as the hover readout (crosshair tooltip).
 */
export function Chart({ x, ys, series, height = 190, width = 396, fmt = (v) => v.toFixed(0) }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  const key = series.map((s) => s.label + s.color).join('|') + width + height;

  useEffect(() => {
    if (!ref.current) return;
    const opts: uPlot.Options = {
      width,
      height,
      cursor: { points: { size: 8 }, drag: { x: false, y: false } },
      legend: { show: true, live: true },
      scales: { x: { time: true } },
      axes: [
        { ...AXIS, space: 60 },
        { ...AXIS, size: 54, values: (_u, vals) => vals.map((v) => (v == null ? '' : fmt(v))) },
      ],
      series: [
        { label: 'Date', value: (_u, v) => (v == null ? '—' : new Date(v * 1000).toISOString().slice(0, 7)) },
        ...series.map((s) => ({
          label: s.label,
          stroke: s.color,
          width: 2,
          dash: s.dash ? [5, 4] : undefined,
          points: { show: false },
          value: (_u: uPlot, v: number | null) => (v == null ? '—' : fmt(v)),
        })),
      ],
    };
    plot.current = new uPlot(opts, [x, ...ys] as uPlot.AlignedData, ref.current);
    return () => {
      plot.current?.destroy();
      plot.current = null;
    };
  }, [key]);

  useEffect(() => {
    plot.current?.setData([x, ...ys] as uPlot.AlignedData);
  });

  if (x.length < 2) return <p class="muted small">Not enough data yet: keep playing.</p>;
  return <div class="chart" ref={ref} />;
}
