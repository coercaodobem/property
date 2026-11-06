import { ChessController } from "./game.js";
import { pickLanguage, stringsFor } from "./strings.js";
import { mountChess } from "./ui.js";
import type { MiniAppApi } from "./property-api.js";

export function mountPropertyChess(root: HTMLElement, api: MiniAppApi, locale: string): {
  game: ChessController;
  ready: Promise<void>;
  stop(): void;
} {
  const language = pickLanguage(locale);
  const game = new ChessController(api);
  const unmount = mountChess(root, game, stringsFor(language));
  const ready = game.start();
  return {
    game,
    ready,
    stop() {
      unmount();
      game.stop();
    },
  };
}
