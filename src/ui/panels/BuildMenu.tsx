import { BUILDINGS, BUILDING } from '../../data/buildings';
import { ECON } from '../../data/economy';
import { GOOD } from '../../data/goods';
import type { Game } from '../../game';
import { cls, money, pct } from '../format';
import { useStore } from '../store';

function recipeText(id: string): string {
  const r = BUILDING[id].recipe;
  if (!r) return '';
  const ins = Object.entries(r.inputs).map(([g, q]) => `${q} ${GOOD[g].name.toLowerCase()}`);
  const outs = Object.keys(r.outputs).map((g) => `${GOOD[g].icon} ${GOOD[g].name}`);
  return ins.length ? `${ins.join(' + ')} → ${outs.join(', ')}` : outs.join(', ');
}

export function BuildMenu({ game }: { game: Game }) {
  const active = useStore(game.ui, (s) => s.buildType);
  useStore(game.ui, (s) => s.tick);
  const cash = game.state!.companies[0].cash;
  return (
    <nav class="dock panel">
      {BUILDINGS.filter((b) => !b.hidden).map((b) => (
        <button
          key={b.id}
          class={cls('dock-item', active === b.id && 'on', cash < b.cost && 'poor')}
          onClick={() => (active === b.id ? game.cancelBuild() : game.startBuild(b.id))}
          title={b.description}
        >
          <b>{b.name}</b>
          <span class="muted">{recipeText(b.id)}</span>
          <span class="cost">{money(b.cost)}</span>
        </button>
      ))}
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
          {def.site.kind !== 'none' && (
            <div class="kv">
              <span>{def.site.label}</span>
              <b class={p.siteFactor < 0.7 ? 'neg' : p.siteFactor > 0.95 ? 'pos' : ''}>{pct(p.siteFactor)} productivity</b>
            </div>
          )}
          <div class="kv">
            <span>Workers from</span>
            <b>{p.laborTown >= 0 ? st.towns[p.laborTown].name : 'nobody in range'}</b>
          </div>
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
