# Location cards and first-use relays — G04 evidence

**Result:** PASS. All 20 browser cases passed in the final isolated G04 run.

The run used Playwright 1.62.1, Firefox 153.0, and two temporary Geode relays on loopback. The test network namespace denied public egress. The report records zero external HTTP requests and zero browser page errors.

G04-23 sent a fixed `geo:` location in an encrypted NIP-17 message between disposable identities. Both Property clients rendered “Torre de Belém” at `38.69160, -9.21600`; the loopback relay did not expose the place name or coordinates. Rendering issued no external request and loaded no map tiles. The OpenStreetMap link is explicit and the card explains that opening it shares the coordinates and device IP with the map service. English and Portuguese controls passed; the mobile screenshot shows the full card above the composer.

The same run passed G04-13: a clean browser profile received two distinct, locally saved relay suggestions shown before identity creation. Creating or importing an identity remained available without opening relay settings, and the browser made no relay connection before identity activation.

The machine-readable results are in [`browser-g04-report.json`](browser-g04-report.json). The visual review image is [`g04-location-card-mobile-pt-BR.png`](g04-location-card-mobile-pt-BR.png).
