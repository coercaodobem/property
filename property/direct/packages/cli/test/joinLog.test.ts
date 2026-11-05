import { afterEach, describe, expect, it } from "vitest";
import { setJoinTraceSink, traceJoin } from "@ghostly/browser/engine/joinTrace";
import { joinLogLine } from "../src/joinLog";
// covers: groups.link.join

// A join through a group's link stalled with nothing in the admin daemon's log: no line for the knock, none for the
// entry session (2026-10-16). Its steps are said there now, as the engine traces them.
describe("a daemon's log of joins through a group's link", () => {
  afterEach(() => { setJoinTraceSink(null); });
  const G = "AAAAAAAAAAAAAAAAAAAAAA";

  it("says the knock, the entry session and the welcome, on either side", () => {
    const lines: string[] = [];
    setJoinTraceSink((line) => { const said = joinLogLine(line); if (said) lines.push(said); });
    traceJoin(G, "knocks.read", { ms: 40, knocks: 1 });
    traceJoin(G, "knock.seen", { age: 900 });
    traceJoin(G, "link.start", { role: "host" });
    traceJoin(G, "link.packet", { role: "host", packetAt: 1 });
    traceJoin(G, "link.presence", { role: "host" });
    traceJoin(G, "link.offering", { role: "host" });
    traceJoin(G, "link.native", { role: "host" });
    traceJoin(G, "link.open", { role: "host" });
    traceJoin(G, "invite.sent");
    traceJoin(G, "welcome.sent");
    traceJoin(G, "invite.received");
    traceJoin(G, "welcome.received");
    expect(lines.map((line) => line.replace(/ at \S+$/, ""))).toEqual([
      `property: group ${G}: a knock seen: opening an entry session`,
      `property: group ${G}: entry session starting (letting in)`,
      `property: group ${G}: entry session: the other side's packet seen (letting in)`,
      `property: group ${G}: entry session: offering a connection (letting in)`,
      `property: group ${G}: entry session: WebRTC connected nothing, going on over a native transport (letting in)`,
      `property: group ${G}: entry session open (letting in)`,
      `property: group ${G}: invitation sent on the entry session`,
      `property: group ${G}: welcome sent`,
      `property: group ${G}: invitation received on the entry session: accepting`,
      `property: group ${G}: welcome received: in the group`,
    ]);
    expect(lines[0]).toMatch(/ at \d{4}-\d\d-\d\dT[\d:.]+Z$/);
  });

  it("leaves out an edge's own steps and what is not a trace line", () => {
    expect(joinLogLine(JSON.stringify({ t: 1, g: G, step: "link.open", role: "edge" }))).toBeNull();
    expect(joinLogLine(JSON.stringify({ t: 1, g: G, step: "link.start", role: "guest" }))).toBe(`property: group ${G}: entry session starting (joining) at 1970-01-01T00:00:00.001Z`);
    expect(joinLogLine(JSON.stringify({ t: 1, g: G, step: "toString" }))).toBeNull();
    expect(joinLogLine("not json")).toBeNull();
  });
});
