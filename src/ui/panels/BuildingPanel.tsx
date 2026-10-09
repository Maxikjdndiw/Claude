import { BUILDING } from '../../data/buildings';
import { GOOD } from '../../data/goods';
import type { Game } from '../../game';
import * as cmd from '../../sim/commands';
import { marketWage } from '../../sim/labor';
import { localTowns } from '../../sim/logistics';
import { marginalProduct, maxWorkers, maintenance, potentialOutput, storageCap } from '../../sim/production';
import { cls, money, pct, price, tons } from '../format';
import { depositFor } from '../../sim/resources';
import { RESOURCES } from '../../data/resources';
import { useStore } from '../store';

export function BuildingPanel({ game }: { game: Game }) {
  useStore(game.ui, (s) => s.tick);
  const id = useStore(game.ui, (s) => s.selectedBuilding);
  const st = game.state!;
  const b = st.buildings.find((x) => x.id === id);
  if (!b) return null;
  const def = BUILDING[b.type];
  if (b.owner !== 0) return <RivalBuilding game={game} id={b.id} />;
  const town = b.town >= 0 ? st.towns[b.town] : null;
  const mw = town ? marketWage(st, town) : 0;
  const local = localTowns(st, b)[0];
  const outGood = def.recipe ? Object.keys(def.recipe.outputs)[0] : null;
  const outPrice = outGood && local ? local.town.market[outGood].price : outGood ? GOOD[outGood].basePrice * st.priceLevel : 0;
  const mp = marginalProduct(st, b);
  const totalBuild = b.level > 1 ? Math.ceil(def.buildDays / 2) : def.buildDays;
  const used = Object.values(b.storage).reduce((a, v) => a + v, 0);
  const cap = storageCap(b);
  const run = game.run.bind(game);
  const stats = b.last.produced > 0 || b.last.revenue > 0 ? b.last : b.month;
  const profit = stats.revenue - stats.costs;
  const unitCost = stats.produced > 0 ? stats.costs / stats.produced : 0;
  const upCost = cmd.upgradeCost(game.sim!, b);

  return (
    <aside class="side panel right">
      <div class="row between">
        <div>
          <span class="eyebrow">
            {def.category === 'hq' ? 'Your company' : `Size ${b.level} of ${def.maxLevel}`}
          </span>
          <h2>{def.name}</h2>
        </div>
        <button class="btn small ghost" onClick={() => game.selectBuilding(null)}>
          ✕
        </button>
      </div>
      <span class={cls('chip', b.status.startsWith('Producing') ? 'ok' : 'warnchip')}>{b.status}</span>

      {b.buildLeft > 0 && (
        <div class="block">
          <div class="kv">
            <span>Construction</span>
            <b>{b.buildLeft} days left</b>
          </div>
          <div class="meter">
            <div style={{ width: pct(1 - b.buildLeft / Math.max(1, totalBuild)), background: '#d9a441' }} />
          </div>
        </div>
      )}

      {def.category === 'hq' && (
        <p class="muted small">
          Your headquarters. You can build anywhere within reach of your HQ and your other buildings. Upkeep{' '}
          {money(maintenance(b))}/day.
        </p>
      )}

      {def.recipe && b.buildLeft === 0 && (
        <>
          <h3>Production</h3>
          <div class="kv">
            <span>Output</span>
            <b>
              {tons(b.rate)}/day {outGood && GOOD[outGood].icon}
            </b>
          </div>
          <div class="kv">
            <span>Capacity at full staff</span>
            <b>{tons(potentialOutput(st, b, maxWorkers(b)))}/day</b>
          </div>
          {def.site.kind !== 'none' && def.site.kind !== 'coast' && (
            <div class="kv">
              <span>{def.site.label}</span>
              <b class={cls(b.siteFactor < 0.5 && 'neg')}>{pct(b.siteFactor)}</b>
            </div>
          )}
          {def.site.kind === 'deposit' &&
            (() => {
              const d = depositFor(st, def, b.x, b.y);
              if (!d) return <p class="err">Deposit exhausted. Non-renewable resources run out: demolish or move on.</p>;
              const years = b.rate > 0 ? d.amount / b.rate / 365 : Infinity;
              return (
                <>
                  <div class="kv">
                    <span>{RESOURCES[d.resource].name} left</span>
                    <b>
                      {tons(d.amount)} <span class="muted">of {tons(d.initial)}</span>
                    </b>
                  </div>
                  <div class="meter">
                    <div style={{ width: pct(d.amount / d.initial), background: RESOURCES[d.resource].color }} />
                  </div>
                  <div class="kv">
                    <span>At this rate it lasts</span>
                    <b>{isFinite(years) ? `${years.toFixed(1)} years` : '—'}</b>
                  </div>
                </>
              );
            })()}
          {(def.site.kind === 'forest' || def.site.kind === 'fish') && (
            <p class="muted small">
              {def.site.kind === 'forest' ? 'Trees' : 'Fish'} regrow slowly. Harvesting faster than the regrowth rate depletes
              the stock and output falls: the tragedy of the commons when several firms share it.
            </p>
          )}
        </>
      )}
      {def.warehouse && (
        <>
          <h3>Stock</h3>
          <div class="goods">
            {Object.entries(b.storage)
              .filter(([, q]) => q > 0.05)
              .map(([g, q]) => (
                <span key={g} class="dep">
                  {GOOD[g].icon} {GOOD[g].name} {tons(q)}
                </span>
              ))}
            {Object.values(b.storage).every((q) => q <= 0.05) && <span class="muted small">Empty. Ship goods here with a line.</span>}
          </div>
          <p class="muted small">Capacity {tons(storageCap(b))}. Nearby factories pick up their inputs from here automatically.</p>
        </>
      )}

      {def.maxWorkers > 0 && (
        <>
          <h3>Workforce {town && <span class="muted">· from {town.name}</span>}</h3>
          <div class="kv">
            <span>Workers (target)</span>
            <div class="stepper">
              <button onClick={() => run((s) => cmd.setTargetWorkers(s, 0, b.id, b.targetWorkers - 1))}>−</button>
              <b>
                {b.workers} <span class="muted">/ {b.targetWorkers}</span>
              </b>
              <button onClick={() => run((s) => cmd.setTargetWorkers(s, 0, b.id, b.targetWorkers + 1))}>+</button>
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={maxWorkers(b)}
            value={b.targetWorkers}
            onInput={(e) => run((s) => cmd.setTargetWorkers(s, 0, b.id, Number((e.target as HTMLInputElement).value)))}
          />
          <div class="kv">
            <span>Daily wage</span>
            <div class="stepper">
              <button onClick={() => run((s) => cmd.setWage(s, 0, b.id, b.wage - 0.5))}>−</button>
              <b>{price(b.wage)}</b>
              <button onClick={() => run((s) => cmd.setWage(s, 0, b.id, b.wage + 0.5))}>+</button>
            </div>
          </div>
          {town && (
            <div class="kv">
              <span>Market wage in {town.name}</span>
              <b class={b.wage < mw * 0.97 ? 'neg' : ''}>
                {price(mw)}{' '}
                <button class="link" onClick={() => run((s) => cmd.setWage(s, 0, b.id, mw))}>
                  match
                </button>
              </b>
            </div>
          )}
          {def.recipe && b.buildLeft === 0 && (
            <div class="explain">
              Next worker adds <b>{tons(mp)}/day</b> ≈ <b>{money(mp * outPrice)}</b> of output for a wage of{' '}
              <b>{price(b.wage)}</b>.{' '}
              {mp * outPrice > b.wage ? (
                <span class="pos">Worth hiring.</span>
              ) : (
                <span class="neg">Costs more than it adds (diminishing returns).</span>
              )}
            </div>
          )}
          <div class="kv">
            <span>Training</span>
            <div class="meter grow">
              <div style={{ width: pct(b.skill), background: '#7e9cf0' }} />
            </div>
          </div>
          <button
            class="btn small"
            disabled={b.trainingLeft > 0 || b.workers === 0 || b.skill > 0.98}
            onClick={() => run((s) => cmd.train(s, 0, b.id))}
          >
            {b.trainingLeft > 0 ? `Training… ${b.trainingLeft}d` : `Train workers (${money(cmd.trainingCost(b) * st.priceLevel)})`}
          </button>
        </>
      )}

      {def.recipe && (
        <>
          <h3>Storage</h3>
          <div class="meter">
            <div style={{ width: pct(Math.min(1, used / cap)), background: used > cap * 0.9 ? '#d4574a' : '#9fb7c0' }} />
          </div>
          <div class="goods">
            {[...Object.keys(def.recipe.inputs), ...Object.keys(def.recipe.outputs)].map((g) => (
              <span key={g} class="dep">
                {GOOD[g].icon} {GOOD[g].name} {tons(b.storage[g] ?? 0)}
              </span>
            ))}
          </div>
          {Object.keys(def.recipe.inputs).length > 0 && (
            <label class="check">
              <input
                type="checkbox"
                checked={b.buyInputs}
                onChange={(e) => run((s) => cmd.setBuyInputs(s, 0, b.id, (e.target as HTMLInputElement).checked))}
              />
              Buy missing inputs from the local market
            </label>
          )}
          {outGood && (
            <div class="kv">
              <span>
                {GOOD[outGood].name} price {local ? `in ${local.town.name}` : '(no market in reach)'}
              </span>
              <b>{price(outPrice)}/t</b>
            </div>
          )}
          {outGood && (
            <div class="kv">
              <span>Hold stock if price below</span>
              <div class="stepper">
                <button onClick={() => run((s) => cmd.setSellMin(s, 0, b.id, outGood, (b.sellMin[outGood] ?? 0) - 5))}>−</button>
                <b>{b.sellMin[outGood] ? price(b.sellMin[outGood]) : 'any'}</b>
                <button
                  onClick={() =>
                    run((s) => cmd.setSellMin(s, 0, b.id, outGood, (b.sellMin[outGood] || Math.floor(outPrice / 5) * 5) + 5))
                  }
                >
                  +
                </button>
              </div>
            </div>
          )}

          <h3>{b.last.produced > 0 || b.last.revenue > 0 ? 'Last month' : 'This month so far'}</h3>
          <div class="kv">
            <span>Revenue (incl. transfers)</span>
            <b>{money(stats.revenue)}</b>
          </div>
          <div class="kv">
            <span>Costs (wages, inputs, upkeep, depreciation)</span>
            <b>{money(stats.costs)}</b>
          </div>
          <div class="kv">
            <span>Profit</span>
            <b class={profit < 0 ? 'neg' : 'pos'}>{money(profit, { sign: true })}</b>
          </div>
          <div class="kv">
            <span>Average cost per ton</span>
            <b>{unitCost ? price(unitCost) : '—'}</b>
          </div>
        </>
      )}

      {def.category !== 'hq' && (
        <div class="actions">
          <button class="btn small danger" onClick={() => game.ask(`Demolish this ${def.name}? You get back 30% of its book value.`, 'Demolish', () => run((s) => cmd.demolish(s, 0, b.id)))}>
            Demolish
          </button>
          {b.level < def.maxLevel && (
            <button class="btn small primary" disabled={b.buildLeft > 0} onClick={() => run((s) => cmd.upgrade(s, 0, b.id))}>
              Expand to size {b.level + 1} ({money(upCost, { compact: true })})
            </button>
          )}
        </div>
      )}
    </aside>
  );
}

function RivalBuilding({ game, id }: { game: Game; id: number }) {
  const st = game.state!;
  const b = st.buildings.find((x) => x.id === id)!;
  const def = BUILDING[b.type];
  const owner = st.companies[b.owner];
  const outGood = def.recipe ? Object.keys(def.recipe.outputs)[0] : null;
  return (
    <aside class="side panel right">
      <div class="row between">
        <div>
          <span class="eyebrow">
            <i class="swatch" style={{ background: owner.color }} />
            {owner.name}
          </span>
          <h2>{def.name}</h2>
        </div>
        <button class="btn small ghost" onClick={() => game.selectBuilding(null)}>
          ✕
        </button>
      </div>
      <span class="chip">{b.status}</span>
      {outGood && (
        <div class="kv">
          <span>Output</span>
          <b>
            {tons(b.rate)}/day {GOOD[outGood].icon}
          </b>
        </div>
      )}
      <div class="kv">
        <span>Workers</span>
        <b>{b.workers}</b>
      </div>
      <div class="kv">
        <span>Wage paid</span>
        <b>{price(b.wage)}/day</b>
      </div>
      <p class="muted small">A competitor. Its output competes with yours in the same town markets, and it hires from the same labor pool.</p>
    </aside>
  );
}
