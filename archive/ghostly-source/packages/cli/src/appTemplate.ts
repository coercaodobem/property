/*
 * What `property app init` writes (WISP 1200, Apps · Publishing): the smallest app that does something with a contact.
 * Three files, each whole in this module, so the CLI's one built file carries them: the manifest as a publisher writes
 * it, a page that says hello to the same app on the contact's side, and a README with the way from here to a store.
 */

export interface AppTemplate { name: string; title: string }

const html = (text: string) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** `ghostly-app.json`: the manifest without `publisher`, `sequence` and `files`, which `app publish` writes. */
export function templateManifest({ name, title }: AppTemplate): Record<string, unknown> {
  return {
    name,
    version: "0.1.0",
    kind: "mini-app",
    title,
    tagline: "Say hello to a contact",
    description: "Open it in a chat and your contact gets a card to join. Each side can then say hello to the other.",
    entry: "index.html",
    permissions: ["chat"],
    view: "chat",
    runtime: { host: ">=1.2", clients: ["web", "desktop"] },
    license: "MIT",
  };
}

/**
 * `index.html`: the whole app in one file, as the sandbox needs it (no network, so nothing is loaded from elsewhere).
 * Its script is plain JavaScript typed with JSDoc against `@ghostlytools/sdk/app`, so it runs as written and still type
 * checks (test/appInit.test.ts does). The title is the only thing put into it, as text. Its type imports are in single
 * quotes: they are text of the page, not imports of the CLI's own build (test/packageDeps.test.ts reads those).
 */
