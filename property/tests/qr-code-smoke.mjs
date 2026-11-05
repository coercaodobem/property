import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const elements = [];
const document = {
  createElementNS(namespace, tagName) {
    const element = { namespace, tagName, attributes: {}, children: [], setAttribute(name, value) { this.attributes[name] = String(value); }, append(child) { this.children.push(child); } };
    elements.push(element);
    return element;
  }
};
const window = { document };
const context = { window, RangeError, TypeError };
vm.createContext(context);
vm.runInContext(await readFile(new URL('../web/vendor/qr-code-generator.js', import.meta.url), 'utf8'), context, { filename: 'qr-code-generator.js' });
const qr = window.PropertyQrCode;
const value = 'https://coercaodobem.github.io/property/#contact=nprofile1example';
const matrix = qr.encodeMatrix(value);
assert.ok(matrix.length >= 21 && (matrix.length - 17) % 4 === 0, 'output uses a valid QR symbol dimension');
assert.ok(matrix.every(row => row.length === matrix.length && row.every(cell => typeof cell === 'boolean')), 'matrix is square and contains boolean modules');
assert.deepEqual(JSON.parse(JSON.stringify(matrix)), JSON.parse(JSON.stringify(qr.encodeMatrix(value))), 'QR generation is deterministic');
for (const [originX, originY] of [[0, 0], [matrix.length - 7, 0], [0, matrix.length - 7]]) {
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    const distance = Math.max(Math.abs(x - 3), Math.abs(y - 3));
    assert.equal(matrix[originY + y][originX + x], distance !== 2, 'finder pattern has the standard dark/light rings');
  }
}
const svg = qr.createSvg(value, 'Property contact QR');
assert.equal(svg.tagName, 'svg');
assert.equal(svg.attributes.role, 'img');
assert.equal(svg.attributes['aria-label'], 'Property contact QR');
assert.equal(svg.attributes.viewBox.split(' ').length, 4, 'SVG includes a scalable viewBox and four-module quiet zone');
assert.equal(svg.children.length, 2, 'QR SVG has a white background and a dark-module path');
assert.equal(svg.children[0].attributes.fill, '#ffffff');
assert.ok(svg.children[1].attributes.d.includes('M4 4'), 'quiet-zone offset is applied to encoded modules');
assert.throws(() => qr.encodeMatrix(''), error => error.name === 'TypeError', 'empty payload is rejected');
assert.throws(() => qr.encodeMatrix('x'.repeat(4000)), error => error.name === 'RangeError', 'oversized payload is rejected instead of truncated');
console.log('PASS: offline QR encoder produces deterministic, accessible SVG symbols with quiet zone and bounded inputs');
