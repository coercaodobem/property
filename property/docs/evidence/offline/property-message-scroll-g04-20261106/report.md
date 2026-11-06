# Property offline browser validation: message scroll count and relay defaults

**Result:** PASS

**Gate:** G04, 15 of 15 cases passed

**Environment:** Firefox 153.0, Playwright 1.62.1, isolated network namespace, local Property HTTP server, two temporary Geode relays, and one local false-ACK fixture.

G04-18 seeded 20 fixed old history rows, then delivered exactly two new NIP-17 messages while identity A was scrolled away from the bottom. The English button and its screen-reader live region announced two new messages, and the visible anchor stayed within one pixel of its prior position. Switching to Portuguese localized both announcements and preserved the count and anchor. The button then scrolled to the latest messages and cleared the count; a third incoming message kept the view at the bottom. After scrolling up, A's own send returned the view to the bottom without being counted as incoming.

The captured labels were “2 new messages, scroll to bottom” and “2 mensagens novas, rolar para o fim”. Unit cases cover older history catch-up, duplicate IDs, the near-bottom boundary, and invalid counts.

G04-13 also verified the first-use requirement: two distinct relays were selected from the bundled list and saved locally; identity creation was available without relay setup, and no relay connection started before identity activation.

All 15 G04 cases passed. The browser made zero external HTTP requests, raised zero page errors, and used only loopback WebSockets. All identities, messages, and relays were isolated test fixtures; no public relay or real conversation was used.

browser-g04-report.json contains the machine-readable results. The English and Portuguese scroll screenshots show the counted state; date-heading and profile-badge screenshots preserve the evidence from the other cases in this G04 run. SHA256SUMS records the artifact digests.
