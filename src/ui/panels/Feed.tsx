import { useEffect } from 'preact/hooks';
import type { Game } from '../../game';
import { formatDate } from '../../sim/time';
import { cls } from '../format';
import { useStore } from '../store';

/** Short-lived notifications in the bottom-left corner. */
export function Toasts({ game }: { game: Game }) {
  const toasts = useStore(game.ui, (s) => s.toasts);
  useEffect(() => {
    if (!toasts.length) return;
    const t = setTimeout(() => {
      const now = performance.now();
      game.ui.set({ toasts: game.ui.state.toasts.filter((x) => now - x.born < 7000) });
    }, 1000);
    return () => clearTimeout(t);
  }, [toasts]);
  return (
    <div class="toasts">
      {toasts.map((t) => (
        <div key={t.id} class={cls('toast panel', t.kind)} onClick={() => game.dismissToast(t.id)}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function NewsPanel({ game }: { game: Game }) {
  useStore(game.ui, (s) => s.tick);
  const log = [...game.state!.log].reverse();
  return (
    <aside class="side panel left">
      <div class="row between">
        <h2>News</h2>
        <button class="btn small ghost" onClick={() => game.setLeftPanel('log')}>
          ✕
        </button>
      </div>
      {log.length === 0 && <p class="muted">Nothing has happened yet.</p>}
      {log.map((e, i) => (
        <div key={i} class={cls('news', e.kind)}>
          <span class="muted small">{formatDate(e.day)}</span>
          <div>{e.text}</div>
        </div>
      ))}
    </aside>
  );
}

export function ErrorFlash({ game }: { game: Game }) {
  const err = useStore(game.ui, (s) => s.error);
  if (!err) return null;
  return <div class="error-flash panel">{err}</div>;
}

export function GameOver({ game }: { game: Game }) {
  useStore(game.ui, (s) => s.tick);
  const go = game.state?.gameOver;
  if (!go) return null;
  return (
    <div class="modal-back">
      <div class="modal panel">
        <h1>Game over</h1>
        <p>{go.reason}</p>
        <p class="muted">{formatDate(go.day)}</p>
        <button class="btn primary big" onClick={() => game.backToMenu()}>
          Back to menu
        </button>
      </div>
    </div>
  );
}
