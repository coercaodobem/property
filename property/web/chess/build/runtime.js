import { ChessController } from "./game.js";
import { pickLanguage, stringsFor } from "./strings.js";
import { mountChess } from "./ui.js";
export function mountPropertyChess(root, api, locale) {
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
