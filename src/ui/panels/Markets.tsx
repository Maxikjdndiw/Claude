import { useState } from 'preact/hooks';
import { EVENT } from '../../data/events';
import type { Game } from '../../game';
import { annuity, creditLimit, creditRating, debtOf, monthlyPayment, repayLoan, takeLoan } from '../../sim/bank';
import { fundamentalValue, netProfit, peMultiple, trailing } from '../../sim/finance';
import { INFLATION_TARGET } from '../../sim/macro';
import type { Company } from '../../sim/state';
import * as stocks from '../../sim/stocks';
import { formatDate } from '../../sim/time';
import { cls, money, pct, price } from '../format';
import { useStore } from '../store';
import { Spark } from '../widgets/Spark';

const PHASE = { boom: '📈 Boom', normal: '➖ Normal', recession: '📉 Recession' } as const;

function Header({ game, title, panel }: { game: Game; title: string; panel: 'economy' | 'bank' | 'stocks' }) {
  return (
    <div class="row between">
      <h2>{title}</h2>
      <button class="btn small ghost" onClick={() => game.setLeftPanel(panel)}>
        ✕
      </button>
    </div>
  );
}

export function EconomyPanel({ game }: { game: Game }) {
  useStore(game.ui, (s) => s.tick);
  const st = game.state!;
  const m = st.macro;
  const h = m.history;
  return (
    <aside class="side panel left wide">
      <Header game={game} title="Economy" panel="economy" />
      <div class="stats3">
        <div>
          <span>Business cycle</span>
          <b>{PHASE[m.phase]}</b>
        </div>
        <div>
          <span>Output gap</span>
          <b class={cls(m.gap < -0.01 && 'neg', m.gap > 0.01 && 'pos')}>{(m.gap * 100).toFixed(1)}%</b>
        </div>
        <div>
          <span>Inflation (annual)</span>
          <b class={cls(m.inflation > 0.04 && 'neg')}>{pct(m.inflation, 1)}</b>
        </div>
        <div>
          <span>Central bank rate</span>
          <b>{pct(m.baseRate, 2)}</b>
        </div>
      </div>
      <div class="kv">
        <span>Price level since start</span>
        <b>+{pct(st.priceLevel - 1, 1)}</b>
      </div>
      {h.length > 2 && (
        <>
          <div class="kv">
            <span>Inflation trend</span>
            <Spark values={h.map((x) => x.inflation)} width={180} height={28} />
          </div>
          <div class="kv">
            <span>Interest rate trend</span>
            <Spark values={h.map((x) => x.baseRate)} width={180} height={28} />
          </div>
          <div class="kv">
            <span>Output gap trend</span>
            <Spark values={h.map((x) => x.gap)} width={180} height={28} />
          </div>
        </>
      )}
      <div class="explain">
        The central bank targets {pct(INFLATION_TARGET)} inflation. When inflation runs above target or the economy
        overheats it raises interest rates (borrowing gets dearer, share prices fall); in recessions it cuts them.
      </div>
      <h3>Active events</h3>
      {st.activeEvents.length === 0 && <p class="muted small">Nothing unusual right now.</p>}
      {st.activeEvents.map((e) => {
        const def = EVENT[e.id];
        return (
          <div key={e.id + e.start} class={cls('news', def.kind)}>
            <b>{def.title}</b>
            <div class="small">{def.text.replace('{town}', e.town !== undefined ? st.towns[e.town].name : 'a town')}</div>
            <span class="muted small">
              since {formatDate(e.start)}
              {e.until < 90000 ? ` · until ~${formatDate(e.until)}` : ' · permanent'}
            </span>
          </div>
        );
      })}
    </aside>
  );
}

