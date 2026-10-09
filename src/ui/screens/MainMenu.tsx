import { useState } from 'preact/hooks';
import { randomSeedText, type Game } from '../../game';
import { DIFFICULTIES, type Difficulty } from '../../data/ai';
import { cls } from '../format';

export function MainMenu({ game }: { game: Game }) {
  const [seed, setSeed] = useState(game.ui.state.seedText);
  const [name, setName] = useState(game.ui.state.companyName);
  const [diff, setDiff] = useState<Difficulty>('normal');

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
          New free-play game
        </button>
        <p class="hint">Drag to pan · right-drag to rotate · scroll to zoom · WASD / QE</p>
      </div>
    </div>
  );
}
