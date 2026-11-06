'use strict';
/*
 * Local rendering for coordinates already present in a Property message.
 * No map, geocoder, or preview is fetched. Opening the map is an explicit link
 * tap and tells the selected map provider the coordinates and device IP.
 */
(() => {
  const MAX_SCAN_CHARS = 65_536;
  const NUMBER = String.raw`[-+]?\d{1,3}(?:\.\d+)?`;
  const COORDINATE = new RegExp(String.raw`^${NUMBER}$`, 'u');
  const PAIR = new RegExp(String.raw`^\s*(${NUMBER})\s*,\s*(${NUMBER})\s*$`);
  const GOOGLE_MAPS_HOST = /^(?:maps\.)?google\.(?:com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/u;

  function makePlace(lat, lon, source, name = '', zoom = '') {
    if (!COORDINATE.test(String(lat ?? '').trim()) || !COORDINATE.test(String(lon ?? '').trim())) return null;
    const latitude = Number(lat), longitude = Number(lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
    const parsedZoom = Number(zoom);
    const cleanName = String(name || '').replace(/\+/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, 120);
    return {
      lat: latitude,
      lon: longitude,
      source,
      ...(cleanName && !PAIR.test(cleanName) ? { name: cleanName } : {}),
      ...(Number.isFinite(parsedZoom) && parsedZoom >= 1 && parsedZoom <= 19 ? { zoom: Math.round(parsedZoom) } : {})
    };
  }

  function decode(value) {
    try { return decodeURIComponent(value.replace(/\+/gu, ' ')); }
    catch { return value; }
  }

  function fromGeo(uri) {
    const match = /^geo:([^;?#]+)(?:;[^?#]*)?(?:\?([^#]*))?/iu.exec(uri);
    if (!match) return null;
    const [lat, lon] = match[1].split(',');
    const query = new URLSearchParams(match[2] || '');
    const q = query.get('q') || '';
    const label = new RegExp(String.raw`^\s*(${NUMBER})\s*,\s*(${NUMBER})\s*\((.+)\)\s*$`, 'u').exec(q);
    if (label) return makePlace(label[1], label[2], uri, label[3], query.get('z') || '');
    // geo:0,0?q=Place is a map search, not a coordinate to plot.
    if (Number(lat) === 0 && Number(lon) === 0) return null;
    return makePlace(lat, lon, uri, q && !PAIR.test(q) ? q : '', query.get('z') || '');
  }

  function fromMapLink(link) {
    let url;
    try { url = new URL(link); } catch { return null; }
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./u, '');
    const query = url.searchParams;
    const pair = value => value ? PAIR.exec(value) : null;
    if (GOOGLE_MAPS_HOST.test(host) && (host.startsWith('maps.') || url.pathname.startsWith('/maps'))) {
      const at = new RegExp(String.raw`/@(${NUMBER}),(${NUMBER})(?:,(\d{1,2}(?:\.\d+)?)z)?`, 'u').exec(url.pathname);
      const placeName = /\/maps\/place\/([^/@]+)/u.exec(url.pathname)?.[1];
      if (at) return makePlace(at[1], at[2], link, placeName ? decode(placeName) : '', at[3] || '');
      const coords = pair(query.get('q')) || pair(query.get('query')) || pair(query.get('ll')) || pair(query.get('center'));
      if (coords) return makePlace(coords[1], coords[2], link, '', query.get('z') || query.get('zoom') || '');
      return null;
    }
    if (host === 'maps.apple.com' || host === 'maps.apple') {
      const coords = pair(query.get('ll')) || pair(query.get('coordinate')) || pair(query.get('sll')) || pair(query.get('q'));
      if (!coords) return null;
      const q = query.get('q') || '';
      return makePlace(coords[1], coords[2], link, pair(q) ? query.get('name') || '' : query.get('name') || q, query.get('z') || '');
    }
    if (host === 'openstreetmap.org' || host === 'osm.org') {
      const hash = new RegExp(String.raw`map=(\d{1,2})/(${NUMBER})/(${NUMBER})`, 'u').exec(url.hash);
      const lat = query.get('mlat'), lon = query.get('mlon');
      if (lat !== null && lon !== null && PAIR.test(`${lat},${lon}`)) return makePlace(lat, lon, link, '', hash?.[1] || '');
      if (hash) return makePlace(hash[2], hash[3], link, '', hash[1]);
    }
    return null;
  }

  function trimLinkEnd(value) {
    let end = value.length;
    while (end && /[.,!?;:…]/u.test(value[end - 1])) end--;
    for (const [close, open] of [[')', '('], [']', '['], ['}', '{']]) {
      let opened = 0, closed = 0;
      for (let i = 0; i < end; i++) {
        if (value[i] === open) opened++;
        else if (value[i] === close) closed++;
      }
      while (end && value[end - 1] === close && closed > opened) { end--; closed--; }
    }
    return end;
  }

  function findInText(source) {
    const text = typeof source === 'string' ? source : '';
    if (!text || text.length > MAX_SCAN_CHARS) return null;
    for (const match of text.matchAll(/\bgeo:[^\s<>"']+|https:\/\/[^\s<>"']+/giu)) {
      const candidate = match[0].slice(0, trimLinkEnd(match[0]));
      if (!candidate || candidate.length > 2048) continue;
      const found = /^geo:/iu.test(candidate) ? fromGeo(candidate) : fromMapLink(candidate);
      if (found) return found;
    }
    return null;
  }

  function formatCoordinates(place) {
    return `${place.lat.toFixed(5)}, ${place.lon.toFixed(5)}`;
  }

  function mapUrl(place) {
    const lat = place.lat.toFixed(6), lon = place.lon.toFixed(6);
    const zoom = place.zoom || 16;
    return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${zoom}/${lat}/${lon}`;
  }

  function render(source, language = 'en') {
    const place = findInText(source);
    if (!place) return null;
    const portuguese = language === 'pt-BR';
    const doc = globalThis.document;
    const card = doc.createElement('section');
    card.className = 'message-location-card';
    card.setAttribute('aria-label', portuguese ? 'Localização compartilhada' : 'Shared location');
    const heading = doc.createElement('strong');
    heading.className = 'message-location-title';
    heading.textContent = place.name || (portuguese ? 'Localização' : 'Location');
    const coordinates = doc.createElement('code');
    coordinates.className = 'message-location-coordinates';
    coordinates.textContent = formatCoordinates(place);
    const link = doc.createElement('a');
    link.className = 'message-location-open';
    link.href = mapUrl(place);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.referrerPolicy = 'no-referrer';
    link.textContent = portuguese ? 'Abrir no mapa' : 'Open in map';
    link.setAttribute('aria-label', portuguese ? `Abrir ${heading.textContent} no OpenStreetMap` : `Open ${heading.textContent} in OpenStreetMap`);
    const privacy = doc.createElement('small');
    privacy.className = 'message-location-privacy';
    privacy.textContent = portuguese
      ? 'Ao abrir o mapa, o serviço recebe estas coordenadas e o endereço IP deste aparelho.'
      : 'Opening the map shares these coordinates and this device’s IP address with the map service.';
    card.append(heading, coordinates, link, privacy);
    return card;
  }

  globalThis.PropertyLocationCards = Object.freeze({ findInText, formatCoordinates, mapUrl, render, MAX_SCAN_CHARS });
})();
