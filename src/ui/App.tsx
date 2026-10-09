import type { Game } from '../game';
import { MainMenu } from './screens/MainMenu';
import { StartPicker } from './screens/StartPicker';
import { Playing } from './screens/Playing';
import { useStore } from './store';

export function App({ game }: { game: Game }) {
  const screen = useStore(game.ui, (s) => s.screen);
  return (
    <div class="app">
      {screen === 'menu' && <MainMenu game={game} />}
      {screen === 'pickStart' && <StartPicker game={game} />}
      {screen === 'playing' && <Playing game={game} />}
    </div>
  );
}
