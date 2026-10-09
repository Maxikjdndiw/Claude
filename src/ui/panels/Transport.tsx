import { useState } from 'preact/hooks';
import { GOOD } from '../../data/goods';
import { VEHICLES } from '../../data/transport';
import type { Game } from '../../game';
import { quoteSell } from '../../sim/market';
import { endpointPos } from '../../sim/roads';
import type { Endpoint } from '../../sim/state';
import * as tr from '../../sim/transport';
import { cls, money, price, tons } from '../format';
import { useStore } from '../store';

export function ToolHint({ game }: { game: Game }) {
  const tool = useStore(game.ui, (s) => s.tool);
  const start = useStore(game.ui, (s) => s.roadStart);
  const plan = useStore(game.ui, (s) => s.roadPlan);
  const from = useStore(game.ui, (s) => s.lineFrom);
  if (!tool) return null;
  const st = game.state!;
  return (
    <div class="hint-card panel">
      <div class="row between">
        <b>{tool === 'road' ? 'Build road' : 'New truck line'}</b>
        <span class="muted">Esc / right-click to stop</span>
      </div>
      {tool === 'road' && (
        <>
          <p class="muted small">
            {start === null
              ? 'Click where the road should start (a building, a town or open land).'
              : 'Click where it should end. Existing roads are reused for free.'}
          </p>
          {plan && (
            <>
              <div class="kv">
                <span>New road</span>
                <b>{plan.newCells.length} km</b>
              </div>
              <div class="kv">
                <span>Cost</span>
                <b>{money(plan.cost)}</b>
              </div>
            </>
          )}
          {start !== null && !plan && <p class="err">No route to this point</p>}
          <p class="muted small">Hills, forests and bridges cost more per km. Roads are shared infrastructure.</p>
        </>
      )}
      {tool === 'line' && (
        <p class="muted small">
          {from
            ? `From ${tr.endpointName(st, from)}: now click the destination (one of your buildings or a town).`
            : 'Click the source: one of your buildings (ships its output) or a town (buys goods there).'}
        </p>
      )}
    </div>
  );
}

function routeInfo(game: Game, from: Endpoint, to: Endpoint) {
  const sim = game.sim!;
  const plan = tr.planLine(sim, from, to);
  return plan;
}

export function LineDialog({ game }: { game: Game }) {
  const draft = useStore(game.ui, (s) => s.lineDraft);
  useStore(game.ui, (s) => s.tick);
  const [good, setGood] = useState<string | null>(null);
  const [n, setN] = useState(2);
  if (!draft) return null;
  const st = game.state!;
  const goods = tr.shippableGoods(st, draft.from, draft.to);
  const g = good && goods.includes(good) ? good : goods[0];
  const plan = routeInfo(game, draft.from, draft.to);
  const v = VEHICLES.truck;
  const ok = !('reason' in plan) && !!g;
  const est = !('reason' in plan) ? tr.estimateLine(plan.length) : null;
  const srcPrice =
    g && draft.from.kind === 'town' ? st.towns[draft.from.id].market[g].price : null;
  const dstPrice = g && draft.to.kind === 'town' ? quoteSell(st, st.towns[draft.to.id], g, v.capacity) : null;
  const a = endpointPos(st, draft.from);
  const b = endpointPos(st, draft.to);
  const crow = a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  const close = () => {
    game.closeLineDraft();
    setGood(null);
  };
  const create = () => {
    if (!g) return;
    game.run((sim) => tr.createLine(sim, 0, draft.from, draft.to, g, n));
    close();
  };
  return (
    <div class="modal-back">
      <div class="modal panel left-align">
        <h2>
          {tr.endpointName(st, draft.from)} → {tr.endpointName(st, draft.to)}
        </h2>
        {'reason' in plan ? (
          <p class="err">{plan.reason}</p>
        ) : !g ? (
          <p class="err">Nothing to ship between these two places.</p>
        ) : (
          <>
            <div class="kv">
              <span>Good</span>
              <select value={g} onChange={(e) => setGood((e.target as HTMLSelectElement).value)} style={{ width: 'auto' }}>
                {goods.map((x) => (
                  <option key={x} value={x}>
                    {GOOD[x].icon} {GOOD[x].name}
                  </option>
                ))}
              </select>
            </div>
            <div class="kv">
              <span>Trucks</span>
              <div class="stepper">
                <button onClick={() => setN(Math.max(1, n - 1))}>−</button>
                <b>{n}</b>
                <button onClick={() => setN(Math.min(30, n + 1))}>+</button>
              </div>
            </div>
            <div class="kv">
              <span>Route by road</span>
              <b>
                {plan.length.toFixed(0)} km <span class="muted">({crow.toFixed(0)} km as the crow flies)</span>
              </b>
            </div>
            <div class="kv">
              <span>Round trip</span>
              <b>{est!.roundTripDays.toFixed(1)} days</b>
            </div>
            <div class="kv">
              <span>Capacity</span>
              <b>{tons(est!.tonsPerDayPerVehicle * n)}/day</b>
            </div>
            <div class="kv">
              <span>Transport cost (est.)</span>
              <b>{price(est!.costPerTon)}/t</b>
            </div>
            {srcPrice !== null && (
              <div class="kv">
                <span>Buy price at source</span>
                <b>{price(srcPrice)}/t</b>
              </div>
            )}
            {dstPrice !== null && (
              <div class="kv">
                <span>Sell price at destination</span>
                <b>{price(dstPrice)}/t</b>
              </div>
            )}
            {srcPrice !== null && dstPrice !== null && (
              <div class="explain">
                Margin per ton after transport:{' '}
                <b class={cls(dstPrice - srcPrice - est!.costPerTon < 0 ? 'neg' : 'pos')}>
                  {price(dstPrice - srcPrice - est!.costPerTon)}
                </b>
                . Buying cheap in one town and selling dear in another is arbitrage: it pushes the two prices together.
              </div>
            )}
          </>
        )}
        <div class="actions">
          <button class="btn ghost" onClick={close}>
            Cancel
          </button>
          <button class="btn primary" disabled={!ok} onClick={create}>
            Buy {n} truck{n > 1 ? 's' : ''} ({money(n * v.price * st.priceLevel)})
          </button>
        </div>
      </div>
    </div>
  );
}

