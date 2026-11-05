import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LockScreenProvider, useLockScreen } from "../../contexts/LockScreenContext";
import { useSettings } from "../../contexts/SettingsContext";
import { handOverUnlock } from "../../lib/lockHandover";
import { activeProfileId } from "../../lib/profiles";
import { renderApp } from "../render";

// covers: settings.lock.now

const KEY = "ghostly_app_settings";

/** One open app tab: other tabs may update its settings while it remains mounted. */
function Tab({ tab }: { tab: string }) {
  const { isLocked, lock } = useLockScreen();
  const { settings, updateLockScreen, updateNotifications } = useSettings();
  return (
    <>
      <button data-testid={`lock-${tab}`} data-hash={settings.lockScreen.passwordHash ?? ""} onClick={lock}>{String(isLocked)}</button>
      <button data-testid={`password-${tab}`} onClick={() => updateLockScreen({ enabled: true, passwordHash: "new" })} />
      <button data-testid={`sounds-${tab}`} onClick={() => updateNotifications({ soundEnabled: !settings.notifications.soundEnabled })} />
    </>
  );
}

function openTab(tab: string) {
  const current = JSON.parse(localStorage.getItem(KEY) ?? "{}") as { lockScreen?: { passwordHash?: string | null } };
  handOverUnlock(activeProfileId(), current.lockScreen?.passwordHash ?? "");
  renderApp(<LockScreenProvider><Tab tab={tab} /></LockScreenProvider>);
  expect(screen.getByTestId(`lock-${tab}`).textContent).toBe("false");
}

const stored = () => JSON.parse(localStorage.getItem(KEY) ?? "{}") as {
  lockScreen?: { enabled?: boolean; passwordHash?: string | null };
  notifications?: { soundEnabled?: boolean };
};
const click = (id: string) => act(() => { fireEvent.click(screen.getByTestId(id)); });
const otherTabSaved = () => act(() => { window.dispatchEvent(new StorageEvent("storage", { key: KEY, newValue: localStorage.getItem(KEY) })); });

describe("the lock with Property open in two tabs", () => {
  afterEach(() => { localStorage.clear(); sessionStorage.clear(); });

  it("Lock Now locks a tab opened before a password was set", async () => {
    openTab("a");
    openTab("b");
    click("password-a");
    expect(stored().lockScreen).toMatchObject({ enabled: true, passwordHash: "new" });
    click("lock-a");
    expect(screen.getByTestId("lock-a").textContent).toBe("true");
    await waitFor(() => expect(screen.getByTestId("lock-b").textContent).toBe("true"));
  });

  it("a stale tab saving another setting keeps the new password", () => {
    openTab("a");
    openTab("b");
    click("password-a");
    click("sounds-b");
    expect(stored().notifications?.soundEnabled).toBe(false);
    expect(stored().lockScreen).toMatchObject({ enabled: true, passwordHash: "new" });
  });

  it("a changed password is not restored from a stale tab's settings", () => {
    localStorage.setItem(KEY, JSON.stringify({ lockScreen: { enabled: true, passwordHash: "old", timeoutMinutes: 5 } }));
    openTab("b");
    localStorage.setItem(KEY, JSON.stringify({ lockScreen: { enabled: true, passwordHash: "changed", timeoutMinutes: 5 } }));
    click("sounds-b");
    expect(stored().lockScreen?.passwordHash).toBe("changed");
  });

  it("reads a lock password set in another tab when its storage event arrives", () => {
    openTab("b");
    localStorage.setItem(KEY, JSON.stringify({ lockScreen: { enabled: true, passwordHash: "new", timeoutMinutes: 5 } }));
    otherTabSaved();
    expect(screen.getByTestId("lock-b").getAttribute("data-hash")).toBe("new");
  });
});