export function BankPanel({ game }: { game: Game }) {
  useStore(game.ui, (s) => s.tick);
  const st = game.state!;
  const me = st.companies[0];
  const r = creditRating(st, me);
  const limit = creditLimit(st, me);
  const [amount, setAmount] = useState(50000);
  const [months, setMonths] = useState(60);
  const [variable, setVariable] = useState(false);
  const amt = Math.min(amount, limit);
  const rate = st.macro.baseRate + r.spread + (variable ? 0 : 0.004);
  const pay = annuity(amt, rate, months);
  const loans = st.loans.filter((l) => l.owner === 0);
  return (
    <aside class="side panel left wide">
      <Header game={game} title="Bank" panel="bank" />
      <div class="stats3">
        <div>
          <span>Credit rating</span>
          <b class={cls(r.index >= 5 && 'neg', r.index <= 1 && 'pos')}>{r.grade}</b>
        </div>
        <div>
          <span>Your loan rate</span>
          <b>{pct(st.macro.baseRate + r.spread, 2)}</b>
        </div>
        <div>
          <span>Debt</span>
          <b>{money(debtOf(st, 0), { compact: true })}</b>
        </div>
        <div>
          <span>Can still borrow</span>
          <b>{money(limit, { compact: true })}</b>
        </div>
      </div>
      <p class="muted small">
        Rate = central bank rate {pct(st.macro.baseRate, 2)} + risk spread {pct(r.spread, 1)}. Your rating depends on
        leverage (debt / assets: {pct(r.leverage)}) and interest coverage (operating profit / interest:{' '}
        {r.coverage >= 20 ? 'ample' : `${r.coverage.toFixed(1)}×`}).
      </p>
      <h3>New loan</h3>
      <div class="kv">
        <span>Amount</span>
        <b>{money(amt)}</b>
      </div>
      <input type="range" min={1000} max={Math.max(1000, limit)} step={1000} value={amt} onInput={(e) => setAmount(Number((e.target as HTMLInputElement).value))} />
      <div class="kv">
        <span>Term</span>
        <div class="seg-inline">
          {[12, 36, 60, 120].map((m) => (
            <button key={m} class={cls('seg', months === m && 'on')} onClick={() => setMonths(m)}>
              {m / 12}y
            </button>
          ))}
        </div>
      </div>
      <div class="kv">
        <span>Interest</span>
        <div class="seg-inline">
          <button class={cls('seg', !variable && 'on')} onClick={() => setVariable(false)}>
            Fixed
          </button>
          <button class={cls('seg', variable && 'on')} onClick={() => setVariable(true)}>
            Variable
          </button>
        </div>
      </div>
      <div class="kv">
        <span>Monthly installment</span>
        <b>
          {money(pay)} <span class="muted">at {pct(rate, 2)}</span>
        </b>
      </div>
      <div class="kv">
        <span>Total interest</span>
        <b>{money(pay * months - amt)}</b>
      </div>
      <div class="explain">
        {variable
          ? 'Variable: starts cheaper but follows the central bank. If rates rise, so do your payments (interest rate risk).'
          : 'Fixed: a slightly higher rate, locked for the whole term. Predictable payments whatever the central bank does.'}{' '}
        Borrowing pays off only if the investment earns more than the interest (leverage).
      </div>
      <button class="btn primary" disabled={limit < 1000} onClick={() => game.run(() => takeLoan(st, 0, amt, months, variable))}>
        Take loan
      </button>
      <h3>Your loans</h3>
      {loans.length === 0 && <p class="muted small">No debt.</p>}
      {loans.map((l) => (
        <div key={l.id} class="line-card">
          <div class="row between">
            <b>{money(l.balance)}</b>
            <span class="muted small">
              {pct(l.rate, 2)} {l.variable ? 'variable' : 'fixed'} · {l.monthsLeft} months left
            </span>
          </div>
          <div class="row between">
            <span class="muted small">Borrowed {money(l.principal)} on {formatDate(l.takenDay)}</span>
            <button class="btn small" onClick={() => game.run(() => repayLoan(st, 0, l.id))}>
              Repay all
            </button>
          </div>
        </div>
      ))}
      {loans.length > 0 && (
        <p class="muted small">
          Monthly installments: {money(monthlyPayment(st, 0))}. Interest is an expense; the principal part reduces your debt.
        </p>
      )}
    </aside>
  );
}

function ttmProfit(c: Company) {
  const n = Math.min(12, c.history.length);
  return n ? (netProfit(trailing(c, n)) * 12) / n : 0;
}

