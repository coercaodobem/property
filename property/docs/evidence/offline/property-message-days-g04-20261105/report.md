# Property offline browser validation: relay defaults and message-day headings

**Result:** PASS

**Gate:** G04, 14 of 14 cases passed

**Environment:** Firefox 153.0, Playwright 1.62.1, isolated network namespace, two temporary Geode relays and a loopback HTTP app server.

The first-use flow selected two distinct relays from the bundled candidates, saved them on-device, allowed identity creation without relay setup, and opened no relay connection before identity activation.

The date-heading case used three synthetic messages on the fixed local dates 2026-11-03, 2026-11-04, and 2026-11-05. It showed one heading for each day in English and Portuguese, with Today/Yesterday and Hoje/Ontem labels. Date grouping left message records unchanged and published zero relay events. The unit cases also cover year boundaries and invalid timestamps.

The full G04 browser flow made zero external HTTP requests and had zero page errors. All browser WebSockets were limited to loopback relays; no public relay, real identity, or real conversation was used. Firefox runtime-update attempts were denied by the offline proxy.

`browser-g04-report.json` contains the machine-readable results. `g04-message-days-english.png` and `g04-message-days-pt-BR.png` show the rendered views. `SHA256SUMS` records their digests.
