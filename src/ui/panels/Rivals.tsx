import { PERSONALITIES } from '../../data/ai';
import { CATEGORIES } from '../../data/buildings';
import { GOODS } from '../../data/goods';
import type { Game } from '../../game';
import { companySummary, marketShares } from '../../sim/ai';
import { companyValue } from '../../sim/finance';
import { cls, money, pct } from '../format';
import { useStore } from '../store';

export function RivalsPanel({ game }: { game: Game }) {
  useStore(game.ui, (s) => s.tick);
  const st = game.state!;
  const companies = st.companies;
  const traded = GOODS.filter((g) => {
    const sh = marketShares(st, g.id);
    return [...sh.entries()].some(([k, v]) => k >= 0 && v > 0.005);
  });
  return (
    <aside class="side panel left wide">
      <div class="row between">
        <h2>Competitors</h2>
        <button class="btn small ghost" onClick={() => game.setLeftPanel('rivals')}>
          ✕
        </button>
      </div>
      <table class="tbl">
        <thead>
          <tr>
            <th>Company</th>
            <th>Value</th>
            <th>Cash</th>
            <th>Plants</th>
            <th>Profit/mo</th>
          </tr>
        </thead>
        <tbody>
          {[...companies]
            .sort((a, b) => companyValue(st, b) - companyValue(st, a))
            .map((c) => {
              const s = companySummary(st, c);
              return (
                <tr key={c.id} class={cls(c.isPlayer && 'me')}>
                  <td>
                    <i class="swatch" style={{ background: c.color }} />
                    {c.name}
                    {c.bankrupt && <span class="neg"> (bankrupt)</span>}
                    <div class="muted small">
                      {c.isPlayer
                        ? 'You'
                        : `${PERSONALITIES[c.ai!.personality].name}${c.ai!.specialty ? ` · ${CATEGORIES.find((x) => x.id === c.ai!.specialty)?.name}` : ''}`}
                    </div>
                  </td>
                  <td>{money(companyValue(st, c), { compact: true })}</td>
                  <td>{money(c.cash, { compact: true })}</td>
                  <td>{s.buildings}</td>
                  <td class={cls(s.profit < 0 ? 'neg' : 'pos')}>{money(s.profit, { compact: true, sign: true })}</td>
                </tr>
              );
            })}
        </tbody>
      </table>
      <h3>Market share (all towns, last month)</h3>
      {traded.length === 0 && <p class="muted small">No company sells anything yet: all goods still come from outside traders.</p>}
      {traded.map((g) => {
        const sh = marketShares(st, g.id);
        return (
          <div key={g.id} class="share-row">
            <span>
              {g.icon} {g.name}
            </span>
            <div class="share-bar">
              {companies.map((c) =>
                (sh.get(c.id) ?? 0) > 0.002 ? (
                  <div
                    key={c.id}
                    title={`${c.name}: ${pct(sh.get(c.id)!)}`}
                    style={{ width: pct(sh.get(c.id)!, 1), background: c.color }}
                  />
                ) : null,
              )}
              <div title={`Outside traders: ${pct(sh.get(-1) ?? 0)}`} style={{ flex: 1, background: '#e3e8ec' }} />
            </div>
          </div>
        );
      })}
      <p class="muted small">
        Grey = imports and unmodeled producers. When a market has high prices, competitors enter it, supply grows and the
        price falls back: high profits attract competition.
      </p>
    </aside>
  );
}
