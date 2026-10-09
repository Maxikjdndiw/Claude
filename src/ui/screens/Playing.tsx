import type { Game } from '../../game';
import { useStore } from '../store';
import { BuildMenu, PlacementHint } from '../panels/BuildMenu';
import { BuildingPanel } from '../panels/BuildingPanel';
import { ErrorFlash, GameOver, NewsPanel, Toasts } from '../panels/Feed';
import { FinancePanel } from '../panels/FinancePanel';
import { TopBar } from '../panels/TopBar';
import { TownPanel } from '../panels/TownPanel';
import { LineDialog, LinesPanel, ToolHint } from '../panels/Transport';
import { ResearchPanel } from '../panels/Research';
import { RivalsPanel } from '../panels/Rivals';
import { BankPanel, EconomyPanel, StocksPanel } from '../panels/Markets';

/** In-game HUD. */
export function Playing({ game }: { game: Game }) {
  const left = useStore(game.ui, (s) => s.leftPanel);
  const selB = useStore(game.ui, (s) => s.selectedBuilding);
  const selT = useStore(game.ui, (s) => s.selectedTown);
  const building = useStore(game.ui, (s) => s.buildType || s.tool);
  return (
    <>
      <TopBar game={game} />
      {left === 'finance' && <FinancePanel game={game} />}
      {left === 'log' && <NewsPanel game={game} />}
      {left === 'lines' && <LinesPanel game={game} />}
      {left === 'research' && <ResearchPanel game={game} />}
      {left === 'rivals' && <RivalsPanel game={game} />}
      {left === 'economy' && <EconomyPanel game={game} />}
      {left === 'bank' && <BankPanel game={game} />}
      {left === 'stocks' && <StocksPanel game={game} />}
      <ToolHint game={game} />
      {building && <PlacementHint game={game} />}
      {!building && selB !== null && <BuildingPanel game={game} />}
      {!building && selB === null && selT !== null && <TownPanel game={game} />}
      <BuildMenu game={game} />
      <Toasts game={game} />
      <ErrorFlash game={game} />
      <LineDialog game={game} />
      <GameOver game={game} />
    </>
  );
}
