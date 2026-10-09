import { BUILDING } from '../../data/buildings';
import type { Game } from '../../game';
import {
  bookEquity,
  companyValue,
  debtOf,
  expenses,
  fixedAssets,
  inventoryValue,
  investmentsValue,
  netProfit,
  operatingProfit,
  trailing,
} from '../../sim/finance';
import type { Ledger } from '../../sim/state';
import { monthLabel } from '../../sim/time';
import { cls, money, pct } from '../format';
import { useStore } from '../store';

const ROWS: { key: keyof Ledger; label: string; kind: 'var' | 'fixed' | 'other' }[] = [
  { key: 'materials', label: 'Materials bought', kind: 'var' },
  { key: 'transport', label: 'Transport & handling', kind: 'var' },
  { key: 'wages', label: 'Wages', kind: 'var' },
  { key: 'maintenance', label: 'Upkeep', kind: 'fixed' },
  { key: 'training', label: 'Training', kind: 'fixed' },
  { key: 'research', label: 'Research & surveys', kind: 'fixed' },
  { key: 'depreciation', label: 'Depreciation', kind: 'fixed' },
  { key: 'interest', label: 'Interest', kind: 'other' },
  { key: 'tax', label: 'Corporate tax', kind: 'other' },
];

function Statement({ cols }: { cols: { label: string; l: Ledger }[] }) {
  return (
    <table class="tbl fin">
      <thead>
        <tr>
          <th />
          {cols.map((c) => (
            <th key={c.label}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr class="strong">
          <td>Revenue</td>
          {cols.map((c) => (
            <td key={c.label}>{money(c.l.sales)}</td>
          ))}
        </tr>
        {ROWS.slice(0, 3).map((r) => (
          <tr key={r.key}>
            <td title="Variable cost: rises with output">− {r.label}</td>
            {cols.map((c) => (
              <td key={c.label}>{money(c.l[r.key])}</td>
            ))}
          </tr>
        ))}
        <tr class="sub">
          <td title="Revenue minus variable costs">Contribution margin</td>
          {cols.map((c) => {
            const v = c.l.sales - c.l.materials - c.l.transport - c.l.wages;
            return (
              <td key={c.label} class={cls(v < 0 && 'neg')}>
                {money(v)}
              </td>
            );
          })}
        </tr>
        {ROWS.slice(3, 7).map((r) => (
          <tr key={r.key}>
            <td title="Fixed cost: paid regardless of output">− {r.label}</td>
            {cols.map((c) => (
              <td key={c.label}>{money(c.l[r.key])}</td>
            ))}
          </tr>
        ))}
        <tr class="sub">
          <td>Operating profit</td>
          {cols.map((c) => {
            const v = operatingProfit(c.l);
            return (
              <td key={c.label} class={cls(v < 0 && 'neg')}>
                {money(v)}
              </td>
            );
          })}
        </tr>
        {ROWS.slice(7).map((r) => (
          <tr key={r.key}>
            <td>− {r.label}</td>
            {cols.map((c) => (
              <td key={c.label}>{money(c.l[r.key])}</td>
            ))}
          </tr>
        ))}
        <tr class="strong">
          <td>Net profit</td>
          {cols.map((c) => {
            const v = netProfit(c.l);
            return (
              <td key={c.label} class={cls(v < 0 ? 'neg' : 'pos')}>
                {money(v, { sign: true })}
              </td>
            );
          })}
        </tr>
        <tr>
          <td>Net margin</td>
          {cols.map((c) => (
            <td key={c.label}>{c.l.sales > 0 ? pct(netProfit(c.l) / c.l.sales) : '—'}</td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

export function FinancePanel({ game }: { game: Game }) {
  useStore(game.ui, (s) => s.tick);
  const st = game.state!;
  const me = st.companies[0];
  const last = me.history[me.history.length - 1];
  const cols = [{ label: 'This month', l: me.month }];
  if (last) cols.push({ label: monthLabel(last.day - 1), l: last.ledger });
  if (me.history.length > 1) cols.push({ label: `Last ${Math.min(12, me.history.length)} mo`, l: trailing(me, 12) });

  const mine = st.buildings.filter((b) => b.owner === 0);
  const fixed = fixedAssets(st, 0);
  const inv = inventoryValue(st, 0);
  const invest = investmentsValue(st, me);
  const debt = debtOf(st, 0);
  const cf = last?.cashflow;

  return (
    <aside class="side panel left wide">
      <div class="row between">
        <h2>Finances</h2>
        <button class="btn small ghost" onClick={() => game.setLeftPanel('finance')}>
          ✕
        </button>
      </div>
      <h3>Income statement</h3>
      <Statement cols={cols} />

      <h3>Cash flow {last ? `(${monthLabel(last.day - 1)})` : '(this month)'}</h3>
      <table class="tbl fin">
        <tbody>
          {(['operating', 'investing', 'financing'] as const).map((k) => {
            const v = (cf ?? me.cashflow)[k];
            return (
              <tr key={k}>
                <td>{k[0].toUpperCase() + k.slice(1)} activities</td>
                <td class={cls(v < 0 && 'neg')}>{money(v, { sign: true })}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p class="muted small">
        Profit is not cash: building a factory costs cash today (investing) but shows up as depreciation spread over its
        life.
      </p>

      <h3>Balance sheet</h3>
      <table class="tbl fin">
        <tbody>
          <tr>
            <td>Cash</td>
            <td>{money(me.cash)}</td>
          </tr>
          <tr>
            <td>Buildings & vehicles (book value)</td>
            <td>{money(fixed)}</td>
          </tr>
          <tr>
            <td>Inventory</td>
            <td>{money(inv)}</td>
          </tr>
          <tr>
            <td>Shares in other companies</td>
            <td>{money(invest)}</td>
          </tr>
          <tr class="sub">
            <td>Total assets</td>
            <td>{money(Math.max(0, me.cash) + fixed + inv + invest)}</td>
          </tr>
          <tr>
            <td>− Loans</td>
            <td>{money(debt)}</td>
          </tr>
          {me.cash < 0 && (
            <tr>
              <td>− Overdraft</td>
              <td>{money(-me.cash)}</td>
            </tr>
          )}
          <tr class="sub">
            <td>Equity (book)</td>
            <td>{money(bookEquity(st, me))}</td>
          </tr>
          <tr class="strong">
            <td>{me.equity.listed ? 'Market capitalization' : 'Company value (est.)'}</td>
            <td>{money(companyValue(st, me))}</td>
          </tr>
        </tbody>
      </table>

      <h3>Your buildings</h3>
      <table class="tbl">
        <thead>
          <tr>
            <th>Building</th>
            <th>Workers</th>
            <th>Profit (last mo)</th>
          </tr>
        </thead>
        <tbody>
          {mine
            .filter((b) => b.type !== 'hq')
            .map((b) => {
              const p = b.last.revenue - b.last.costs;
              return (
                <tr key={b.id} class="clickable" onClick={() => game.focusBuilding(b.id)}>
                  <td>
                    {BUILDING[b.type].name} {b.level > 1 && <span class="muted">L{b.level}</span>}
                  </td>
                  <td>
                    {b.workers}/{b.targetWorkers}
                  </td>
                  <td class={cls(p < 0 ? 'neg' : 'pos')}>{money(p, { sign: true })}</td>
                </tr>
              );
            })}
        </tbody>
      </table>
      <p class="muted small">Total expenses this month: {money(expenses(me.month))}</p>
    </aside>
  );
}
