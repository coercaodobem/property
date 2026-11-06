const FILES = "abcdefgh";
// Solid glyphs for both sides (CSS colours them), each with U+FE0E so no platform draws the pawn as an emoji.
const GLYPH = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
const NOTICE_KEY = {
    "invalid-move": "notice_invalidMove",
    "bad-message": "notice_badMessage",
    "too-big": "notice_tooBig",
    "newer-version": "notice_newerVersion",
    "bad-reveal": "notice_badReveal",
    "toss-restarted": "notice_tossRestarted",
    "out-of-step": "notice_outOfStep",
    "peer-new-game": "notice_peerNewGame",
    "send-failed": "notice_sendFailed",
};
const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className)
        node.className = className;
    if (text !== undefined)
        node.textContent = text;
    return node;
};
export function mountChess(root, game, t) {
    const app = el("main", "property-chess-app");
    const status = el("p", "status");
    status.setAttribute("role", "status");
    const side = el("p", "side");
    const board = el("div", "board");
    board.setAttribute("role", "grid");
    board.setAttribute("aria-label", t.board);
    // A chessboard is never mirrored: a1 stays at white's bottom left in a right-to-left language too (the page takes
    // the language's direction, and the board's grid would follow it).
    board.dir = "ltr";
    const promote = el("div", "row promote");
    promote.hidden = true;
    const actions = el("div", "row actions");
    const notice = el("p", "notice");
    notice.setAttribute("role", "alert");
    app.append(status, side, board, promote, actions, notice);
    root.replaceChildren(app);
    const rows = [];
    const squares = new Map();
    for (let r = 0; r < 8; r++) {
        const row = el("div", "rank");
        row.setAttribute("role", "row");
        rows.push(row);
        board.append(row);
    }
    for (let rank = 1; rank <= 8; rank++) {
        for (const file of FILES) {
            const square = `${file}${rank}`;
            const button = el("button", "sq");
            button.type = "button";
            button.setAttribute("role", "gridcell");
            button.dataset.square = square;
            button.classList.add((FILES.indexOf(file) + rank) % 2 === 0 ? "light" : "dark");
            button.tabIndex = -1;
            squares.set(square, button);
        }
    }
    let selected = null;
    let focus = "e2";
    let pending = null;
    let resignArmed = false;
    let noticeTimer;
    let flipped = null;
    /** Squares in drawing order, top row first. */
    const layout = (black) => Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, c) => `${FILES[black ? 7 - c : c]}${black ? r + 1 : 8 - r}`));
    function position(square, black) {
        const file = FILES.indexOf(square[0]);
        const rank = Number(square[1]);
        return black ? [rank - 1, 7 - file] : [8 - rank, file];
    }
    function render() {
        const view = game.view();
        const black = view.me === "b";
        if (flipped !== black) {
            flipped = black;
            layout(black).forEach((row, r) => rows[r].replaceChildren(...row.map((s) => squares.get(s))));
            if (black && focus === "e2")
                focus = "e7";
        }
        if (selected && !view.canMove)
            selected = null;
        const targets = selected ? game.targets(selected) : [];
        const targetSet = new Set(targets.map((m) => m.to));
        const grid = game.board();
        for (const [square, button] of squares) {
            const [r, c] = [8 - Number(square[1]), FILES.indexOf(square[0])];
            const piece = grid[r][c];
            button.textContent = piece ? `${GLYPH[piece.type]}︎` : "";
            button.classList.toggle("w", piece?.color === "w");
            button.classList.toggle("b", piece?.color === "b");
            button.classList.toggle("selected", square === selected);
            button.classList.toggle("target", targetSet.has(square));
            button.classList.toggle("capture", targetSet.has(square) && Boolean(piece));
            const last = view.lastMove && (view.lastMove.from === square || view.lastMove.to === square);
            button.classList.toggle("last", Boolean(last));
            button.classList.toggle("check", view.inCheck && piece?.type === "k" && piece.color === view.turn);
            const parts = [square, piece ? t.piece.replace("{colour}", piece.color === "w" ? t.white : t.black).replace("{piece}", t[`piece_${piece.type}`]) : t.empty];
            if (square === selected)
                parts.push(t.selected);
            if (targetSet.has(square))
                parts.push(t.canMoveHere);
            if (last)
                parts.push(t.lastMove);
            button.setAttribute("aria-label", parts.join(", "));
            button.setAttribute("aria-selected", String(square === selected));
            button.tabIndex = square === focus ? 0 : -1;
        }
        board.classList.toggle("locked", !view.canMove);
        status.textContent = statusText(view);
        side.textContent = view.me ? (view.me === "w" ? t.youAreWhite : t.youAreBlack) : "";
        renderActions(view);
    }
    function statusText(view) {
        if (view.end) {
            const { result, why } = view.end;
            const head = result === "1/2-1/2" ? t.drawn : view.me ? ((result === "1-0") === (view.me === "w") ? t.won : t.lost) : result === "1-0" ? t.whiteWins : t.blackWins;
            return `${head}: ${t[`why_${why}`]}`;
        }
        const check = view.inCheck ? `. ${t.check}` : "";
        switch (view.phase) {
            case "loading":
                return t.loading;
            case "alone":
                return `${view.turn === "w" ? t.whiteToMove : t.blackToMove}${check}`;
            case "toss":
                return view.peerOpen ? t.tossing : t.waitingPeer;
            case "out-of-step":
                return t.outOfStep;
            default:
                if (!view.peerOpen)
                    return t.away;
                return `${view.me === view.turn ? t.yourMove : t.theirMove}${check}`;
        }
    }
    const button = (label, run, className = "") => {
        const b = el("button", `act ${className}`.trim(), label);
        b.type = "button";
        b.addEventListener("click", run);
        return b;
    };
    function renderActions(view) {
        const out = [];
        if (view.phase === "alone" && view.plies > 0)
            out.push(button(t.newGame, () => void game.newGame()));
        if (view.phase === "playing") {
            if (view.drawOffer === "peer") {
                out.push(el("span", "offer", t.peerOffersDraw));
                out.push(button(t.accept, () => void game.answerDraw(true), "primary"));
                out.push(button(t.decline, () => void game.answerDraw(false)));
            }
            else {
                const offer = button(view.drawOffer === "me" ? t.youOfferedDraw : t.offerDraw, () => void game.offerDraw());
                offer.disabled = view.drawOffer === "me" || !view.peerOpen;
                out.push(offer);
            }
            out.push(button(resignArmed ? t.resignSure : t.resign, () => {
                if (!resignArmed) {
                    resignArmed = true;
                    render();
                    actions.querySelector(".danger")?.focus();
                    return;
                }
                resignArmed = false;
                void game.resign();
            }, "danger"));
        }
        else
            resignArmed = false;
        if (view.phase === "over" || view.phase === "out-of-step")
            out.push(button(t.newGame, () => void game.newGame(), "primary"));
        const hadFocus = actions.contains(document.activeElement);
        actions.replaceChildren(...out);
        if (hadFocus)
            (actions.querySelector(".danger") ?? actions.querySelector("button"))?.focus();
    }
    function showPromotion(from, to) {
        pending = { from, to };
        const label = el("span", "", t.promoteTo);
        const colour = game.view().turn;
        const choices = ["q", "r", "b", "n"].map((p) => {
            const b = button(`${GLYPH[p]}︎`, () => finishPromotion(p), `piece ${colour}`);
            b.setAttribute("aria-label", t[`piece_${p}`]);
            return b;
        });
        promote.replaceChildren(label, ...choices);
        promote.hidden = false;
        choices[0].focus();
    }
    function finishPromotion(piece) {
        const move = pending;
        pending = null;
        promote.hidden = true;
        promote.replaceChildren();
        squares.get(focus)?.focus();
        if (move && piece)
            void game.move(move.from, move.to, piece).then(() => (selected = null));
        selected = null;
        render();
    }
    function activate(square) {
        focus = square;
        const view = game.view();
        if (!view.canMove)
            return render();
        if (selected) {
            const target = game.targets(selected).find((m) => m.to === square);
            if (target) {
                const from = selected;
                if (target.promotion)
                    return showPromotion(from, square);
                selected = null;
                void game.move(from, square);
                return render();
            }
        }
        selected = selected !== square && game.targets(square).length ? square : null;
        render();
    }
    board.addEventListener("click", (event) => {
        const square = event.target.closest(".sq")?.dataset.square;
        if (square)
            activate(square);
    });
    board.addEventListener("keydown", (event) => {
        const black = game.view().me === "b";
        let [r, c] = position(focus, black);
        switch (event.key) {
            case "ArrowUp":
                r = Math.max(0, r - 1);
                break;
            case "ArrowDown":
                r = Math.min(7, r + 1);
                break;
            case "ArrowLeft":
                c = Math.max(0, c - 1);
                break;
            case "ArrowRight":
                c = Math.min(7, c + 1);
                break;
            case "Home":
                c = 0;
                break;
            case "End":
                c = 7;
                break;
            case "Enter":
            case " ":
                event.preventDefault();
                return activate(focus);
            case "Escape":
                selected = null;
                return render();
            default:
                return;
        }
        event.preventDefault();
        focus = layout(black)[r][c];
        render();
        squares.get(focus)?.focus();
    });
    promote.addEventListener("keydown", (event) => {
        if (event.key === "Escape")
            finishPromotion(null);
    });
    const offChange = game.subscribe(render);
    const offNotice = game.onNotice((n) => {
        notice.textContent = t[NOTICE_KEY[n]];
        clearTimeout(noticeTimer);
        noticeTimer = setTimeout(() => (notice.textContent = ""), 6000);
    });
    render();
    return () => {
        offChange();
        offNotice();
        clearTimeout(noticeTimer);
    };
}
