# Property offline browser validation: local unread badge

**Result:** PASS

**Gate:** G04, 13 of 13 cases passed

**Environment:** Firefox 153.0, Playwright 1.62.1, isolated network namespace, two temporary Geode relays and a local HTTP app server.

The run exercised the full G04 browser flow, including the existing first-use relay behavior and the new optional app-icon unread badge. For first use, Property selected two distinct relays from its bundled candidates, saved the pair locally, allowed identity creation without relay setup, and opened no relay connection before identity activation.

For the badge, the browser API received no calls before opt-in. Enabling it saved a preference scoped to the synthetic test identity and set the icon count to the local unread total (2). Opening that conversation changed the local unread total to 0 and cleared the badge. Turning the setting off cleared it as well. The flow requested no additional notification permission and published zero relay events.

The browser made zero external HTTP requests. WebSockets were limited to loopback relays, and the browser's attempted Mozilla runtime-update connections were denied by the offline proxy. There were zero page errors. Test identities and message contents were generated only for this local run; no public relay or real account was used.

The machine-readable case results and visual capture are in this directory. Their SHA-256 values are recorded in `SHA256SUMS`.
