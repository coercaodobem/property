import { invoke } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import type { Update } from "@tauri-apps/plugin-updater";
import type { UpdateSource } from "@ghostly/browser/host";
import { RELEASES_URL } from "../lib/settings";
import { androidApp } from "../lib/touchOnly";

/**
 * Desktop: Tauri's updater, against the signed `latest.json` of the newest
 * release. Only an install the updater can replace gets the button — on Linux
 * that is the AppImage, and `.deb` and `.rpm` belong to the package manager
 * that put them there, so those are sent to the download.
 *
 * Property has not published an Android update feed or APK. Android therefore
 * receives no release check until a Property-owned release flow exists.
 *
 * This lives with the host rather than in `/src/lib`, because every client
 * builds `/src` and the browsers have no Tauri to call into.
 */
export const desktopUpdates: UpdateSource = {
  downloadUrl: RELEASES_URL,

  async check() {
    if (androidApp()) {
      throw new Error("Property has not published an Android update feed yet");
    }
    const update = await check();
    if (!update) return null;
    const installable = await invoke<boolean>("updater_can_install").catch(() => false);
    return {
      version: update.version,
      notes: update.body || undefined,
      apply: installable ? "restart" : "manual",
      handle: update,
    };
  },

  async install(update, onProgress) {
    const handle = update.handle as Update | null;
    if (!handle) throw new Error("That update is no longer available");

    let contentLength = 0;
    let downloaded = 0;
    await handle.downloadAndInstall((event) => {
      if (event.event === "Started") contentLength = event.data.contentLength ?? 0;
      else if (event.event === "Progress") {
        downloaded += event.data.chunkLength;
        if (contentLength) onProgress?.(Math.min(downloaded / contentLength, 1));
      } else if (event.event === "Finished") onProgress?.(1);
    });
    // The peer and every call it holds end here; the user asked for that.
    await relaunch();
  },
};
