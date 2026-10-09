import { useState } from 'preact/hooks';
import { randomSeedText, type Game } from '../../game';
import { DIFFICULTIES, type Difficulty } from '../../data/ai';
import { SCENARIOS } from '../../data/scenarios';
import { ACHIEVEMENTS } from '../../data/achievements';
import { listSaves } from '../../save';
import { formatDate } from '../../sim/time';
import { cls, money } from '../format';
import { useStore } from '../store';

type Tab = 'new' | 'scenarios' | 'load';

export function MainMenu({ game }: { game: Game }) {
  const [seed, setSeed] = useState(game.ui.state.seedText);
  const [name, setName] = useState(game.ui.state.companyName);
  const [diff, setDiff] = useState<Difficulty>('normal');
  const [tab, setTab] = useState<Tab>('new');
  const trophies = useStore(game.ui, (s) => s.trophies);
  const saves = listSaves();
  const auto = saves.find((s) => s.slot === 'auto');

  const reroll = () => {
    const s = randomSeedText();
    setSeed(s);
    game.previewSeed(s);
  };

  return (
    <div class="menu">
      <div class="menu-card panel">
        <div class="brand">
          <div class="brand-mark">◆</div>
          <div>
            <h1>Tycoon Isles</h1>
            <p class="muted">Build an industrial empire and learn how markets really work.</p>
          </div>
        </div>
        {auto && (
          <button class="btn primary big continue" onClick={() => game.loadFrom('auto')}>
            Continue · {auto.company} · {formatDate(auto.day)}
          </button>
        )}
        <div class="dock-tabs menu-tabs">
          <button class={cls('tab', tab === 'new' && 'on')} onClick={() => setTab('new')}>
            Free play
          </button>
          <button class={cls('tab', tab === 'scenarios' && 'on')} onClick={() => setTab('scenarios')}>
            Scenarios
          </button>
          <button class={cls('tab', tab === 'load' && 'on')} onClick={() => setTab('load')}>
            Load ({saves.length})
          </button>
        </div>

        {tab === 'new' && (
          <>
            <label class="field">
              <span>Company name</span>
              <input value={name} maxLength={32} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
            </label>
            <label class="field">
              <span>World seed</span>
              <div class="row">
                <input
                  value={seed}
                  onInput={(e) => setSeed((e.target as HTMLInputElement).value)}
                  onChange={(e) => game.previewSeed((e.target as HTMLInputElement).value)}
                />
                <button class="btn ghost" onClick={reroll} title="Random world">
                  ⟳
                </button>
              </div>
            </label>
            <div class="field">
              <span>Competition</span>
              <div class="seg-row">
                {(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => (
                  <button key={d} class={cls('seg', diff === d && 'on')} onClick={() => setDiff(d)}>
                    {DIFFICULTIES[d].name}
                    <small>{DIFFICULTIES[d].bots} rivals</small>
                  </button>
                ))}
              </div>
            </div>
            <button class="btn primary big" onClick={() => game.newGame(seed, name, diff)}>
              Start free play
            </button>
            <button class="btn big" style={{ marginTop: '8px' }} onClick={() => game.startTutorial(name)}>
              🎓 Play the tutorial
            </button>
          </>
        )}

        {tab === 'scenarios' && (
          <div class="scenarios">
            {SCENARIOS.map((s) => (
              <button key={s.id} class="scenario" onClick={() => game.newGame(s.seed, name, s.difficulty, s.id)}>
                <span class="sc-icon">{s.icon}</span>
                <span>
                  <b>{s.title}</b>
                  <span class="muted small">
                    {' '}
                    · {s.years} years · {DIFFICULTIES[s.difficulty].name}
                  </span>
                  <span class="small block">{s.description}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {tab === 'load' && (
          <div class="saves">
            {saves.length === 0 && <p class="muted small">No saved games yet. The game autosaves every month.</p>}
            {saves.map((s) => (
              <button key={s.slot} class="scenario" onClick={() => game.loadFrom(s.slot)}>
                <span class="sc-icon">{s.slot === 'auto' ? '⟲' : s.slot}</span>
                <span>
                  <b>{s.company}</b>
                  <span class="muted small"> · {formatDate(s.day)}</span>
                  <span class="small block">
                    Value {money(s.value, { compact: true })} · saved {new Date(s.savedAt).toLocaleString()}
                    {s.scenario ? ' · scenario' : ''}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
        <p class="hint">
          🏆 {trophies.length}/{ACHIEVEMENTS.length} achievements · Drag to pan · right-drag to rotate · scroll to zoom
        </p>
      </div>
    </div>
  );
}
