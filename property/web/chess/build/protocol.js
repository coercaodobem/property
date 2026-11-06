export const PROTOCOL = "property-chess";
export const VERSION = 1;
/** One message, serialized as UTF-8 JSON. Half the 32 KiB `paired-app` data cap, so there is room to spare. */
export const MAX_MESSAGE_BYTES = 16 * 1024;
/** Longest game kept and synced: 2000 plies of at most 5 bytes is about 12 KiB in a sync. Reaching it ends the game drawn. */
export const MAX_PLIES = 2000;
/** Game ids a seek may give up: the sender's current game and the one the peer showed it. */
export const MAX_ABANDON = 2;
const HEX64 = /^[0-9a-f]{64}$/;
const GAME_ID = /^[0-9a-f]{16}$/;
export const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
/** UTF-8 bytes of a value as JSON, or Infinity when it cannot be serialized. */
export function jsonBytes(value) {
    try {
        const text = JSON.stringify(value);
        return text === undefined ? Infinity : new TextEncoder().encode(text).length;
    }
    catch {
        return Infinity;
    }
}
/** The wire form of a message. Throws when it would break the size cap, which only a bug can do. */
export function encodeMessage(message) {
    const { k, ...fields } = message;
    const wire = { p: PROTOCOL, v: VERSION, k, ...fields };
    if (message.k === "sync")
        wire.m = message.m.join(" ");
    if (jsonBytes(wire) > MAX_MESSAGE_BYTES)
        throw new Error(`chess: a ${k} message is over ${MAX_MESSAGE_BYTES} bytes`);
    return wire;
}
const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const isColour = (v) => v === "w" || v === "b";
function parseEnd(v) {
    if (!isObject(v))
        return null;
    if (v.why === "resign" && isColour(v.by))
        return { why: "resign", by: v.by };
    if (v.why === "agreed")
        return { why: "agreed" };
    return null;
}
/** A peer's message, checked. Never throws. */
export function parseMessage(value) {
    if (jsonBytes(value) > MAX_MESSAGE_BYTES)
        return { ok: false, reason: "too-big" };
    const bad = { ok: false, reason: "malformed" };
    if (!isObject(value) || value.p !== PROTOCOL || !Number.isInteger(value.v))
        return bad;
    if (value.v > VERSION)
        return { ok: false, reason: "newer-version" };
    if (value.v !== VERSION)
        return bad;
    const v = value;
    switch (v.k) {
        case "seek": {
            if (typeof v.c !== "string" || !HEX64.test(v.c))
                return bad;
            if (!Array.isArray(v.a) || v.a.length > MAX_ABANDON || !v.a.every((g) => typeof g === "string" && GAME_ID.test(g)))
                return bad;
            return { ok: true, message: { k: "seek", c: v.c, a: [...v.a] } };
        }
        case "reveal": {
            if (typeof v.s !== "string" || !HEX64.test(v.s) || typeof v.c !== "string" || !HEX64.test(v.c))
                return bad;
            return { ok: true, message: { k: "reveal", s: v.s, c: v.c } };
        }
        case "move": {
            if (typeof v.g !== "string" || !GAME_ID.test(v.g))
                return bad;
            if (!Number.isInteger(v.n) || v.n < 0 || v.n >= MAX_PLIES)
                return bad;
            if (typeof v.m !== "string" || !UCI.test(v.m))
                return bad;
            return { ok: true, message: { k: "move", g: v.g, n: v.n, m: v.m } };
        }
        case "sync": {
            if (typeof v.g !== "string" || !GAME_ID.test(v.g))
                return bad;
            if (!Array.isArray(v.s) || v.s.length !== 2 || !v.s.every((s) => typeof s === "string" && HEX64.test(s)))
                return bad;
            if (typeof v.m !== "string")
                return bad;
            const moves = v.m === "" ? [] : v.m.split(" ");
            if (moves.length > MAX_PLIES || !moves.every((m) => UCI.test(m)))
                return bad;
            let end;
            if (v.x !== undefined) {
                const parsed = parseEnd(v.x);
                if (!parsed)
                    return bad;
                end = parsed;
            }
            const message = { k: "sync", g: v.g, s: [v.s[0], v.s[1]], m: moves };
            if (end)
                message.x = end;
            return { ok: true, message };
        }
        case "resign": {
            if (typeof v.g !== "string" || !GAME_ID.test(v.g))
                return bad;
            return { ok: true, message: { k: "resign", g: v.g } };
        }
        case "draw": {
            if (typeof v.g !== "string" || !GAME_ID.test(v.g))
                return bad;
            if (v.o !== "offer" && v.o !== "accept" && v.o !== "decline")
                return bad;
            return { ok: true, message: { k: "draw", g: v.g, o: v.o } };
        }
        default:
            return bad;
    }
}
