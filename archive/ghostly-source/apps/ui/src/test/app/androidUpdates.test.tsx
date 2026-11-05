import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserHost } from "@ghostly/browser/host";
import { LockScreenProvider } from "../../contexts/LockScreenContext";
import { UpdateProvider } from "../../contexts/UpdateContext";
import { desktopUpdates } from "../../desktop/updates";
import { saveSettings, loadSettings } from "../../lib/settings";
import { Settings } from "../../pages/Settings";
import { fakeEngine } from "../fakeEngine";
import { renderApp } from "../render";

// covers: app.updates.desktop

/*
 * The Android app has no Tauri updater (it is granted on Desktop only), so a check there that asked for one failed
 * every time with "Command plugin:updater|check not allowed by ACL". Property has no Android release feed yet, so it
 * must not ask the Tauri updater or query an upstream Ghostly URL.
 */

// `@tauri-apps/api/core` and `/app` are one stub in this config: mocked once, with both.
const tauri = vi.hoisted(() => ({
  invoke: vi.fn(async (command: string): Promise<unknown> => {
    if (command === "updater_can_install") return true;
    throw new Error(`Command ${command} not allowed by ACL`);
  }),
  getVersion: vi.fn(async () => "1.5.4"),
}));
const updater = vi.hoisted(() => ({
  check: vi.fn(async (): Promise<unknown> => {
    await tauri.invoke("plugin:updater|check");
    return null;
  }),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: tauri.invoke, getVersion: tauri.getVersion, getIdentifier: async () => "tools.ghostly.app", listen: async () => () => {} }));
vi.mock("@tauri-apps/plugin-updater", () => updater);
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));

const ANDROID_AGENT = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const realAgent = navigator.userAgent;

function feed(version: string) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ version }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function asAndroid() {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  Object.defineProperty(navigator, "userAgent", { value: ANDROID_AGENT, configurable: true });
}

beforeEach(() => {
  tauri.invoke.mockClear();
  updater.check.mockClear();
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  Object.defineProperty(navigator, "userAgent", { value: realAgent, configurable: true });
  vi.unstubAllGlobals();
});

describe("the Android app's update check", () => {
  it("reports that no Android feed is published without querying Ghostly", async () => {
    asAndroid();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(desktopUpdates.check()).rejects.toThrow("Property has not published an Android update feed yet");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updater.check).not.toHaveBeenCalled();
    expect(tauri.invoke).not.toHaveBeenCalledWith("plugin:updater|check");
  });

  it("does not query a feed or claim the unpublished Android build is up to date", async () => {
    asAndroid();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(desktopUpdates.check()).rejects.toThrow("Property has not published an Android update feed yet");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updater.check).not.toHaveBeenCalled();
    expect(tauri.invoke).not.toHaveBeenCalled();
  });

});

describe("the Desktop app's update check", () => {
  it("still asks Tauri's updater, and nothing else", async () => {
    const fetchMock = feed("9.9.9");
    const handle = { version: "1.6.0", body: "Notes" };
    updater.check.mockResolvedValueOnce(handle);
    expect(await desktopUpdates.check()).toEqual({ version: "1.6.0", notes: "Notes", apply: "restart", handle });
    expect(updater.check).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Settings → Updates in the Android app", () => {
  afterEach(() => { delete (fakeEngine as BrowserHost).updates; });

  function renderSettings() {
    (fakeEngine as BrowserHost).updates = desktopUpdates;
    saveSettings({ ...loadSettings(), checkForUpdates: false });
    return renderApp(
      <LockScreenProvider>
        <UpdateProvider>
          <Routes><Route path="/settings" element={<Settings />} /></Routes>
        </UpdateProvider>
      </LockScreenProvider>,
      { route: "/settings" },
    );
  }

  it("reports that no Android update feed is published", async () => {
    asAndroid();
    const { user } = renderSettings();
    await user.click(screen.getByRole("button", { name: "Check now" }));
    expect(await screen.findByText("Could not check for updates")).toBeInTheDocument();
    expect(screen.queryByText("Property is up to date")).toBeNull();
  });
});
