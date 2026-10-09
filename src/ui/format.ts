export function money(v: number, opts: { sign?: boolean; compact?: boolean } = {}): string {
  const neg = v < 0;
  const a = Math.abs(v);
  let s: string;
  if (opts.compact && a >= 1e9) s = `${(a / 1e9).toFixed(2)}B`;
  else if (opts.compact && a >= 1e6) s = `${(a / 1e6).toFixed(2)}M`;
  else if (opts.compact && a >= 1e4) s = `${(a / 1e3).toFixed(1)}k`;
  else s = Math.round(a).toLocaleString('en-US');
  const sign = neg ? '−' : opts.sign ? '+' : '';
  return `${sign}$${s}`;
}

export function price(v: number): string {
  return `$${v >= 100 ? v.toFixed(0) : v.toFixed(2)}`;
}

export function pct(v: number, digits = 0): string {
  return `${(v * 100).toFixed(digits)}%`;
}

export function tons(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k t`;
  if (v >= 10) return `${v.toFixed(0)} t`;
  return `${v.toFixed(1)} t`;
}

export const cls = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ');
