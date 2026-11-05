import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { irohRelays, publicStun, withoutPublicStun } from "../src/runtime/engine";
import { property, home, ok, Running } from "./support/cli";
import { isolatedNetworkEnv, PUBLIC_NET_OPT_IN, publicNetworkIn, testNetworkEnv } from "./support/network";
// covers: headless.daemon

/**
 * A test's `property` stays on this machine: no public Pkarr relay, Mainline DHT, HyperDHT bootstrap, Iroh relay or STUN
 * server, unless the run opts in (PROPERTY_TEST_PUBLIC_NET=1). Each case sets the opt-in itself, off or on, so a shell
 * or a CI job that opts in does not change what it checks.
 */
const OFF = { [PUBLIC_NET_OPT_IN]: "0" };
const ON = { [PUBLIC_NET_OPT_IN]: "1" };

describe("a test's network", () => {
  it("is loopback or nowhere by default, for every network the CLI reaches", () => {
    const env = isolatedNetworkEnv(OFF);
    expect(publicNetworkIn(env)).toEqual([]);
    expect(env).toMatchObject({ PROPERTY_DHT: "0", PROPERTY_STUN: "0", PROPERTY_HYPERDHT_BOOTSTRAP: "127.0.0.1:9", PROPERTY_PKARR_RELAYS: "http://127.0.0.1:9", PROPERTY_IROH_RELAYS: "http://127.0.0.1:9" });
    // The e2e infra's Iroh relay, when the shell has it.
    expect(isolatedNetworkEnv({ ...OFF, PROPERTY_IROH_RELAY_URL: "http://127.0.0.1:47085" }).PROPERTY_IROH_RELAYS).toBe("http://127.0.0.1:47085");
  });

  it("names each public network a test's environment would reach", () => {
    expect(publicNetworkIn({})).toHaveLength(5);
    const base = isolatedNetworkEnv(OFF);
    expect(publicNetworkIn({ ...base, PROPERTY_PKARR_RELAYS: "http://127.0.0.1:4000,https://pkarr.pubky.app" })).toEqual(["Pkarr relay https://pkarr.pubky.app"]);
    expect(publicNetworkIn({ ...base, PROPERTY_IROH_RELAYS: "https://use1-1.relay.n0.iroh.link/" })).toEqual(["Iroh relay https://use1-1.relay.n0.iroh.link/"]);
    expect(publicNetworkIn({ ...base, PROPERTY_HYPERDHT_BOOTSTRAP: "node1.hyperdht.org:49737" })).toEqual(["HyperDHT node node1.hyperdht.org:49737"]);
    expect(publicNetworkIn({ ...base, PROPERTY_DHT: "1", PROPERTY_DHT_BOOTSTRAP: "router.bittorrent.com:6881" })).toEqual(["Mainline DHT node router.bittorrent.com:6881"]);
    expect(publicNetworkIn({ ...base, PROPERTY_STUN: "1" })).toEqual(["WebRTC: the apps' public STUN servers (no PROPERTY_STUN=0)"]);
    // Loopback testnets and relays are fine; so is WebRTC off, STUN and all.
    expect(publicNetworkIn({ ...base, PROPERTY_DHT: "1", PROPERTY_DHT_BOOTSTRAP: "127.0.0.1:6881", PROPERTY_HYPERDHT_BOOTSTRAP: "localhost:1,127.0.0.1:2" })).toEqual([]);
    expect(publicNetworkIn({ ...base, PROPERTY_STUN: undefined, PROPERTY_WEBRTC: "0" })).toEqual([]);
  });

  it("refuses a test's own environment that reaches a public network, unless the run opts in", () => {
    expect(() => testNetworkEnv(OFF, { PROPERTY_PKARR_RELAYS: "https://relay.pkarr.org" })).toThrow(/public network[\s\S]*Pkarr relay https:\/\/relay\.pkarr\.org/);
    expect(() => testNetworkEnv(OFF, { PROPERTY_STUN: undefined })).toThrow(/STUN/);
    expect(testNetworkEnv(OFF, { PROPERTY_PKARR_RELAYS: "http://127.0.0.1:4000" })).toMatchObject({ PROPERTY_PKARR_RELAYS: "http://127.0.0.1:4000", PROPERTY_STUN: "0" });
    // Opted in: the app's own networks (the Mainline DHT still off).
    const open = testNetworkEnv(ON, { PROPERTY_PKARR_RELAYS: undefined, PROPERTY_HYPERDHT_BOOTSTRAP: undefined, PROPERTY_IROH_RELAYS: undefined, PROPERTY_STUN: undefined });
    expect(open.PROPERTY_DHT).toBe("0");
    expect(publicNetworkIn(open).length).toBeGreaterThan(0);
  });
});

describe("the CLI's knobs for a private network", () => {
  it("PROPERTY_IROH_RELAYS: the only Iroh relays, https or http on loopback", () => {
    expect(irohRelays({})).toBeNull();
    expect(irohRelays({ PROPERTY_IROH_RELAYS: " http://127.0.0.1:4020 , https://iroh.lan/ ," })).toEqual(["http://127.0.0.1:4020", "https://iroh.lan/"]);
    expect(() => irohRelays({ PROPERTY_IROH_RELAYS: "http://iroh.lan" })).toThrow(expect.objectContaining({ code: "usage", message: expect.stringMatching(/PROPERTY_IROH_RELAYS: Use an https:\/\/ relay/) }));
    // The Iroh endpoint takes five at most: a sixth left the profile with no Iroh at all, each chat's endpoint refused.
    const relays = (n: number) => Array.from({ length: n }, (_, i) => `https://iroh${i}.lan/`).join(",");
    expect(irohRelays({ PROPERTY_IROH_RELAYS: relays(5) })).toHaveLength(5);
    expect(() => irohRelays({ PROPERTY_IROH_RELAYS: relays(6) })).toThrow(expect.objectContaining({ code: "usage", message: "PROPERTY_IROH_RELAYS: use at most 5 Iroh relays, not 6" }));
  });

  it("PROPERTY_STUN=0: the apps' public STUN servers out, the profile's own kept", () => {
    expect(publicStun({})).toBe(true);
    expect(publicStun({ PROPERTY_STUN: "0" })).toBe(false);
    const config = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: ["stun:stun1.l.google.com:19302", "stun:127.0.0.1:3478"] }, { urls: "turn:turn.lan", username: "u", credential: "p" }] };
    expect(withoutPublicStun(config)?.iceServers).toEqual([{ urls: ["stun:127.0.0.1:3478"] }, { urls: ["turn:turn.lan"], username: "u", credential: "p" }]);
    expect(withoutPublicStun(undefined)).toBeUndefined();
  });
});

describe("a daemon the helpers start", { timeout: 60_000 }, () => {
  const dir = home("isolated");
  let daemon: Running;
  beforeAll(() => { daemon = new Running(["--home", dir, "daemon"], OFF); });
  afterAll(() => daemon?.stop());

  it("homes Pkarr and Iroh on loopback only", async () => {
    await daemon.waitFor((line) => line.daemon === "ready");
    const state = ok(await property(["--home", dir, "engine", "getState"], { env: OFF })) as { transport: { relays: string[]; iroh?: { relays: string[] } } };
    const hosts = [...state.transport.relays, ...(state.transport.iroh?.relays ?? [])].map((url) => new URL(url).hostname);
    expect(state.transport.iroh?.relays.length).toBeGreaterThan(0);
    expect(hosts.length).toBeGreaterThan(1);
    expect(hosts.filter((host) => !["127.0.0.1", "localhost", "[::1]"].includes(host))).toEqual([]);
  });
});
