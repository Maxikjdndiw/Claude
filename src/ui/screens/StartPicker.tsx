import { BIOMES } from '../../data/biomes';
import type { Game } from '../../game';
import type { SiteAnalysis } from '../../sim/world/query';
import { useStore } from '../store';
import { formatPop } from '../../render/view';
import { TutorialCard } from '../panels/Tutorial';

function Meter({ value, color }: { value: number; color: string }) {
  return (
    <div class="meter">
      <div style={{ width: `${Math.round(Math.min(1, value) * 100)}%`, background: color }} />
    </div>
  );
}

function SiteCard({ site, title }: { site: SiteAnalysis; title: string }) {
  return (
    <div class="site">
      <div class="site-head">
        <span class="eyebrow">{title}</span>
        <span class="chip">{BIOMES[site.biome].name}</span>
      </div>
      <div class="stats">
        <div>
          <span>Farmland quality</span>
          <Meter value={site.avgFertility} color="#8bc34a" />
        </div>
        <div>
          <span>Forest cover</span>
          <Meter value={site.forestShare * 2.5} color="#43a047" />
        </div>
        <div>
          <span>Fish stocks</span>
          <Meter value={site.fishStock / 80} color="#29b6f6" />
        </div>
        <div>
          <span>Buildable land</span>
          <Meter value={site.buildableShare} color="#90a4ae" />
        </div>
      </div>
      {site.deposits.length > 0 && (
        <div class="deposits">
          {site.deposits.map((d) => (
            <span class="dep" key={d.resource}>
              <i style={{ background: d.color }} />
              {d.name} · {(d.amount / 1000).toFixed(0)}k t
            </span>
          ))}
        </div>
      )}
      <div class="towns">
        {site.towns.map(({ town, distance }) => (
          <div class="town-row" key={town.id}>
            <b>{town.name}</b>
            <span class="muted">
              {formatPop(town.population)} people · {distance.toFixed(0)} km
            </span>
          </div>
        ))}
      </div>
      <ul class="pros">
        {site.strengths.map((s) => (
          <li class="pro" key={s}>
            {s}
          </li>
        ))}
        {site.weaknesses.map((s) => (
          <li class="con" key={s}>
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StartPicker({ game }: { game: Game }) {
  const hover = useStore(game.ui, (s) => s.hover);
  const selected = useStore(game.ui, (s) => s.selected);
  const showRes = useStore(game.ui, (s) => s.showResources);
  const site = selected ?? hover;

  return (
    <>
      <TutorialCard game={game} />
      <div class="banner panel">
        <b>Choose your starting location</b>
        <span class="muted">
          Your headquarters sets where you can build first. Look for resources, nearby towns, and access to rivers or the sea.
        </span>
        <button class={`btn small ${showRes ? 'on' : ''}`} onClick={() => game.toggleResources()}>
          ◈ Resources
        </button>
      </div>
      <aside class="side panel right">
        {site ? (
          <SiteCard site={site} title={selected ? 'Selected site' : 'Hovered site'} />
        ) : (
          <p class="muted">Hover over the map to inspect a site, then click to select it.</p>
        )}
        <div class="actions">
          <button class="btn ghost" onClick={() => game.backToMenu()}>
            Back
          </button>
          <button class="btn primary" disabled={!selected} onClick={() => game.confirmStart()}>
            Found company here
          </button>
        </div>
      </aside>
    </>
  );
}
