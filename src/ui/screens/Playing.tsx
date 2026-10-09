import type { Game } from '../../game';
import { useStore } from '../store';

/** In-game HUD. Milestone 1: top bar shell; the simulation arrives in milestone 2. */
export function Playing({ game }: { game: Game }) {
  useStore(game.ui, (s) => s.tick);
  const showRes = useStore(game.ui, (s) => s.showResources);
  const st = game.state!;
  return (
    <>
      <header class="topbar panel">
        <div class="tb-company">
          <span class="brand-mark sm">◆</span>
          <b>{st.companyName}</b>
        </div>
        <div class="tb-stat">
          <span>Cash</span>
          <b>$50,000</b>
        </div>
        <div class="tb-stat">
          <span>Date</span>
          <b>Jan 1, 2000</b>
        </div>
        <div class="tb-stat">
          <span>Company value</span>
          <b>$50,000</b>
        </div>
        <div class="tb-spacer" />
        <button class={`btn small ${showRes ? 'on' : ''}`} onClick={() => game.toggleResources()}>
          ◈ Resources
        </button>
        <button class="btn small ghost" onClick={() => game.backToMenu()}>
          Menu
        </button>
      </header>
    </>
  );
}