export function LinesPanel({ game }: { game: Game }) {
  useStore(game.ui, (s) => s.tick);
  const st = game.state!;
  const lines = st.lines.filter((l) => l.owner === 0);
  return (
    <aside class="side panel left wide">
      <div class="row between">
        <h2>Transport lines</h2>
        <button class="btn small ghost" onClick={() => game.setLeftPanel('lines')}>
          ✕
        </button>
      </div>
      {lines.length === 0 && (
        <p class="muted">
          No lines yet. Use <b>🛣 Road</b> to connect your buildings to the road network, then <b>🚚 Truck line</b> to ship goods to
          distant towns.
        </p>
      )}
      {lines.map((l) => {
        const stats = l.last.delivered > 0 || l.last.revenue > 0 ? l.last : l.month;
        const est = tr.estimateLine(l.length, l.vehicle);
        const profit = stats.revenue - stats.costs;
        return (
          <div class="line-card" key={l.id}>
            <div class="row between">
              <b>
                {GOOD[l.good].icon} {tr.endpointName(st, l.from)} → {tr.endpointName(st, l.to)}
              </b>
              <span class={cls('chip', l.status === 'Running' ? 'ok' : 'warnchip')}>{l.status}</span>
            </div>
            <div class="kv">
              <span>
                {l.length.toFixed(0)} km · {tons(est.tonsPerDayPerVehicle * l.vehicles.length)}/day capacity
              </span>
              <div class="stepper">
                <button onClick={() => game.run((s) => tr.removeVehicle(s, 0, l.id))}>−</button>
                <b>🚚 {l.vehicles.length}</b>
                <button onClick={() => game.run((s) => tr.addVehicle(s, 0, l.id))}>+</button>
              </div>
            </div>
            <div class="kv">
              <span>{l.last.delivered > 0 ? 'Last month' : 'This month'}: delivered {tons(stats.delivered)}</span>
              <b class={cls(profit < 0 ? 'neg' : 'pos')}>
                {stats.revenue > 0 ? money(profit, { sign: true }) : `cost ${money(stats.costs)}`}
              </b>
            </div>
            <button class="link" onClick={() => confirm('Sell the trucks and close this line?') && game.run((s) => tr.deleteLine(s, 0, l.id))}>
              Close line
            </button>
          </div>
        );
      })}
    </aside>
  );
}
