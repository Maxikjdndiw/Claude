import { GOODS } from '../../data/goods';
import type { Game } from '../../game';
import { baseDemand, refPrice } from '../../sim/market';
import { cls, pct, price, tons } from '../format';
import { useStore } from '../store';
import { Spark } from '../widgets/Spark';

export function TownPanel({ game }: { game: Game }) {
  useStore(game.ui, (s) => s.tick);
  const id = useStore(game.ui, (s) => s.selectedTown);
  const st = game.state!;
  const t = id !== null ? st.towns[id] : null;
  if (!t) return null;
  const u = t.unemployed / t.workforce;
  return (
    <aside class="side panel right">
      <div class="row between">
        <div>
          <span class="eyebrow">Town market</span>
          <h2>{t.name}</h2>
        </div>
        <button class="btn small ghost" onClick={() => game.selectTown(null)}>
          ✕
        </button>
      </div>
      <div class="stats3">
        <div>
          <span>Population</span>
          <b>{t.population.toLocaleString()}</b>
        </div>
        <div>
          <span>Income level</span>
          <b>{pct(t.wealth)}</b>
        </div>
        <div>
          <span>Unemployment</span>
          <b>{pct(u, 1)}</b>
        </div>
        <div>
          <span>Market wage</span>
          <b>{price(t.wage)}/day</b>
        </div>
      </div>
      <h3>Prices</h3>
      <table class="tbl">
        <thead>
          <tr>
            <th>Good</th>
            <th>Price</th>
            <th>vs. normal</th>
            <th>Stock</th>
            <th>Trend</th>
          </tr>
        </thead>
        <tbody>
          {GOODS.map((g) => {
            const m = t.market[g.id];
            const rel = m.price / refPrice(st, g.id);
            const days = m.stock / Math.max(0.01, baseDemand(t, g.id));
            return (
              <tr key={g.id}>
                <td>
                  {g.icon} {g.name}
                </td>
                <td>
                  <b>{price(m.price)}</b>
                </td>
                <td class={cls(rel < 0.9 && 'neg', rel > 1.1 && 'pos')}>{rel >= 1 ? '+' : ''}{pct(rel - 1)}</td>
                <td title={`${days.toFixed(1)} days of demand`}>{tons(m.stock)}</td>
                <td>
                  <Spark values={m.history.slice(-26)} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h3>Daily flows</h3>
      <table class="tbl">
        <thead>
          <tr>
            <th>Good</th>
            <th>Bought by town</th>
            <th>From outside</th>
            <th>Your share</th>
          </tr>
        </thead>
        <tbody>
          {GOODS.map((g) => {
            const m = t.market[g.id];
            return (
              <tr key={g.id}>
                <td>{g.name}</td>
                <td>{tons(m.consumed)}</td>
                <td>{tons(m.outside)}</td>
                <td>{m.share[0] ? pct(m.share[0]) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p class="muted small">
        Prices move with supply and demand: delivering more than the town buys fills its stock and pushes the price down.
        Outside traders cap prices with imports and buy up surpluses at the floor.
      </p>
    </aside>
  );
}
