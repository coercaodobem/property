import { describe, expect, it } from "vitest";
import { envSwitch } from "../src/envSwitch";
import { callIceServers } from "../src/calls/media";
import { mainlineNetwork, publicStun } from "../src/runtime/engine";
import { error, property, home } from "./support/cli";
// covers: headless.daemon

/**
 * agents#1756: PROPERTY_DHT, PROPERTY_STUN, PROPERTY_WEBRTC and PROPERTY_HUB turned off only for the exact "0":
 * `PROPERTY_DHT=false` kept the profile on the public Mainline DHT, `PROPERTY_STUN=off` kept asking Google's STUN
 * servers, with exit 0 and no word.
 */
describe("an on/off environment switch", () => {
  it("takes the usual spellings of off and on, in any case and trimmed, and the default when unset or empty", () => {
    for (const off of ["0", "false", "off", "no", "FALSE", "Off", " 0", "no\n"]) expect(envSwitch("PROPERTY_DHT", true, { PROPERTY_DHT: off }), JSON.stringify(off)).toBe(false);
    for (const on of ["1", "true", "on", "yes", "TRUE", " yes "]) expect(envSwitch("PROPERTY_DHT", false, { PROPERTY_DHT: on }), JSON.stringify(on)).toBe(true);
    expect(envSwitch("PROPERTY_DHT", true, {})).toBe(true);
    expect(envSwitch("PROPERTY_DHT", true, { PROPERTY_DHT: "" })).toBe(true);
    expect(envSwitch("PROPERTY_HUB", false, { PROPERTY_HUB: "  " })).toBe(false);
  });

  it("refuses anything else as a usage error naming the variable, never failing open", () => {
    for (const bad of ["maybe", "2", "nope", "0 1"]) expect(() => envSwitch("PROPERTY_STUN", true, { PROPERTY_STUN: bad })).toThrow(`PROPERTY_STUN takes 0 or 1 (or false/true, off/on, no/yes), not ${JSON.stringify(bad)}`);
  });

  it("turns the DHT and the public STUN servers off for every spelling of off", () => {
    for (const off of ["0", "false", "off", "no", " 0"]) {
      expect(mainlineNetwork({ PROPERTY_DHT: off }), off).toEqual({ off: true });
      expect(publicStun({ PROPERTY_STUN: off }), off).toBe(false);
      expect(callIceServers([], { PROPERTY_STUN: off }), off).toEqual([]);
    }
    expect(mainlineNetwork({ PROPERTY_DHT: "yes" })).toEqual({ off: false });
    expect(() => mainlineNetwork({ PROPERTY_DHT: "maybe" })).toThrow("PROPERTY_DHT takes 0 or 1");
  });

  it("a bad value stops the command with a usage error (exit 2), before anything reaches the network", async () => {
    const result = await property(["--home", home("envswitch"), "status"], { env: { PROPERTY_DHT: "maybe" } });
    expect(error(result, "usage", 2).message).toContain("PROPERTY_DHT takes 0 or 1");
  }, 60_000);
});
