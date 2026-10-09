import { useState } from 'preact/hooks';
import { GOOD } from '../../data/goods';
import { INFRA, MODE_VEHICLE, VEHICLES } from '../../data/transport';
import type { Game } from '../../game';
import { quoteSell } from '../../sim/market';
import { endpointPos } from '../../sim/roads';
import type { Mode } from '../../sim/state';
import { isUnlocked } from '../../sim/tech';
import * as tr from '../../sim/transport';
import { cls, money, pct, price, tons } from '../format';
import { useStore } from '../store';

const MODE_LABEL: Record<Mode, string> = { road: '🚚 Truck', rail: '🚆 Train', sea: '🚢 Ship' };

export function ToolHint({ game }: { game: Game }) {
  const tool = useStore(game.ui, (s) => s.tool);
  const start = useStore(game.ui, (s) => s.roadStart);
  const plan = useStore(game.ui, (s) => s.roadPlan);
  const from = useStore(game.ui, (s) => s.lineFrom);
  if (!tool) return null;
  const st = game.state!;
  const title = { road: 'Build road', rail: 'Lay railway', line: 'New transport line', survey: 'Geological survey' }[tool];
  return (
    <div class="hint-card panel">
      <div class="row between">
        <b>{title}</b>
        <span class="muted">Esc / right-click to stop</span>
      </div>
      {(tool === 'road' || tool === 'rail') && (
        <>
          <p class="muted small">
            {start === null
              ? 'Click where the track should start (a building, a town or open land).'
              : 'Click where it should end. Existing track is reused for free.'}
          </p>
          {plan && (
            <>
              <div class="kv">
                <span>New {tool === 'road' ? 'road' : 'track'}</span>
                <b>{plan.newCells.length} km</b>
              </div>
              <div class="kv">
                <span>Cost</span>
                <b>{money(plan.cost)}</b>
              </div>
            </>
          )}
          {start !== null && !plan && <p class="err">No route to this point</p>}
          <p class="muted small">
            {tool === 'road'
              ? 'Hills, forests and bridges cost more per km. Roads are shared infrastructure.'
              : 'Railways are expensive and avoid slopes, but trains move 80 t at a fraction of the cost per ton.'}
          </p>
        </>
      )}
      {tool === 'line' && (
        <p class="muted small">
          {from
            ? `From ${tr.endpointName(st, from)}: now click the destination (one of your buildings or a town).`
            : 'Click the source: one of your buildings (ships its output), a warehouse/harbor, or a town (buys goods there).'}
        </p>
      )}
      {tool === 'survey' && (
        <p class="muted small">
          Click to send geologists. They search a {INFRA.surveyRadius} km radius for hidden deposits (oil is almost always
          hidden). Cost {money(INFRA.surveyCost * st.priceLevel)}, whether they find something or not.
        </p>
      )}
    </div>
  );
}

