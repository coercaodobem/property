import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LockScreenProvider, useLockScreen } from "../../contexts/LockScreenContext";
import { renderApp } from "../render";

// covers: profiles.lock

const check = vi.hoisted(() => ({
  calls: 0,
  started: null as null | (() => void),
  wait: null as null | Promise<void>,
}));
vi.mock("../../lib/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/settings")>()),
  needsRehash: () => false,
  verifyPassword: async (password: string) => {
    check.calls++;
    check.started?.();
    if (check.wait) await check.wait;
    return password === "right";
  },
}));

const SETTINGS_KEY = "ghostly_app_settings";
const ATTEMPTS_KEY = "ghostly_lock_attempts";
const NOW = 1_000_000;
type Unlock = (password: string) => Promise<boolean>;

/** One locked app tab; each returned function attempts its lock independently. */
function openTab(): Unlock {
  const tab: { unlock?: Unlock } = {};
  function Probe() {
    tab.unlock = useLockScreen().unlock;
    return null;
  }
  renderApp(<LockScreenProvider><Probe /></LockScreenProvider>);
  return (password) => tab.unlock!(password);
}

function queueBrowserLocks() {
  let queue = Promise.resolve();
  const names: string[] = [];
  const request = (name: string, run: () => Promise<unknown>) => {
    names.push(name);
    const turn = queue.then(run);
    queue = turn.then(() => {}, () => {});
    return turn;
  };
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request } });
  return names;
}

describe("concurrent password attempts in several Property tabs", () => {
  beforeEach(() => {
    check.calls = 0;
    check.started = null;
    check.wait = null;
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ lockScreen: { enabled: true, passwordHash: "x", timeoutMinutes: 5 } }));
  });
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    Reflect.deleteProperty(navigator, "locks");
    vi.restoreAllMocks();
  });

  it("serializes three simultaneous tries and records each rejected attempt", async () => {
    const names = queueBrowserLocks();
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify({ failures: 10, retryAt: NOW - 1 }));
    let announceCheck!: () => void;
    let finishCheck!: () => void;
    const started = new Promise<void>((resolve) => { announceCheck = resolve; });
    check.started = announceCheck;
    check.wait = new Promise<void>((resolve) => { finishCheck = resolve; });

    const tabs = [openTab(), openTab(), openTab()];
    let pending!: Promise<boolean[]>;
    await act(async () => {
      pending = Promise.all(tabs.map((unlock) => unlock("wrong")));
      await started;
    });
    expect(check.calls).toBe(1);
    finishCheck();
    let results!: boolean[];
    await act(async () => { results = await pending; });

    expect(results).toEqual([false, false, false]);
    expect(names).toEqual(["ghostly-unlock", "ghostly-unlock", "ghostly-unlock"]);
    expect(check.calls).toBe(1);
    expect(JSON.parse(localStorage.getItem(ATTEMPTS_KEY) ?? "{}")).toEqual({ failures: 11, retryAt: NOW + 256_000 });
  });

  it("a correct password clears the recorded failures", async () => {
    queueBrowserLocks();
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify({ failures: 1, retryAt: 0 }));
    const unlock = openTab();
    let result = false;
    await act(async () => { result = await unlock("right"); });
    expect(result).toBe(true);
    expect(check.calls).toBe(1);
    expect(localStorage.getItem(ATTEMPTS_KEY)).toBeNull();
  });
});
