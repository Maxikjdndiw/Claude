import { h, render } from 'preact';
import { Game } from './game';
import { App } from './ui/App';
import * as transport from './sim/transport';
import * as commands from './sim/commands';
import * as resources from './sim/resources';
import * as tech from './sim/tech';
import * as roads from './sim/roads';
import './ui/styles.css';

const game = new Game(document.getElementById('viewport')!);
render(h(App, { game }), document.getElementById('ui')!);

// Handy for debugging and for the automated smoke test.
(window as unknown as { game: Game }).game = game;
(window as unknown as { __tr: unknown }).__tr = transport;
(window as unknown as { __dbg: unknown }).__dbg = { commands, transport, resources, tech, roads };
