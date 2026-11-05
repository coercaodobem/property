import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { property } from "./support/cli";
// covers: headless.cli

/*
 * What an AI agent is taught (the CLI skills and the local Property Direct guides)
 * names only commands and flags this CLI has: an agent runs them as written. Every `property <command>` in a code block,
 * an inline code span or the prompt is looked up in `property help`, and each `--flag` after it in that command's help.
 * A secret (an invite, a group's link, a token) comes on stdin: as an argument the CLI warns that it shows in `ps`.
 */

const ROOT = resolve(import.meta.dirname, "../../..");
const DOCS = ["packages/cli/README.md", "packages/cli/SKILL.md", "packages/cli/skills/property/SKILL.md", "docs/AI-AGENTS.md", "docs/CLI.md"];
const GLOBAL = ["--profile", "--home", "--pretty", "--help", "--version"];
const WORD = /^[a-z][a-z-]*$/;
/** Commands whose secret shows in `ps` and the shell's history when given as an argument: taught on stdin only. */
const ON_STDIN = ["invite join", "group join", "wallet redeem"];

/** The words that name a command in a usage line, up to its first argument or option. */
const commandWords = (usage: string) => {
  const words: string[] = [];
  for (const word of usage.split(" ")) {
    if (!WORD.test(word)) break;
    words.push(word);
  }
  return words.join(" ");
};

/** The text an agent may run: fenced blocks, inline code spans and template strings. */
function code(text: string): string[] {
  const fenced = [...text.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].flatMap(([, body]) => body.replaceAll(/\\\n\s*/g, " ").split("\n")); // a line continued with \ is one
  const inline = [...text.replaceAll(/```[\s\S]*?```/g, "").matchAll(/`([^`\n]+)`/g)].map(([, span]) => span);
  const quoted = [...text.matchAll(/(?:cmd|command): ['"]([^'"]+)['"]/g)].map(([, cmd]) => cmd);
  return [...fenced, ...inline, ...quoted];
}

/** Each `property …` in a line: the words after it, up to where the command's own flags end. */
function invocations(line: string): string[] {
  return [...line.matchAll(/(?:^|[\s($"'])property ((?:[^\s#|;&`)]|[ \t](?!property ))+)/g)]
    .map(([, rest]) => rest.split(/[,.] |\s#|\|\||\||;|&&|\)/)[0].trim());
}

// The first document's test starts one `property help <command>` for each command it names (the next ones reuse what it
// read): 25 s of the default 30 on a busy 4-core host, and past it with a little more load.
describe("what an agent is taught", { timeout: 180_000 }, async () => {
  const listing = (await property(["help"])).stdout;
  const names = new Set(listing.split("\n").filter((l) => l.startsWith("  ") && WORD.test(l.trim().split(" ")[0])).map((l) => commandWords(l.trim())).filter(Boolean));
  names.add("help"); // `property help <command>`
  const flagsOf = new Map<string, Set<string>>([["help", new Set()]]);
  async function flags(name: string): Promise<Set<string>> {
    if (!flagsOf.has(name)) {
      const help = (await property(["help", ...name.split(" ")])).stdout;
      flagsOf.set(name, new Set([...help.matchAll(/--[a-z][a-z-]*/g)].map(([flag]) => flag)));
    }
    return flagsOf.get(name)!;
  }

  for (const doc of DOCS) {
    it(`${doc} runs only commands and flags property has`, async () => {
      const text = readFileSync(resolve(ROOT, doc), "utf8");
      const prompt = /<!-- agent-prompt:start -->([\s\S]*?)<!-- agent-prompt:end -->/.exec(text)?.[1] ?? "";
      const lines = [...code(text), ...prompt.split("\n")];
      let checked = 0;
      for (const line of lines) {
        for (const call of invocations(line)) {
          const words = call.split(/\s+/);
          if (!WORD.test(words[0]) || words[0] === "and") continue; // "`property` and …", a flag alone
          let name = "";
          for (let n = Math.min(words.length, 3); n > 0 && !name; n--) if (names.has(words.slice(0, n).join(" "))) name = words.slice(0, n).join(" ");
          expect(name, `${doc}: no command in "property ${call}"`).not.toBe("");
          const known = await flags(name);
          for (const [flag] of call.matchAll(/(?<![\w-])--[a-z][a-z-]*/g))
            expect(known.has(flag) || GLOBAL.includes(flag), `${doc}: property ${name} has no ${flag} ("property ${call}")`).toBe(true);
          if (ON_STDIN.includes(name)) {
            const arg = ` ${call.slice(name.length)}`.split(/\s--/)[0].trim();
            expect(arg === "" || arg === "-", `${doc}: "property ${call}" puts a secret on the command line; teach it on stdin`).toBe(true);
          }
          checked++;
        }
      }
      expect(checked, `${doc}: no property commands found`).toBeGreaterThan(3);
    });
  }
});

const VOICE_EXAMPLE = "call-echo.mjs";
const POINT_TO_VOICE = ["packages/cli/README.md", "packages/cli/SKILL.md", "packages/cli/skills/property/SKILL.md", "docs/CLI.md"];

describe("a ready voice agent", () => {
  for (const doc of POINT_TO_VOICE)
    it(`${doc} links to the bundled voice-call example`, () => {
      expect(readFileSync(resolve(ROOT, doc), "utf8"), `${doc} does not name ${VOICE_EXAMPLE}`).toContain(VOICE_EXAMPLE);
    });
});
