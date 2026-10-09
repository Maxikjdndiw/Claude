import { useState } from 'preact/hooks';
import { GOOD, GOODS } from '../../data/goods';
import type { Game } from '../../game';
import { expenses, netProfit } from '../../sim/finance';
import { refPrice } from '../../sim/market';
import { dateOf } from '../../sim/time';
import { cls, money, pct } from '../format';
import { useStore } from '../store';
import { Chart } from '../widgets/Chart';

/** Categorical series order (validated for color-vision deficiency); never cycled. */
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];

type Tab = 'prices' | 'pnl' | 'share' | 'value' | 'economy';

const sec = (day: number) => dateOf(day).getTime() / 1000;

/** x positions of a weekly history whose last sample was taken in the last 7 days. */
function weeklyX(day: number, n: number): number[] {
  const last = Math.max(0, Math.floor((day - 1) / 7) * 7);
  return Array.from({ length: n }, (_, i) => sec(Math.max(0, last - 7 * (n - 1 - i))));
}

export function ChartsPanel({ game }: { game: Game }) {
  useStore(game.ui, (s) => s.tick);
  const st = game.state!;
  const [tab, setTab] = useState<Tab>('prices');
  const [town, setTown] = useState(0);
  const sold = GOODS.filter((g) => st.towns.some((t) => (t.market[g.id].share[0] ?? 0) > 0)).map((g) => g.id);
  const [goods, setGoods] = useState<string[]>(sold.length ? sold.slice(0, 3) : ['wheat', 'flour', 'bread']);
  const [shareGood, setShareGood] = useState<string>(sold[0] ?? 'bread');
  const me = st.companies[0];

  let body = null;
  if (tab === 'prices') {
    const t = st.towns[Math.min(town, st.towns.length - 1)];
    const n = Math.min(...goods.map((g) => t.market[g].history.length));
    const x = weeklyX(st.day, n);
    body = (
      <>
        <div class="row wrap">
          <select value={town} onChange={(e) => setTown(Number((e.target as HTMLSelectElement).value))} style={{ width: 'auto' }}>
            {st.towns.map((tw) => (
              <option key={tw.id} value={tw.id}>
                {tw.name}
              </option>
            ))}
          </select>
          {GOODS.map((g) => (
            <button
              key={g.id}
              class={cls('chip-btn', goods.includes(g.id) && 'on')}
              onClick={() => {
                const on = goods.includes(g.id);
                if (on && goods.length > 1) setGoods(goods.filter((x) => x !== g.id));
                else if (!on && goods.length < SERIES.length) setGoods([...goods, g.id]);
              }}
            >
              {g.icon} {g.name}
            </button>
          ))}
        </div>
        <Chart
          x={x}
          ys={goods.map((g) => t.market[g].history.slice(-n))}
          series={goods.map((g, i) => ({ label: GOOD[g].name, color: SERIES[i] }))}
          fmt={(v) => `$${v.toFixed(0)}`}
        />
        <p class="muted small">
          Weekly prices in {t.name}. Normal prices today:{' '}
          {goods.map((g) => `${GOOD[g].name} $${refPrice(st, g).toFixed(0)}`).join(', ')}. Prices below normal mean the town is
          oversupplied.
        </p>
      </>
    );
  } else if (tab === 'pnl') {
    const h = me.history;
    const x = h.map((m) => sec(m.day - 1));
    body = (
      <>
        <Chart
          x={x}
          ys={[h.map((m) => m.ledger.sales), h.map((m) => expenses(m.ledger)), h.map((m) => netProfit(m.ledger))]}
          series={[
            { label: 'Revenue', color: SERIES[0] },
            { label: 'Costs', color: SERIES[1] },
            { label: 'Net profit', color: SERIES[2] },
          ]}
          fmt={(v) => money(v, { compact: true })}
        />
        <p class="muted small">Monthly revenue, total costs and net profit. The gap between the first two lines is your profit.</p>
      </>
    );
  } else if (tab === 'share') {
    const rows = st.stats;
    const comps = st.companies.filter((c) => rows.some((r) => (r.shares[shareGood]?.[c.id] ?? 0) > 0));
    body = (
      <>
        <select value={shareGood} onChange={(e) => setShareGood((e.target as HTMLSelectElement).value)} style={{ width: 'auto' }}>
          {GOODS.map((g) => (
            <option key={g.id} value={g.id}>
              {g.icon} {g.name}
            </option>
          ))}
        </select>
        {comps.length === 0 ? (
          <p class="muted small">No company sells {GOOD[shareGood].name.toLowerCase()} yet.</p>
        ) : (
          <Chart
            x={rows.map((r) => sec(r.day - 1))}
            ys={comps.map((c) => rows.map((r) => (r.shares[shareGood]?.[c.id] ?? 0) * 100))}
            series={comps.map((c) => ({ label: c.name, color: c.color }))}
            fmt={(v) => `${v.toFixed(0)}%`}
          />
        )}
        <p class="muted small">Share of all {GOOD[shareGood].name.toLowerCase()} sold in every town, by company (the rest comes from outside traders).</p>
      </>
    );
  } else if (tab === 'value') {
    const comps = st.companies.filter((c) => c.history.length);
    const n = Math.max(...comps.map((c) => c.history.length));
    const ref = comps.find((c) => c.history.length === n)!;
    const listed = st.companies.filter((c) => c.equity.listed && c.equity.history.length > 1);
    const pn = listed.length ? Math.min(...listed.map((c) => c.equity.history.length)) : 0;
    body = (
      <>
        <h3>Company value</h3>
        <Chart
          x={ref.history.map((m) => sec(m.day - 1))}
          ys={comps.map((c) => {
            const pad = n - c.history.length;
            return [...Array(pad).fill(null), ...c.history.map((m) => m.value)];
          })}
          series={comps.map((c) => ({ label: c.name, color: c.color }))}
          fmt={(v) => money(v, { compact: true })}
        />
        <h3>Share prices (listed companies)</h3>
        {listed.length === 0 ? (
          <p class="muted small">No company is listed yet.</p>
        ) : (
          <Chart
            x={weeklyX(st.day, pn)}
            ys={listed.map((c) => c.equity.history.slice(-pn))}
            series={listed.map((c) => ({ label: c.name, color: c.color }))}
            fmt={(v) => `$${v.toFixed(2)}`}
          />
        )}
      </>
    );
  } else {
    const h = st.macro.history;
    body = (
      <>
        <Chart
          x={h.map((m) => sec(m.day - 1))}
          ys={[h.map((m) => m.inflation * 100), h.map((m) => m.baseRate * 100), h.map((m) => m.gap * 100)]}
          series={[
            { label: 'Inflation', color: SERIES[1] },
            { label: 'Central bank rate', color: SERIES[0] },
            { label: 'Output gap', color: SERIES[2] },
          ]}
          fmt={(v) => `${v.toFixed(1)}%`}
        />
        <p class="muted small">
          The central bank raises its rate when inflation climbs above 2% and cuts it when the output gap turns negative
          (recession). Price level since start: +{pct(st.priceLevel - 1, 1)}.
        </p>
      </>
    );
  }

  const tabs: [Tab, string][] = [
    ['prices', 'Prices'],
    ['pnl', 'Profit & loss'],
    ['share', 'Market share'],
    ['value', 'Values & shares'],
    ['economy', 'Economy'],
  ];
  return (
    <aside class="side panel left wide">
      <div class="row between">
        <h2>Charts</h2>
        <button class="btn small ghost" onClick={() => game.setLeftPanel('charts')}>
          ✕
        </button>
      </div>
      <div class="dock-tabs wrap">
        {tabs.map(([id, label]) => (
          <button key={id} class={cls('tab', tab === id && 'on')} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <div class="chart-body">{body}</div>
    </aside>
  );
}
