import { defaultContent, type ContentRegistry, type PlayerSummary, type RunResult } from '@sms/shared';
import { AudioEngine } from '../audio/AudioEngine.js';
import { config, getServerInfo } from '../config.js';
import { GameClient } from '../game/GameClient.js';
import { createHighscoreStore, type FallbackHighscoreStore } from '../highscores/index.js';
import { connectDedicated, createLocalGame, hostPeerGame, joinPeerGame, type GameConnection } from '../net/connection.js';
import { Assets } from '../render/assets.js';
import { createGameOverScreen, type SubmitInfo } from '../ui/screens/gameOver.js';
import { createMenuScreen } from '../ui/screens/menu.js';
import { createRoomScreen } from '../ui/screens/room.js';

type Screen = 'boot' | 'menu' | 'room' | 'game' | 'over';

/**
 * Top-level state machine: menu -> (room) -> game -> game over -> room/menu.
 * Owns the connection, the GameClient and the DOM overlay.
 */
export class App {
  screen: Screen = 'boot';
  private readonly assets = new Assets();
  private audio!: AudioEngine;
  private readonly store: FallbackHighscoreStore = createHighscoreStore();
  private readonly content: ContentRegistry = defaultContent;
  private conn: GameConnection | null = null;
  private game: GameClient | null = null;
  private cleanup: Array<() => void> = [];
  private connCleanup: Array<() => void> = [];
  private leaving = false;
  private lastSubmit: SubmitInfo = { status: 'pending' };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly ui: HTMLElement,
  ) {}

  async boot(): Promise<void> {
    await this.assets.load();
    this.audio = new AudioEngine(this.assets.manifest, this.assets.baseUrl);
    void this.store.flushPending();
    (window as unknown as { __sms: App }).__sms = this; // debugging / smoke tests
    if (config.autoSolo) this.solo(config.autoName || 'Smoke');
    else this.showMenu();
  }

  private setUi(el: HTMLElement | null): void {
    for (const c of this.cleanup) c();
    this.cleanup = [];
    this.ui.replaceChildren(...(el ? [el] : []));
    this.ui.classList.toggle('hidden', !el);
  }

  private serverStatus(): Promise<string> {
    return getServerInfo().then((i) => (i ? `highscore server online (${config.apiUrl})` : `highscore server offline — scores saved locally`));
  }

  showMenu(error?: string): void {
    this.disconnect();
    this.screen = 'menu';
    this.audio.playMusic('menu');
    this.setUi(
      createMenuScreen(
        {
          solo: (name) => this.solo(name),
          host: (name) => void this.connect(() => (config.useDedicatedHost ? connectDedicated(name) : hostPeerGame(name, (r) => this.submit(r)))),
          join: (name, code) => void this.connect(() => (config.useDedicatedHost ? connectDedicated(name, code) : joinPeerGame(code, name))),
        },
        { store: this.store, joinCode: config.joinCode, error, serverStatus: this.serverStatus(), dedicated: config.useDedicatedHost },
      ),
    );
  }

  private submit(r: RunResult) {
    return this.store.submit(r);
  }

  private solo(name: string): void {
    const conn = createLocalGame(name, (r) => this.submit(r));
    this.attach(conn);
    // Solo skips the room screen: start as soon as the lobby exists.
    const off = conn.session.on('lobby', (l) => {
      if (l.phase === 'lobby' && conn.session.isOwner) conn.session.requestStart();
    });
    this.connCleanup.push(off);
  }

  private async connect(factory: () => Promise<GameConnection>): Promise<void> {
    try {
      const conn = await factory();
      this.attach(conn);
      this.showRoom();
    } catch (err) {
      console.error(err);
      this.showMenu(err instanceof Error ? err.message : String(err));
    }
  }

  /** Wires session events that matter regardless of the current screen. */
  private attach(conn: GameConnection): void {
    this.conn = conn;
    this.leaving = false;
    const s = conn.session;
    this.connCleanup.push(
      s.on('start', () => this.startGame()),
      s.on('lobby', (l) => {
        if (l.phase === 'lobby' && (this.screen === 'over' || this.screen === 'game') && conn.mode !== 'local') this.showRoom();
      }),
      s.on('submitted', (sub) => {
        this.lastSubmit = { status: sub.status, rank: sub.rank };
        this.gameOverUi?.setSubmit(this.lastSubmit);
      }),
      s.on('error', (e) => {
        if (e.code === 'full' || e.code === 'in_progress' || e.code === 'protocol') this.showMenu(e.message);
        else console.warn('[session]', e);
      }),
      s.on('closed', () => {
        if (!this.leaving) this.showMenu(conn.host ? 'Session closed.' : 'Lost connection to the squad host.');
      }),
    );
  }

  private disconnect(): void {
    this.game?.dispose();
    this.game = null;
    for (const c of this.connCleanup) c();
    this.connCleanup = [];
    if (this.conn) {
      this.leaving = true;
      this.conn.close();
      this.conn = null;
    }
  }

  private showRoom(): void {
    const conn = this.conn;
    if (!conn) return;
    this.game?.dispose();
    this.game = null;
    this.screen = 'room';
    this.audio.playMusic('menu');
    const room = createRoomScreen(conn.session, conn.roomCode, conn.mode, { leave: () => this.showMenu() });
    this.setUi(room.el);
    this.cleanup.push(room.dispose);
  }

  private startGame(): void {
    const conn = this.conn;
    if (!conn) return;
    this.game?.dispose();
    this.screen = 'game';
    this.lastSubmit = { status: 'pending' };
    this.gameOverUi = null;
    this.setUi(null);
    const game = new GameClient(conn, this.canvas, this.assets, this.audio, this.content);
    game.on('over', (o) => setTimeout(() => this.showGameOver(o.result, o.summary), 1600));
    game.start();
    this.game = game;
  }

  private gameOverUi: ReturnType<typeof createGameOverScreen> | null = null;

  private showGameOver(result: RunResult, summary: PlayerSummary[]): void {
    const conn = this.conn;
    if (!conn || this.screen !== 'game') return;
    this.screen = 'over';
    const colors = new Map((conn.session.lobby?.players ?? []).map((p) => [p.id, p.colorIndex]));
    const ui = createGameOverScreen(result, summary, { store: this.store, canRestart: conn.session.isOwner, colors }, {
      again: () => {
        // Back to lobby; solo auto-starts from there, squads return to the room screen.
        conn.session.requestLobby();
      },
      menu: () => this.showMenu(),
    });
    this.gameOverUi = ui;
    this.setUi(ui.el);
    ui.setSubmit(this.lastSubmit);
  }
}
