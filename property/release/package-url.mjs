#!/usr/bin/env node

function encodePurlPart(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function packageUrlReference(component, info = {}) {
  let referenceLocator = info.purl;
  if (referenceLocator && !/^pkg:[a-z][a-z0-9.+-]*\//i.test(referenceLocator)) {
    throw new Error(`Invalid package URL for ${component}`);
  }
  if (!referenceLocator) {
    const maven = /^([^:]+):([^:]+):([^:]+)$/.exec(component);
    if (maven) {
      referenceLocator = `pkg:maven/${encodePurlPart(maven[1])}/${encodePurlPart(maven[2])}@${encodePurlPart(maven[3])}`;
    } else {
      const name = encodePurlPart(component);
      const version = typeof info.version === 'string' && /^[A-Za-z0-9][A-Za-z0-9.+_-]*$/.test(info.version)
        ? `@${encodePurlPart(info.version)}` : '';
      referenceLocator = `pkg:generic/property/${name}${version}`;
    }
  }
  return { referenceCategory: 'PACKAGE-MANAGER', referenceType: 'purl', referenceLocator };
}