export function StocksPanel({ game }: { game: Game }) {
  useStore(game.ui, (s) => s.tick);
  const st = game.state!;
  const me = st.companies[0];
  const e = me.equity;
  const [frac, setFrac] = useState(0.3);
  const [div, setDiv] = useState(0.05);
  const chk = stocks.ipoCheck(st, me);
  const fair = fundamentalValue(st, me);
  const others = st.companies.filter((c) => c.id !== 0 && !c.bankrupt && c.acquiredBy === undefined);
  return (
    <aside class="side panel left wide">
      <Header game={game} title="Stock market" panel="stocks" />
      {!e.listed ? (
        <>
          <h3>Go public (IPO)</h3>
          <p class="muted small">
            Sell part of your company to investors to raise cash without debt. You give up part of the future profits and,
            above 50%, control.
          </p>
          <div class="kv">
            <span>Estimated company value</span>
            <b>{money(fair)}</b>
          </div>
          <div class="kv">
            <span>Share to sell</span>
            <b>{pct(frac)}</b>
          </div>
          <input type="range" min={0.05} max={0.6} step={0.05} value={frac} onInput={(ev) => setFrac(Number((ev.target as HTMLInputElement).value))} />
          <div class="kv">
            <span>Cash raised (approx.)</span>
            <b>{money((frac / (1 - frac)) * fair * 0.9)}</b>
          </div>
          {frac > 0.5 && <p class="warn">You would own less than half your company: the board could replace you if it loses money.</p>}
          {!chk.ok && <p class="err">{chk.reason}</p>}
          <button class="btn primary" disabled={!chk.ok} onClick={() => game.run(() => stocks.ipo(st, 0, frac))}>
            Launch IPO
          </button>
        </>
      ) : (
        <>
          <div class="stats3">
            <div>
              <span>Share price</span>
              <b>{price(e.price)}</b>
            </div>
            <div>
              <span>Market cap</span>
              <b>{money(e.price * e.shares, { compact: true })}</b>
            </div>
            <div>
              <span>Your stake</span>
              <b class={cls(stocks.founderStake(me) < 0.5 && 'neg')}>{pct(stocks.founderStake(me), 1)}</b>
            </div>
            <div>
              <span>P/E ratio</span>
              <b>{ttmProfit(me) > 0 ? ((e.price * e.shares) / ttmProfit(me)).toFixed(1) : '—'}</b>
            </div>
          </div>
          <div class="kv">
            <span>Price (weekly)</span>
            <Spark values={e.history.slice(-52)} width={200} height={30} />
          </div>
          <h3>Shareholders</h3>
          {Object.entries(e.holdings)
            .filter(([, n]) => n > 0)
            .map(([h, n]) => (
              <div class="kv" key={h}>
                <span>{stocks.holderName(st, h)}</span>
                <b>{pct(n / e.shares, 1)}</b>
              </div>
            ))}
          <h3>Actions</h3>
          <div class="kv">
            <span>Dividend per share</span>
            <div class="stepper">
              <button onClick={() => setDiv(Math.max(0.01, +(div - 0.01).toFixed(2)))}>−</button>
              <b>{price(div)}</b>
              <button onClick={() => setDiv(+(div + 0.01).toFixed(2))}>+</button>
            </div>
          </div>
          <div class="row">
            <button class="btn small" onClick={() => game.run(() => stocks.payDividend(st, 0, div))}>
              Pay {money(div * e.shares, { compact: true })}
            </button>
            <button class="btn small" onClick={() => game.run(() => stocks.issueShares(st, 0, e.shares * 0.05))}>
              Issue 5% new shares
            </button>
            <button class="btn small" onClick={() => game.run(() => stocks.buyback(st, 0, e.shares * 0.02))}>
              Buy back 2%
            </button>
          </div>
          <p class="muted small">
            Founder wealth (dividends you personally received): <b>{money(me.founderWealth)}</b>
          </p>
        </>
      )}
      <h3>Listed companies</h3>
      <table class="tbl">
        <thead>
          <tr>
            <th>Company</th>
            <th>Price</th>
            <th>Cap</th>
            <th>You own</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {others.map((c) => {
            const mine = stocks.stake(c, 'c0');
            const lot = Math.round(c.equity.shares * 0.05);
            return (
              <tr key={c.id}>
                <td>
                  <i class="swatch" style={{ background: c.color }} />
                  {c.name}
                  {!c.equity.listed && <div class="muted small">private</div>}
                </td>
                <td>{c.equity.listed ? price(c.equity.price) : '—'}</td>
                <td>{money(c.equity.price * c.equity.shares, { compact: true })}</td>
                <td>{mine > 0 ? pct(mine, 1) : '—'}</td>
                <td>
                  {c.equity.listed && (
                    <div class="row" style={{ gap: '3px' }}>
                      <button class="btn small" title="Buy 5% from the market" onClick={() => game.run((s) => stocks.buyShares(s, 0, c.id, lot))}>
                        +5%
                      </button>
                      <button class="btn small" title="Sell 5%" disabled={mine <= 0} onClick={() => game.run((s) => stocks.sellShares(s, 0, c.id, lot))}>
                        −5%
                      </button>
                      <button
                        class="btn small"
                        title="Offer the founders a 30% premium for 10% of the company"
                        onClick={() => game.run((s) => stocks.tenderOffer(s, 0, c.id, c.equity.shares * 0.1, 0.3))}
                      >
                        Bid
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p class="muted small">
        Own more than 50% of a rival and you take it over: its plants, vehicles and debts become yours. Investors currently
        pay about {peMultiple(st).toFixed(1)}× earnings; higher interest rates make shares cheaper.
      </p>
    </aside>
  );
}
