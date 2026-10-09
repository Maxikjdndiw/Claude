import { useState } from 'preact/hooks';
import { BUILDINGS, BUILDING, CATEGORIES, type Category } from '../../data/buildings';
import { ECON } from '../../data/economy';
import { GOOD } from '../../data/goods';
import { TECH } from '../../data/techs';
import { INFRA } from '../../data/transport';
import type { Game } from '../../game';
import { depositFor } from '../../sim/resources';
import { canBuildType, isUnlocked } from '../../sim/tech';
import { cls, money, pct, tons } from '../format';
import { useStore } from '../store';

function recipeText(id: string): string {
  const r = BUILDING[id].recipe;
  if (!r) return BUILDING[id].warehouse ? 'Stores any goods' : '';
  const ins = Object.entries(r.inputs).map(([g, q]) => `${q} ${GOOD[g].name.toLowerCase()}`);
  const outs = Object.keys(r.outputs).map((g) => `${GOOD[g].icon} ${GOOD[g].name}`);
  return ins.length ? `${ins.join(' + ')} → ${outs.join(', ')}` : outs.join(', ');
}

export function BuildMenu({ game }: { game: Game }) {
  const active = useStore(game.ui, (s) => s.buildType);
  useStore(game.ui, (s) => s.tick);
  const tool = useStore(game.ui, (s) => s.tool);
  const [cat, setCat] = useState<Category>('food');
  const me = game.state!.companies[0];
  const railOk = isUnlocked(me, 'rail');
  return (
    <nav class="dock panel">
      <div class="dock-tools">
        <button class={cls('tool-btn', tool === 'road' && 'on')} onClick={() => game.setTool('road')} title={`Build roads: ${money(INFRA.roadPerCell)}/km`}>
          🛣<span>Road</span>
        </button>
        <button
          class={cls('tool-btn', tool === 'rail' && 'on', !railOk && 'locked')}
          onClick={() => game.setTool('rail')}
          title={railOk ? `Lay railway: ${money(INFRA.railPerCell)}/km` : 'Research Railways first'}
        >
          🛤<span>Rail</span>
        </button>
        <button class={cls('tool-btn', tool === 'line' && 'on')} onClick={() => game.setTool('line')} title="Create a transport line between two places">
          🚚<span>Line</span>
        </button>
        <button
          class={cls('tool-btn', tool === 'survey' && 'on')}
          onClick={() => game.setTool('survey')}
          title={`Survey for hidden deposits (${money(INFRA.surveyCost)})`}
        >
          🔍<span>Survey</span>
        </button>
      </div>
      <div class="dock-sep" />
      <div class="dock-main">
        <div class="dock-tabs">
          {CATEGORIES.map((c) => (
            <button key={c.id} class={cls('tab', cat === c.id && 'on')} onClick={() => setCat(c.id)}>
              {c.icon} {c.name}
            </button>
          ))}
        </div>
        <div class="dock-items">
          {BUILDINGS.filter((b) => !b.hidden && b.category === cat).map((b) => {
            const locked = !canBuildType(me, b.id);
            return (
              <button
                key={b.id}
                class={cls('dock-item', active === b.id && 'on', me.cash < b.cost && 'poor', locked && 'locked')}
                onClick={() => (locked ? game.flashError(`Requires research: ${TECH[b.requires!].name}`) : active === b.id ? game.cancelBuild() : game.startBuild(b.id))}
                title={b.description}
              >
                <b>
                  {locked && '🔒 '}
                  {b.name}
                </b>
                <span class="muted">{recipeText(b.id)}</span>
                <span class="cost">{money(b.cost)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

export function PlacementHint({ game }: { game: Game }) {
  const type = useStore(game.ui, (s) => s.buildType);
  const p = useStore(game.ui, (s) => s.placement);
  if (!type) return null;
  const def = BUILDING[type];
  const st = game.state!;
  const cost = p?.cost ?? def.cost;
  const yearlyInterest = cost * ECON.depositRate;
  const deposit = p && def.site.kind === 'deposit' ? depositFor(st, def, p.x, p.y) : null;
  return (
    <div class="hint-card panel">
      <div class="row between">
        <b>{def.name}</b>
        <span class="muted">Esc / right-click to cancel</span>
      </div>
      <p class="muted small">{def.description}</p>
      {p ? (
        <>
          <div class="kv">
            <span>Construction cost</span>
            <b>{money(p.cost)}</b>
          </div>
          {def.site.kind !== 'none' && def.site.kind !== 'coast' && (
            <div class="kv">
              <span>{def.site.label}</span>
              <b class={p.siteFactor < 0.7 ? 'neg' : p.siteFactor > 0.95 ? 'pos' : ''}>{pct(p.siteFactor)} productivity</b>
            </div>
          )}
          {deposit && (
            <div class="kv">
              <span>Deposit remaining</span>
              <b>{tons(deposit.amount)}</b>
            </div>
          )}
          {def.maxWorkers > 0 && (
            <div class="kv">
              <span>Workers from</span>
              <b>{p.laborTown >= 0 ? st.towns[p.laborTown].name : 'nobody in range'}</b>
            </div>
          )}
          <div class="kv">
            <span>Sells locally to</span>
            <b>{p.localTown >= 0 ? st.towns[p.localTown].name : '—'}</b>
          </div>
          <div class="kv">
            <span title="What the money could earn elsewhere">Opportunity cost</span>
            <b>{money(yearlyInterest)}/yr in a deposit</b>
          </div>
          {p.warnings.map((w) => (
            <p class="warn" key={w}>
              {w}
            </p>
          ))}
          {!p.ok && <p class="err">{p.reason}</p>}
        </>
      ) : (
        <p class="muted small">Move the cursor over the map.</p>
      )}
    </div>
  );
}
