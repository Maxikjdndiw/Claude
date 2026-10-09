import { CONCEPT, CONCEPTS } from '../../data/concepts';
import type { Game } from '../../game';
import { formatDate } from '../../sim/time';
import { cls } from '../format';
import { useStore } from '../store';

/** The pop-up for a newly encountered concept (non-blocking, optional). */
export function LessonCard({ game }: { game: Game }) {
  useStore(game.ui, (s) => s.tick);
  const tips = useStore(game.ui, (s) => s.tips);
  const st = game.state;
  if (!st || !tips) return null;
  const lesson = st.learning.queue[0];
  if (!lesson) return null;
  const c = CONCEPT[lesson.concept];
  if (!c) {
    st.learning.queue.shift();
    return null;
  }
  const next = () => {
    st.learning.queue.shift();
    game.ui.set({ tick: game.ui.state.tick + 1 });
  };
  return (
    <div class="lesson panel">
      <div class="row between">
        <span class="eyebrow">💡 Economics · {c.topic}</span>
        <span class="muted small">{st.learning.queue.length > 1 ? `+${st.learning.queue.length - 1} more` : ''}</span>
      </div>
      <h2>{c.title}</h2>
      <p class="lesson-example">{lesson.example}</p>
      <p class="small">{c.summary}</p>
      <div class="row between">
        <label class="check">
          <input type="checkbox" checked={!tips} onChange={() => game.setTips(false)} />
          Don't show tips
        </label>
        <div class="row">
          <button
            class="btn small ghost"
            onClick={() => {
              game.ui.set({ glossaryFocus: c.id });
              game.setLeftPanel('learn');
              next();
            }}
          >
            Glossary
          </button>
          <button class="btn small primary" onClick={next}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

export function GlossaryPanel({ game }: { game: Game }) {
  useStore(game.ui, (s) => s.tick);
  const focus = useStore(game.ui, (s) => s.glossaryFocus);
  const tips = useStore(game.ui, (s) => s.tips);
  const st = game.state!;
  const seen = st.learning.seen;
  const topics = [...new Set(CONCEPTS.map((c) => c.topic))];
  const count = CONCEPTS.filter((c) => seen[c.id]).length;
  return (
    <aside class="side panel left wide">
      <div class="row between">
        <h2>Economics glossary</h2>
        <button class="btn small ghost" onClick={() => game.setLeftPanel('learn')}>
          ✕
        </button>
      </div>
      <div class="kv">
        <span>
          Discovered {count} of {CONCEPTS.length} concepts
        </span>
        <label class="check">
          <input type="checkbox" checked={tips} onChange={() => game.setTips(!tips)} />
          Show tips
        </label>
      </div>
      <div class="meter">
        <div style={{ width: `${(count / CONCEPTS.length) * 100}%`, background: '#7e9cf0' }} />
      </div>
      {topics.map((topic) => (
        <div key={topic}>
          <h3>{topic}</h3>
          {CONCEPTS.filter((c) => c.topic === topic).map((c) => {
            const s = seen[c.id];
            return (
              <details key={c.id} class={cls('concept', !s && 'locked')} open={focus === c.id}>
                <summary>
                  {s ? c.title : `🔒 ${c.title}`}
                  {s && <span class="muted small"> · {formatDate(s.day)}</span>}
                </summary>
                {s ? (
                  <>
                    <p class="small">
                      <b>{c.summary}</b>
                    </p>
                    <p class="small">{c.detail}</p>
                    <p class="lesson-example small">In your game: {s.example}</p>
                  </>
                ) : (
                  <p class="muted small">Not encountered yet. Keep playing; it will be explained when it matters to you.</p>
                )}
              </details>
            );
          })}
        </div>
      ))}
    </aside>
  );
}
