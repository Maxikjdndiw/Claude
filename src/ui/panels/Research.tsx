import { TECHS } from '../../data/techs';
import type { Game } from '../../game';
import { buyLicense, cancelResearch, licenseCost, researchable, startResearch } from '../../sim/tech';
import { cls, money } from '../format';
import { useStore } from '../store';

export function ResearchPanel({ game }: { game: Game }) {
  useStore(game.ui, (s) => s.tick);
  const st = game.state!;
  const me = st.companies[0];
  const tiers = [0, 1, 2];
  const run = (fn: () => { ok: boolean; reason?: string }) => game.run(() => fn());
  return (
    <aside class="side panel left wide">
      <div class="row between">
        <h2>Research & technology</h2>
        <button class="btn small ghost" onClick={() => game.setLeftPanel('research')}>
          ✕
        </button>
      </div>
      <p class="muted small">
        Research spreads its cost over months of R&D spending: you pay now for higher productivity later. Or buy a
        license instantly at 2.5× the price.
      </p>
      {me.research && (
        <div class="explain">
          Researching <b>{TECHS.find((t) => t.id === me.research!.tech)!.name}</b>: {me.research.daysLeft} days left.{' '}
          <button class="link" onClick={() => run(() => cancelResearch(st, 0))}>
            cancel
          </button>
        </div>
      )}
      {tiers.map((tier) => (
        <div key={tier}>
          <h3>{['Foundations', 'Industrialization', 'Modern age'][tier]}</h3>
          {TECHS.filter((t) => t.tier === tier).map((t) => {
            const done = me.techs.includes(t.id);
            const can = researchable(me, t.id);
            const active = me.research?.tech === t.id;
            return (
              <div key={t.id} class={cls('tech', done && 'done', !done && !can && 'locked')}>
                <div class="row between">
                  <b>
                    {done ? '✓ ' : !can ? '🔒 ' : ''}
                    {t.name}
                  </b>
                  <span class="muted small">
                    {money(t.cost * st.priceLevel, { compact: true })} · {t.days} d
                  </span>
                </div>
                <div class="muted small">{t.description}</div>
                {!done && t.requires.length > 0 && !can && (
                  <div class="small muted">Needs: {t.requires.map((r) => TECHS.find((x) => x.id === r)!.name).join(', ')}</div>
                )}
                {!done && can && (
                  <div class="row" style={{ marginTop: '6px' }}>
                    <button class="btn small primary" disabled={!!me.research || active} onClick={() => run(() => startResearch(st, 0, t.id))}>
                      {active ? 'Researching…' : 'Research'}
                    </button>
                    <button class="btn small" onClick={() => run(() => buyLicense(st, 0, t.id))}>
                      Buy license ({money(licenseCost(st, t.id), { compact: true })})
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </aside>
  );
}
