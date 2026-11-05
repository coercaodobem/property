import type { UpdateSource } from "@ghostly/browser/host";
import { RELEASES_URL } from "../../ui/src/lib/settings";

/** Set by the service worker when Chrome has a version ready. Gone when the browser closes. */
const PENDING_KEY = "ghostly_pending_update";

/**
 * Whether Chrome keeps this install up to date. It does for one from the Web
 * Store or a hosted `.crx`, and the manifest it hands back says so. An unpacked
 * folder is nobody's job but the user's: Chrome never updates it. Property has
 * not published an extension release feed, so an unpacked build does not
 * query Ghostly's service or pretend a Property update is available.
 */
function managedByChrome(): boolean {
  return !!chrome.runtime.getManifest().update_url;
}

/** The service worker heard Chrome hold an update back because Property Direct is running. */
export async function rememberPendingUpdate(version: string): Promise<void> {
  await chrome.storage.session.set({ [PENDING_KEY]: version });
}

async function pendingUpdate(): Promise<string | null> {
  try {
    const stored = (await chrome.storage.session.get(PENDING_KEY))[PENDING_KEY];
    return typeof stored === "string" ? stored : null;
  } catch {
    return null;
  }
}

export const extensionUpdates: UpdateSource = {
  downloadUrl: RELEASES_URL,

  async check() {
    if (!managedByChrome()) {
      // No Property extension feed exists yet. Never query the upstream Ghostly service or claim to be current.
      throw new Error("Property has not published an extension update feed yet");
    }

    const held = await pendingUpdate();
    if (held) return { version: held, apply: "restart" };

    // Chrome throttles this to a few an hour and answers from its own schedule.
    const result = await chrome.runtime.requestUpdateCheck();
    return result.status === "update_available" && result.version
      ? { version: result.version, apply: "restart" }
      : null;
  },

  /**
   * Chrome swaps the new version in when the extension stops running, which is
   * what this does. Every Property Direct page goes with it, so it only ever runs
   * because the user pressed the button, and the new version opens those pages
   * again (`takePagesToReopen`): "restart" must not read as a crash.
   */
  async install() {
    await chrome.storage.local.set({ [REOPEN_KEY]: await openAppPages() }).catch(() => {});
    chrome.runtime.reload();
  },
};

/**
 * The app's pages open when the person pressed "Update and restart". In `storage.local`, because a reload empties
 * `storage.session`; taken once, by the new version's worker.
 */
const REOPEN_KEY = "ghostly_reopen_after_update";

const appUrl = () => chrome.runtime.getURL("app.html");

/** Every tab showing the app, at its page (`app.html#/chat/…`); the extension sees its own tabs without `tabs`. */
async function openAppPages(): Promise<string[]> {
  try {
    const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.TAB] });
    return contexts.map((context) => context.documentUrl ?? "").filter((url) => url.split("#")[0] === appUrl());
  } catch {
    return [];
  }
}

/**
 * The pages to open after an update the person asked for: the ones that were open, or the app once if none was
 * found. Nothing when the update came by itself (the browser restarted, or Chrome swapped it in while idle).
 * Only the app's own pages ever come out, whatever the storage holds.
 */
export async function takePagesToReopen(): Promise<string[]> {
  const stored = (await chrome.storage.local.get(REOPEN_KEY))[REOPEN_KEY];
  if (stored === undefined) return [];
  await chrome.storage.local.remove(REOPEN_KEY);
  const pages = Array.isArray(stored) ? stored.filter((url): url is string => typeof url === "string" && url.split("#")[0] === appUrl()) : [];
  return pages.length ? [...new Set(pages)] : [appUrl()];
}
