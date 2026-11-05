import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { error, property, home, ok } from "./support/cli";

// covers: headless.cli

/**
 * A `~` the shell left alone (`--home=~/bots`, a quoted `PROPERTY_HOME="~/bot"`, a unit file's `Environment=` line) is
 * the user's home, as the shell would have read it. It was a folder named `~` in the current one: a new profile with
 * fresh keys there, exit 0 and no word. `~user/…` is a usage error, never a guess.
 */
describe("a path that starts with ~", { timeout: 60_000 }, () => {
  it("is in the user's home, never a folder named ~ in the current one", async () => {
    const user = home("tilde-home"), cwd = home("tilde-cwd");
    const env = { HOME: user, PROPERTY_HOME: "" };
    ok(await property(["--home=~/bots", "profile", "create", "bot"], { env, cwd }));
    ok(await property(["profile", "create", "bot"], { env: { ...env, PROPERTY_HOME: "~/bot" }, cwd }));
    ok(await property(["--home", "~", "profile", "create", "bot"], { env, cwd }));
    expect(existsSync(join(user, "bots", "profiles", "bot"))).toBe(true);
    expect(existsSync(join(user, "bot", "profiles", "bot"))).toBe(true);
    expect(existsSync(join(user, "profiles", "bot"))).toBe(true);
    // A path option as well: the backup's file, and the passphrase file read with it.
    writeFileSync(join(user, "pass"), "a passphrase of twelve\n");
    ok(await property(["--home=~/bots", "-p", "bot", "profile", "backup", "--out=~/bk.backup", "--passphrase-file=~/pass"], { env, cwd }));
    expect(existsSync(join(user, "bk.backup"))).toBe(true);
    ok(await property(["--home=~/bots", "profile", "restore", "~/bk.backup", "copy", "--passphrase-file=~/pass"], { env, cwd }));
    expect(existsSync(join(user, "bots", "profiles", "copy"))).toBe(true);
    expect(readdirSync(cwd)).toEqual([]);
  });

  // agents#1603: the publisher tools resolved their paths raw: the one publisher key was written to <cwd>/~/pub.key.
  it("is in the user's home for the publisher tools too: app init, publish (its key), verify, store sign", async () => {
    const user = home("tilde-publish"), cwd = home("tilde-publish-cwd");
    const env = { HOME: user, PROPERTY_HOME: "" };
    expect(ok(await property(["app", "init", "~/myapp"], { env, cwd })).dir).toBe(join(user, "myapp"));
    ok(await property(["app", "publish", "~/myapp", "--key=~/pub.key"], { env, cwd }));
    expect(existsSync(join(user, "pub.key"))).toBe(true);
    expect(existsSync(join(user, "myapp", "app.ghostlyapp"))).toBe(true);
    ok(await property(["app", "verify", "~/myapp/app.ghostlyapp"], { env, cwd }));
    expect(error(await property(["app", "verify", "~/nope.ghostlyapp"], { env, cwd }), "not_found", 3).message).toContain(join(user, "nope.ghostlyapp"));
    // store sign's key: made in the home, whatever the index then says.
    writeFileSync(join(user, "index.json"), "{}");
    await property(["store", "sign", "~/index.json", "--key=~/store.key"], { env, cwd });
    expect(existsSync(join(user, "store.key"))).toBe(true);
    expect(readdirSync(cwd)).toEqual([]);
  });

  it("of another user is a usage error", async () => {
    const user = home("tilde-other"), cwd = home("tilde-other-cwd");
    const env = { HOME: user, PROPERTY_HOME: "" };
    expect(error(await property(["--home=~bob/bots", "profile", "list"], { env, cwd }), "usage", 2).message).toBe("~bob/bots: ~user is not read here: write the folder in full");
    expect(error(await property(["profile", "list"], { env: { ...env, PROPERTY_HOME: "~bob" }, cwd }), "usage", 2).message).toBe("~bob: ~user is not read here: write the folder in full");
    expect(readdirSync(cwd)).toEqual([]);
  });

  // agents#1604: since #3218 every name that starts with ~ was refused as "~user", a real ~notes.txt too.
  it("that is a file's own name (~notes.txt, Office's ~$report.docx) is that file here", async () => {
    const user = home("tilde-name"), cwd = home("tilde-name-cwd");
    const env = { HOME: user, PROPERTY_HOME: "" };
    ok(await property(["--home=~/bots", "profile", "create", "bot"], { env, cwd }));
    writeFileSync(join(cwd, "~notes.txt"), "not a picture");
    // Read as the file it is: refused for what it holds, not for its name.
    expect(error(await property(["--home=~/bots", "-p", "bot", "profile", "picture", "~notes.txt"], { env, cwd }), "bad_request", 1).message).not.toMatch(/~user/);
    // One not there yet is a file of this folder too; ~user/… not there is still refused.
    const missing = await property(["--home=~/bots", "-p", "bot", "profile", "picture", "~$report.jpg"], { env, cwd });
    expect(missing.code).not.toBe(2);
    expect(missing.stdout).not.toMatch(/~user/);
    expect(error(await property(["--home=~/bots", "-p", "bot", "profile", "picture", "~bob/x.jpg"], { env, cwd }), "usage", 2).message).toBe("~bob/x.jpg: ~user is not read here: write the path in full");
  });
});
