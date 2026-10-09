import { ACHIEVEMENTS } from '../../data/achievements';
import { SCENARIO } from '../../data/scenarios';
import type { Game } from '../../game';
import { SLOTS, listSaves } from '../../save';
import { goalProgress } from '../../sim/goals';
import { formatDate } from '../../sim/time';
import { cls, pct } from '../format';
import { useStore } from '../store';

/** In-game pause menu: save, load, achievements, settings. */
export function PauseMenu({ game }: { game: Game }) {
  const open = useStore(game.ui, (s) => s.menuOpen);
  const trophies = useStore(game.ui, (s) => s.trophies);
  const tips = useStore(game.ui, (s) => s.tips);
  useStore(game.ui, (s) => s.tick);
  if (!open) return null;
  const saves = listSaves();
  const st = game.state!;
  return (
    <div class="modal-back" onClick={(e) => e.target === e.currentTarget && game.setMenu(false)}>
      <div class="modal panel left-align wide-modal">
        <div class="row between">
          <h2>Paused</h2>
          <button class="btn small ghost" onClick={() => game.setMenu(false)}>
            ✕
          </button>
        </div>
        <h3>Save game</h3>
        <div class="row">
          {SLOTS.filter((s) => s !== 'auto').map((slot) => {
            const meta = saves.find((m) => m.slot === slot);
            return (
              <button key={slot} class="btn small" onClick={() => game.saveTo(slot)} title={meta ? `Overwrite (${formatDate(meta.day)})` : 'Empty slot'}>
                💾 Slot {slot}
                {meta ? ' ●' : ''}
              </button>
            );
          })}
        </div>
        <h3>Load game</h3>
        <div class="row wrap">
          {saves.length === 0 && <span class="muted small">No saves yet.</span>}
          {saves.map((m) => (
            <button key={m.slot} class="btn small" onClick={() => game.ask('Load this game? Progress since your last save is lost.', 'Load', () => game.loadFrom(m.slot))}>
              {m.slot === 'auto' ? 'Autosave' : `Slot ${m.slot}`} · {m.company} · {formatDate(m.day)}
            </button>
          ))}
        </div>
        <h3>
          Achievements ({st.achievements.length} this game · {trophies.length}/{ACHIEVEMENTS.length} ever)
        </h3>
        <div class="trophies">
          {ACHIEVEMENTS.map((a) => (
            <div key={a.id} class={cls('trophy', !trophies.includes(a.id) && 'locked', st.achievements.includes(a.id) && 'now')} title={a.description}>
              <span>{a.icon}</span>
              <b>{a.title}</b>
            </div>
          ))}
        </div>
        <div class="actions">
          <label class="check">
            <input type="checkbox" checked={tips} onChange={() => game.setTips(!tips)} />
            Show economics tips
          </label>
          <div class="row">
            <button class="btn" onClick={() => game.ask('Quit to the main menu? The game autosaves every month.', 'Quit', () => game.backToMenu())}>
              Quit to menu
            </button>
            <button class="btn primary" onClick={() => game.setMenu(false)}>
              Resume
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Scenario goals tracker. */
export function ScenarioTracker({ game }: { game: Game }) {
  useStore(game.ui, (s) => s.tick);
  const st = game.state!;
  if (!st.scenario) return null;
  const sc = SCENARIO[st.scenario.id];
  const left = Math.max(0, st.scenario.deadline - st.day);
  return (
    <div class="tracker panel">
      <div class="row between">
        <b>
          {sc.icon} {sc.title}
        </b>
        <span class="muted small">
          {(left / 365).toFixed(1)} years left
        </span>
      </div>
      {goalProgress(st).map((g) => (
        <div key={g.label} class="goal">
          <span class="small">
            {g.met ? '✓ ' : ''}
            {g.label}
          </span>
          <div class="meter">
            <div style={{ width: pct(g.progress), background: g.met ? '#3f9a62' : '#7e9cf0' }} />
          </div>
        </div>
      ))}
    </div>
  );
}
