import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(resolve(root, 'docs/prototypes/agent-pairing/index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'inline prototype script exists');

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, 'HTML ids are unique');
const idSet = new Set(ids);
const referencedIds = [...script.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map((match) => match[1]);
assert.ok(referencedIds.every((id) => idSet.has(id)), 'every JavaScript element reference exists');
assert.doesNotMatch(html, /<(?:script|link|img)[^>]+(?:src|href)=["']https?:\/\//i, 'no remote executable or visual assets');

class Element {
  constructor(id) {
    this.id = id;
    this.hidden = id.startsWith('screen-') && id !== 'screen-home';
    this.checked = false;
    this.value = '';
    this.textContent = '';
    this.listeners = new Map();
    this.focusCount = 0;
    this.classList = { toggle() {} };
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  focus() {
    this.focusCount += 1;
  }
}

const elements = new Map(ids.map((id) => [id, new Element(id)]));
for (const id of ['nav-agent', 'agent-row']) elements.get(id).hidden = true;
const screens = [...elements.values()].filter((element) => element.id.startsWith('screen-'));
const document = {
  getElementById(id) {
    const element = elements.get(id);
    assert.ok(element, `element ${id} exists`);
    return element;
  },
  querySelectorAll(selector) {
    assert.equal(selector, '.screen');
    return screens;
  },
  querySelector(selector) {
    const match = selector.match(/^#(screen-[\w-]+) h1$/);
    return match ? elements.get(`title-${match[1].slice('screen-'.length)}`) : null;
  },
};

runInNewContext(script, { document });

function click(id) {
  const handler = elements.get(id)?.listeners.get('click');
  assert.equal(typeof handler, 'function', `${id} has a click handler`);
  handler();
}

function visible(id) {
  assert.equal(elements.get(`screen-${id}`).hidden, false, `screen ${id} is visible`);
  assert.ok(screens.filter((screen) => screen.id !== `screen-${id}`).every((screen) => screen.hidden), `only screen ${id} is visible`);
}

visible('home');
click('open-human');
visible('human');
assert.ok(elements.get('title-human').focusCount > 0, 'focus moves to the human conversation title');
click('human-back');
visible('home');

click('add-agent');
click('load-demo');
click('verify-continue');
visible('permissions');
assert.equal(elements.get('permission-read').checked, false, 'read access starts disabled');
assert.equal(elements.get('permission-send').checked, false, 'send access starts disabled');
elements.get('permission-read').checked = true;
click('permissions-cancel');
visible('cancelled');
assert.equal(elements.get('permission-read').checked, false, 'cancelling clears the selected scope');
click('cancelled-home');
visible('home');
click('open-human');
visible('human');
click('human-back');

click('add-agent');
click('load-demo');
click('verify-continue');
elements.get('permission-read').checked = true;
click('approve-agent');
visible('paired');
assert.equal(elements.get('nav-agent').hidden, false, 'approved agent appears in navigation');
assert.match(elements.get('granted-summary').textContent, /Ler a conversa com Lia/);
assert.doesNotMatch(elements.get('granted-summary').textContent, /Enviar texto/);
click('open-agent');
visible('paired');
click('revoke-open');
visible('revoke');
click('revoke-cancel');
visible('paired');
assert.equal(elements.get('agent-nav-status').textContent, 'Acesso ativo', 'cancelling revocation retains access');
click('revoke-open');
click('revoke-confirm');
visible('revoked');
assert.equal(elements.get('agent-nav-status').textContent, 'Acesso revogado', 'local revocation is visible');
assert.match(elements.get('prototype-notice').textContent, /nenhum aviso de rede foi enviado/i);
click('revoked-home');
visible('home');
click('open-agent');
visible('revoked');

console.log('PASS agent pairing prototype smoke (3 deterministic interaction flows; mock DOM only, no participant or network).');
