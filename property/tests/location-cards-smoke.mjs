import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const context = { console, URL, URLSearchParams, setTimeout, clearTimeout };
context.window = context;
vm.createContext(context);
for (const [path, name] of [['web/nostr-entities.js', 'nostr-entities'], ['web/rich-text.js', 'rich-text'], ['web/location-cards.js', 'location-cards']]) {
  vm.runInContext(await readFile(join(root, path), 'utf8'), context, { filename: name });
}

const locations = context.PropertyLocationCards;
const rich = context.PropertyRichText;
let place = locations.findInText('Meet at geo:0,0?q=38.6916,-9.2160(Torre%20de%20Bel%C3%A9m)');
assert.equal(place?.lat, 38.6916);
assert.equal(place?.lon, -9.216);
assert.equal(place?.name, 'Torre de Belém');
assert.equal(locations.formatCoordinates(place), '38.69160, -9.21600');
assert.equal(locations.mapUrl(place), 'https://www.openstreetmap.org/?mlat=38.691600&mlon=-9.216000#map=16/38.691600/-9.216000');

place = locations.findInText('https://www.google.com/maps/place/Torre+de+Bel%C3%A9m/@38.6916,-9.2160,17z');
assert.equal(place?.lat, 38.6916);
assert.equal(place?.lon, -9.216);
assert.equal(place?.zoom, 17);
assert.equal(place?.name, 'Torre de Belém');
assert.equal(locations.findInText('https://maps.apple.com/?ll=37.33182,-122.03118&q=Apple%20Park')?.name, 'Apple Park');
assert.equal(locations.findInText('https://www.openstreetmap.org/#map=14/38.6916/-9.216')?.zoom, 14);
assert.equal(locations.findInText('geo:91,0'), null, 'out-of-range latitude is rejected');
assert.equal(locations.findInText('geo:0,181'), null, 'out-of-range longitude is rejected');
assert.equal(locations.findInText('geo:38.6,'), null, 'an empty longitude is rejected instead of becoming zero');
assert.equal(locations.findInText('geo:,38.6'), null, 'an empty latitude is rejected instead of becoming zero');
assert.equal(locations.findInText('geo:0,0?q=Search+for+a+place'), null, 'a zero-coordinate place search does not draw a false card');
assert.equal(locations.findInText('https://google.attacker.example/maps/@1,2,14z'), null, 'lookalike map hosts are rejected');
assert.equal(locations.findInText('https://maps.app.goo.gl/example'), null, 'short links with hidden coordinates remain ordinary links');
assert.equal(locations.findInText('http://www.openstreetmap.org/?mlat=38.6&mlon=-9.2'), null, 'insecure map URLs are rejected');

const visibleLocations = rich.locationText('Visible `geo:10,20`\n```text\ngeo:30,40\n```\n||geo:50,60||\ngeo:38.6916,-9.2160');
assert.equal(visibleLocations.includes('geo:10,20'), false, 'inline code is not interpreted as a place');
assert.equal(visibleLocations.includes('geo:30,40'), false, 'fenced code is not interpreted as a place');
assert.equal(visibleLocations.includes('geo:50,60'), false, 'hidden spoiler text is not interpreted as a place');
assert.equal(locations.findInText(visibleLocations)?.lat, 38.6916);

class FakeNode {
  constructor(tagName, ownerDocument) { this.tagName = tagName.toUpperCase(); this.ownerDocument = ownerDocument; this.children = []; this.attributes = {}; this._text = ''; this.dataset = {}; }
  set className(value) { this._className = value; }
  get className() { return this._className || ''; }
  append(...nodes) { this._text = ''; this.children.push(...nodes); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(node => node.textContent).join(''); }
}
context.document = { createElement: name => new FakeNode(name, context.document) };
const card = locations.render(visibleLocations, 'pt-BR');
assert.equal(card?.tagName, 'SECTION');
assert.equal(card?.attributes['aria-label'], 'Localização compartilhada');
const nodes = [];
const visit = node => { nodes.push(node); node.children.forEach(visit); };
visit(card);
const coordinates = nodes.find(node => node.className === 'message-location-coordinates');
const mapLink = nodes.find(node => node.className === 'message-location-open');
assert.equal(coordinates?.textContent, '38.69160, -9.21600');
assert.equal(mapLink?.textContent, 'Abrir no mapa');
assert.equal(mapLink?.target, '_blank');
assert.equal(mapLink?.rel, 'noopener noreferrer');
assert.equal(mapLink?.referrerPolicy, 'no-referrer');
assert.equal(nodes.some(node => node.tagName === 'IMG'), false, 'rendering a location never loads a map tile or remote image');

console.log('PASS: geo and map URLs become bounded local cards; code/spoilers and invalid coordinates stay inert; maps open only by explicit link and send no automatic request');
