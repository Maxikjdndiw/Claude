import type { Game } from '../../game';
import { companyValue, netProfit } from '../../sim/finance';
import { formatDate } from '../../sim/time';
import { cls, money } from '../format';
import { useStore } from '../store';

const SPEEDS = [
  { v: 0, label: '❚❚', title: 'Pause (Space)' },
  { v: 1, label: '1×', title: 'Normal speed (1)' },
  { v: 2, label: '2×', title: 'Fast (2)' },
  { v: 4, label: '4×', title: 'Very fast (3)' },
];

export function TopBar({ game }: { game: Game }) {
  useStore(game.ui, (s) => s.tick);
  const speed = useStore(game.ui, (s) => s.speed);
  const left = useStore(game.ui, (s) => s.leftPanel);
  const showRes = useStore(game.ui, (s) => s.showResources);
  const st = game.state!;
  const me = st.companies[0];
  const last = me.history[me.history.length - 1];
  const monthNet = last ? netProfit(last.ledger) : 0;

  return (
    <header class="topbar panel">
      <div class="tb-company">
        <span class="brand-mark sm">◆</span>
        <b>{me.name}</b>
      </div>
      <div class="tb-stat">
        <span>Cash</span>
        <b class={cls(me.cash < 0 && 'neg')}>{money(me.cash)}</b>
      </div>
      <div class="tb-stat">
        <span>Last month</span>
        <b class={cls(monthNet < 0 ? 'neg' : 'pos')}>{last ? money(monthNet, { sign: true }) : '—'}</b>
      </div>
      <div class="tb-stat">
        <span>Company value</span>
        <b>{money(companyValue(st, me), { compact: true })}</b>
      </div>
      {me.equity.listed && (
        <div class="tb-stat">
          <span>Share price</span>
          <b>${me.equity.price.toFixed(2)}</b>
        </div>
      )}
      <div class="tb-stat">
        <span>Date</span>
        <b>{formatDate(st.day)}</b>
      </div>
      <button class="eco-badge" title="Economy: business cycle, inflation and interest rates" onClick={() => game.setLeftPanel('economy')}>
        <span>{st.macro.phase === 'boom' ? '📈' : st.macro.phase === 'recession' ? '📉' : '➖'}</span>
        <small>
          rate {(st.macro.baseRate * 100).toFixed(2)}% · infl. {(st.macro.inflation * 100).toFixed(1)}%
        </small>
      </button>
      <div class="speed">
        {SPEEDS.map((s) => (
          <button key={s.v} title={s.title} class={cls('seg', speed === s.v && 'on')} onClick={() => game.setSpeed(s.v)}>
            {s.label}
          </button>
        ))}
      </div>
      <div class="tb-spacer" />
      <button title="Finances" class={cls('btn small', left === 'finance' && 'on')} onClick={() => game.setLeftPanel('finance')}>
        💰<span class="lbl"> Finances</span>
      </button>
      <button title="Bank & loans" class={cls('btn small', left === 'bank' && 'on')} onClick={() => game.setLeftPanel('bank')}>
        🏦<span class="lbl"> Bank</span>
      </button>
      <button title="Stock market" class={cls('btn small', left === 'stocks' && 'on')} onClick={() => game.setLeftPanel('stocks')}>
        📊<span class="lbl"> Stocks</span>
      </button>
      <button title="Transport lines" class={cls('btn small', left === 'lines' && 'on')} onClick={() => game.setLeftPanel('lines')}>
        🚚<span class="lbl"> Lines</span>
      </button>
      <button title="Research" class={cls('btn small', left === 'research' && 'on')} onClick={() => game.setLeftPanel('research')}>
        🔬<span class="lbl"> Research</span>{me.research ? ' •' : ''}
      </button>
      <button title="Competitors" class={cls('btn small', left === 'rivals' && 'on')} onClick={() => game.setLeftPanel('rivals')}>
        👥<span class="lbl"> Rivals</span>
      </button>
      <button title="News" class={cls('btn small', left === 'log' && 'on')} onClick={() => game.setLeftPanel('log')}>
        📰<span class="lbl"> News</span>
      </button>
      <button title="Show resource deposits" class={cls('btn small', showRes && 'on')} onClick={() => game.toggleResources()}>
        💎<span class="lbl"> Resources</span>
      </button>
      <button class="btn small ghost" onClick={() => game.backToMenu()}>
        Menu
      </button>
    </header>
  );
}
