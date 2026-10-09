import type { Game } from '../../game';
import { useStore } from '../store';

interface Step {
  title: string;
  text: string;
  /** Returns true when the player has done what the step asks. */
  done: (game: Game) => boolean;
}

const mine = (g: Game, type: string) => g.state?.buildings.find((b) => b.owner === 0 && b.type === type);

/** The guided tutorial: controls and the first production chain. */
export const STEPS: Step[] = [
  {
    title: 'Welcome to Tycoon Isles',
    text: 'Drag with the left mouse button to move the map, right-drag to rotate and scroll to zoom. Hover over the map to inspect a site. Pick a spot close to a town with bright green farmland nearby, click it, then press "Found company here".',
    done: (g) => g.ui.state.screen === 'playing',
  },
  {
    title: 'Your first farm',
    text: 'In the build dock at the bottom, open the 🌾 Food tab and choose Wheat Farm. Move over bright green land near your headquarters: a green ghost means you can build, and the card shows how fertile the soil is. Click to build.',
    done: (g) => !!mine(g, 'farm'),
  },
  {
    title: 'Add value with a mill',
    text: 'Build a Flour Mill right next to the farm. Within 12 km, goods move between your buildings automatically. Flour is worth more than the wheat it is made from: that is value added.',
    done: (g) => !!mine(g, 'mill'),
  },
  {
    title: 'Let time run',
    text: 'Construction takes a few weeks. Use the speed buttons in the top bar (or keys 1, 2, 3; Space pauses) and wait until both buildings are finished.',
    done: (g) => {
      const f = mine(g, 'farm');
      const m = mine(g, 'mill');
      return !!f && !!m && f.buildLeft === 0 && m.buildLeft === 0;
    },
  },
  {
    title: 'Workers and wages',
    text: 'Click your Flour Mill. You can choose how many workers to hire and what to pay. Read the "next worker adds…" line: hire only while an extra worker produces more than his wage. Pay below the town\'s market wage and workers quit.',
    done: (g) => {
      const m = mine(g, 'mill');
      return !!m && g.ui.state.selectedBuilding === m.id;
    },
  },
  {
    title: 'Markets',
    text: 'Your flour sells automatically to the nearest town in reach. Click on that town\'s houses to see its prices. Every town is a market: deliver more than people buy and the price falls.',
    done: (g) => g.ui.state.selectedTown !== null,
  },
  {
    title: 'Follow the money',
    text: 'Open 💰 Finances in the top bar. The income statement separates variable costs (wages, materials) from fixed costs (upkeep, depreciation). Profit is what remains.',
    done: (g) => g.ui.state.leftPanel === 'finance',
  },
  {
    title: 'Grow',
    text: 'Now build a Bakery next to the mill to make bread, or use 🛣 Road and 🚚 Line to sell to other towns. Watch your rivals in 👥, and borrow from the 🏦 bank if you need to.',
    done: (g) => !!mine(g, 'bakery') || !!g.state?.lines.some((l) => l.owner === 0),
  },
  {
    title: 'You are ready!',
    text: 'Economics tips (💡) appear as you play, and the 🎓 glossary collects them. Explore research, rail, ships, the stock market and the scenarios. Good luck, tycoon!',
    done: () => false,
  },
];

export function TutorialCard({ game }: { game: Game }) {
  useStore(game.ui, (s) => s.tick);
  const step = useStore(game.ui, (s) => s.tutorial);
  // Re-render on any UI change so conditions update promptly.
  useStore(game.ui, (s) => s.selectedBuilding);
  useStore(game.ui, (s) => s.selectedTown);
  useStore(game.ui, (s) => s.leftPanel);
  useStore(game.ui, (s) => s.screen);
  if (step === null) return null;
  const s = STEPS[step];
  if (!s) return null;
  if (s.done(game)) {
    queueMicrotask(() => game.ui.set({ tutorial: step + 1 }));
  }
  const last = step === STEPS.length - 1;
  return (
    <div class="tutorial panel">
      <div class="row between">
        <span class="eyebrow">
          Tutorial · step {step + 1} of {STEPS.length}
        </span>
        <button class="link" onClick={() => game.ui.set({ tutorial: null })}>
          {last ? 'Close' : 'Skip tutorial'}
        </button>
      </div>
      <h2>{s.title}</h2>
      <p class="small">{s.text}</p>
      {last && (
        <button class="btn primary small" onClick={() => game.ui.set({ tutorial: null })}>
          Start playing
        </button>
      )}
    </div>
  );
}