export function templatePage({ title }: AppTemplate): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${html(title)}</title>
<style>
  :root { color-scheme: light dark; --bg: #ffffff; --fg: #16181d; --muted: #5b6270; --line: #d9dde3; --accent: #2f6fed; }
  :root[data-theme="dark"] { --bg: #16181d; --fg: #f2f4f7; --muted: #a3abb8; --line: #343a45; --accent: #7aa5ff; }
  body { margin: 0; padding: 20px; background: var(--bg); color: var(--fg); font: 16px/1.4 system-ui, sans-serif; }
  h1 { margin: 0 0 4px; font-size: 20px; }
  #status { margin: 0 0 16px; color: var(--muted); }
  button { font: inherit; padding: 8px 16px; border: 1px solid var(--accent); border-radius: 8px; background: var(--accent); color: var(--bg); }
  button:disabled { opacity: 0.5; }
  ul { margin: 16px 0 0; padding: 0; list-style: none; }
  li { padding: 8px 0; border-top: 1px solid var(--line); }
</style>
</head>
<body>
<h1>${html(title)}</h1>
<p id="status" role="status">Starting</p>
<button id="hello" type="button" disabled>Say hello</button>
<ul id="log" aria-label="Messages"></ul>
<script type="module">
// The types of the API come from the SDK (npm install --save-dev --prefix .. @ghostlytools/sdk); nothing of it runs here.
/** @typedef {import('@ghostlytools/sdk/app').MiniAppApi} MiniAppApi */
/** @typedef {import('@ghostlytools/sdk/app').MiniAppJson} MiniAppJson */

/** The longest text shown from a contact's frame. */
const MAX_TEXT = 200;

const status = /** @type {HTMLElement} */ (document.getElementById("status"));
const button = /** @type {HTMLButtonElement} */ (document.getElementById("hello"));
const log = /** @type {HTMLElement} */ (document.getElementById("log"));

/** @param {string} text */
function show(text) {
  const line = document.createElement("li");
  line.textContent = text;
  log.append(line);
}

/**
 * What the contact's app sent, when it is a hello. A frame comes from another device: read only what this app sends,
 * and never put it in the page as HTML.
 * @param {MiniAppJson} data
 * @returns {string | null}
 */
function helloOf(data) {
  if (!data || typeof data !== "object" || Array.isArray(data) || data.type !== "hello") return null;
  return typeof data.text === "string" && data.text.length <= MAX_TEXT ? data.text : null;
}

/**
 * Why a send was refused, in words. The code is the rejection's message (MINI_APP_ERROR_CODES in the SDK); a later
 * client may add one.
 * @param {unknown} error
 */
function refusal(error) {
  switch (error instanceof Error ? error.message : "") {
    case "offline": return "Not sent: you are not both online";
    case "peer-closed": case "not-open": return "Not sent: your contact has not opened this app";
    case "not-allowed": return "Open this app in a chat to say hello";
    default: return "Not sent";
  }
}

/** @param {MiniAppApi} property */
async function start(property) {
  // Listen before anything is awaited, so no frame is missed.
  property.chat.on("message", (data) => {
    const text = helloOf(data);
    if (text !== null) show("Your contact: " + text);
  });
  property.chat.on("peer", (peer) => {
    status.textContent = peer.open ? "Your contact has this app open" : "Waiting for your contact to open this app";
  });

  const context = await property.context();
  const dark = context.theme ? context.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  status.textContent = !context.inChat ? "Open this app in a chat to say hello"
    : context.peer ? "Your contact has this app open" : "Waiting for your contact to open this app";

  button.disabled = false;
  button.addEventListener("click", async () => {
    try {
      await property.chat.send({ type: "hello", text: "Hello!" });
      show("You: Hello!");
    } catch (error) {
      show(refusal(error));
    }
  });
}

/** Property Direct's runner gives the app \`window.property\`; a browser tab has none. */
const property = /** @type {{ property?: MiniAppApi }} */ (window).property;
if (property) void start(property);
else status.textContent = "This page is a Property Direct app: publish it and open it in Property Direct";
</script>
</body>
</html>
`;
}

/** `README.md`: explain the bundle format without implying that the Property web client executes mini-apps. */
export function templateReadme({ name, title }: AppTemplate): string {
  return `# ${title}

A signed mini-app bundle scaffold created by \`property app init\`.

**Compatibility status:** mini-app execution is disabled in the Property Direct browser app. This CLI can create and
verify bundles, but that does not mean this Property web client can install or run them. There is no official Property
Direct app store configured. See [the app compatibility notes](https://github.com/coercaodobem/property/blob/modelo-mvp/property/direct/docs/APPS.md)
before sharing a bundle.

| File | What it is |
|---|---|
| \`ghostly-app.json\` | Protocol-compatible manifest; its filename is retained for wire compatibility |
| \`index.html\` | The app, whole: styles and script inline |
| \`README.md\` | This file |

## Write it

\`index.html\` is plain JavaScript and uses the protocol's \`window.property\` interface. The SDK source is included in
the Property repository at \`property/direct/packages/sdk\`; do not fetch or execute runtime code from a CDN. The web
client currently does not execute mini-apps.

- What a contact's app sends is untrusted: check its shape, bound its size, and show it as text, never as HTML.
- \`"view": "chat"\` runs the app inside a chat with one contact. \`"full"\` is a full-screen app opened from the Apps page.
- \`permissions\` lists what the person is asked for: \`chat\` (frames to the contact's app), \`name\` (the person's
  display name) and \`internet\`. Adding one later makes every install ask before it updates.

## Build and sign

Build all source assets into one self-contained \`index.html\`. Keep the manifest and bundle in a clean staging folder;
\`property app publish\` includes every non-hidden file in the folder. Do not include source secrets, private keys,
\`node_modules\`, or unrelated files.

## Publish

\`\`\`sh
property app publish . --key ~/property-keys/${name}-publisher.key
property app verify app.ghostlyapp
\`\`\`

\`publish\` signs the folder into \`app.ghostlyapp\`. The first run makes the publisher key at the path you name:

- Keep it **outside this folder** and its repository (\`publish\` refuses a key inside it), and never commit it.
- Back it up. An app is updated only with the key that signed it; a lost key means a new app.

\`verify\` checks the bundle as Property Direct will and prints its \`ref\` (\`<publisher key>/${name}\`), \`sequence\` and
\`digest\`. For the next version, raise \`version\` in \`ghostly-app.json\` and publish again: the sequence goes up
by one by itself.

## Share only with compatible clients

The CLI can verify a local signed bundle. The Property Direct web app cannot install or run it while mini-app execution
is disabled. The upstream wire format uses the filenames \`ghostly-app.json\` and \`app.ghostlyapp\`; keep them as-is
for compatibility. Do not upload or list a bundle as a Property app until a compatible client and store are available.

## If something goes wrong

If a version is harmful, \`property app revoke . --key <your key> --up-to <sequence>\` writes a signed revocation file.
The revocation mechanism is part of the inherited protocol; it is not evidence that the current Property web client
executes or distributes mini-apps.
`;
}