export function LineDialog({ game }: { game: Game }) {
  const draft = useStore(game.ui, (s) => s.lineDraft);
  useStore(game.ui, (s) => s.tick);
  const [good, setGood] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [n, setN] = useState(2);
  if (!draft) return null;
  const st = game.state!;
  const me = st.companies[0];
  const sim = game.sim!;
  const goods = tr.shippableGoods(st, draft.from, draft.to);
  const g = good && goods.includes(good) ? good : goods[0];
  const modes: Mode[] = ['road', 'rail', 'sea'];
  const plans = Object.fromEntries(modes.map((m) => [m, tr.planLine(sim, draft.from, draft.to, m)])) as Record<
    Mode,
    ReturnType<typeof tr.planLine>
  >;
  const usable = (m: Mode) => isUnlocked(me, MODE_VEHICLE[m]) && !('reason' in plans[m]);
  const m: Mode = mode && usable(mode) ? mode : (modes.find(usable) ?? 'road');
  const plan = plans[m];
  const v = VEHICLES[MODE_VEHICLE[m]];
  const ok = !('reason' in plan) && !!g && isUnlocked(me, v.id);
  const est = !('reason' in plan) ? tr.estimateLine(plan.length, v.id, st) : null;
  const srcPrice = g && draft.from.kind === 'town' ? st.towns[draft.from.id].market[g].price : null;
  const dstPrice = g && draft.to.kind === 'town' ? quoteSell(st, st.towns[draft.to.id], g, v.capacity) : null;
  const a = endpointPos(st, draft.from);
  const b = endpointPos(st, draft.to);
  const crow = a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  const close = () => {
    game.closeLineDraft();
    setGood(null);
    setMode(null);
  };
  const create = () => {
    if (!g) return;
    game.run((s) => tr.createLine(s, 0, draft.from, draft.to, g, n, m));
    close();
  };
  return (
    <div class="modal-back">
      <div class="modal panel left-align">
        <h2>
          {tr.endpointName(st, draft.from)} → {tr.endpointName(st, draft.to)}
        </h2>
        <table class="tbl modes">
          <thead>
            <tr>
              <th>Mode</th>
              <th>Route</th>
              <th>Cost / t</th>
              <th>t / day / vehicle</th>
            </tr>
          </thead>
          <tbody>
            {modes.map((x) => {
              const p = plans[x];
              const unlocked = isUnlocked(me, MODE_VEHICLE[x]);
              const e = !('reason' in p) ? tr.estimateLine(p.length, MODE_VEHICLE[x], st) : null;
              return (
                <tr key={x} class={cls('clickable', x === m && 'sel', (!unlocked || !e) && 'dim')} onClick={() => usable(x) && setMode(x)}>
                  <td>{MODE_LABEL[x]}</td>
                  <td>{!unlocked ? '🔒 research' : e ? `${e.length.toFixed(0)} km` : 'not connected'}</td>
                  <td>{e && unlocked ? price(e.costPerTon) : '—'}</td>
                  <td>{e && unlocked ? tons(e.tonsPerDayPerVehicle) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
              <span>{v.name}s</span>
              <div class="stepper">
                <button onClick={() => setN(Math.max(1, n - 1))}>−</button>
                <b>{n}</b>
                <button onClick={() => setN(Math.min(30, n + 1))}>+</button>
              </div>
            </div>
            <div class="kv">
              <span>Route</span>
              <b>
                {plan.length.toFixed(0)} km <span class="muted">({crow.toFixed(0)} km as the crow flies)</span>
              </b>
            </div>
            <div class="kv">
              <span>Round trip · capacity</span>
              <b>
                {est!.roundTripDays.toFixed(1)} days · {tons(est!.tonsPerDayPerVehicle * n)}/day
              </b>
            </div>
            <div class="kv">
              <span>Transport cost (est.)</span>
              <b>
                {price(est!.costPerTon)}/t{' '}
                {g && <span class="muted">({pct(est!.costPerTon / GOOD[g].basePrice)} of the good's value)</span>}
              </b>
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
            Buy {n} {v.name.toLowerCase()}
            {n > 1 ? 's' : ''} ({money(n * v.price * st.priceLevel, { compact: true })})
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
      <p class="muted small">Fuel price index: {pct(tr.fuelIndex(st))} of normal. Running costs per km follow fuel prices.</p>
      {lines.length === 0 && (
        <p class="muted">
          No lines yet. Use <b>🛣 Road</b> to connect your buildings to the road network, then <b>🚚 Line</b> to ship goods
          to distant towns.
        </p>
      )}
      {lines.map((l) => {
        const stats = l.last.delivered > 0 || l.last.revenue > 0 ? l.last : l.month;
        const est = tr.estimateLine(l.length, l.vehicle, st);
        const profit = stats.revenue - stats.costs;
        const icon = MODE_LABEL[l.mode].split(' ')[0];
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
                {l.length.toFixed(0)} km · {tons(est.tonsPerDayPerVehicle * l.vehicles.length)}/day · {price(est.costPerTon)}/t
              </span>
              <div class="stepper">
                <button onClick={() => game.run((s) => tr.removeVehicle(s, 0, l.id))}>−</button>
                <b>
                  {icon} {l.vehicles.length}
                </b>
                <button onClick={() => game.run((s) => tr.addVehicle(s, 0, l.id))}>+</button>
              </div>
            </div>
            <div class="kv">
              <span>
                {l.last.delivered > 0 ? 'Last month' : 'This month'}: delivered {tons(stats.delivered)}
              </span>
              <b class={cls(profit < 0 ? 'neg' : 'pos')}>
                {stats.revenue > 0 ? money(profit, { sign: true }) : `cost ${money(stats.costs)}`}
              </b>
            </div>
            <button class="link" onClick={() => game.ask('Sell the vehicles and close this line?', 'Close line', () => game.run((s) => tr.deleteLine(s, 0, l.id)))}>
              Close line
            </button>
          </div>
        );
      })}
    </aside>
  );
}
