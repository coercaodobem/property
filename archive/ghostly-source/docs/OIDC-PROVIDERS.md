# OpenID Connect providers: Property registration

Identity proofs through a provider ([draft](wisps/3xx-oidc-proofs.md)) need an OAuth client registered by the Property maintainer. The client IDs in [`packages/browser/src/proofs/oidc/providers.ts`](../packages/browser/src/proofs/oidc/providers.ts) are intentionally empty. Until Property registers its own clients and adds their public IDs, external providers are neither offered nor accepted. The test suite uses its local issuer (`e2e/support/oidcIssuer.ts`); no live provider account is needed to run it.

Do not copy Ghostly's OAuth client IDs, domain verification, privacy policy, or browser-extension ID. A client registered to Ghostly is not a Property client. Register each client under Property's own provider account and branding, then review its consent screen and privacy information before enabling it.

Rules for every provider:

- **Public client, no secret.** Property's browser app must not contain or send a client secret. If a console generates one, do not copy it into this repository.
- **Smallest scopes:** `openid`, plus `email` and `profile` only where listed. No API scopes.
- **Client IDs are public configuration.** After registration, put the provider's public ID in `clientIds.web` in `packages/browser/src/proofs/oidc/providers.ts`. Desktop signs in through the web callback page and uses the same web client. Every build must carry the same IDs, because a contact's app accepts only tokens whose `aud` is one of them.
- **Property web app and callback:**
  - App: `https://coercaodobem.github.io/property/direct/`
  - GitHub Pages callback: `https://coercaodobem.github.io/property/direct/oidc-callback.html`
  - Local development callback: `http://localhost:5180/property/direct/oidc-callback.html` when the dev server is mounted at the repository's Pages base path. Use the exact URL shown by the running development configuration if that base path changes.
- **Browser extension:** no Property extension client is registered here. If a Property extension is published later, register its Property-owned extension ID and exact callback URI separately; never use Ghostly's extension ID.
- **Privacy information:** publish and verify a Property privacy-policy URL before enabling third-party sign-in. Do not submit Ghostly's policy URL as Property's.
- **Shared Pages origin:** GitHub Pages hosts this app under the shared origin `https://coercaodobem.github.io`; a project path is not a separate browser origin. Keep external sign-in disabled until each provider's current registration rules and the shared-origin implications have been reviewed for Property.

The identity token returns to the static callback page in the URL fragment, which browsers do not send to the web server. Keep that callback page free of analytics and third-party scripts.

## Google

1. [Google Cloud Console](https://console.cloud.google.com/) → create or select a project owned by Property's maintainer.
2. **Google Auth Platform → Branding:** use the Property name, the project's support contact, Property's deployed app URL, and its published privacy policy. Do not claim a domain Property does not control.
3. **Audience:** External → **Publish app**. `openid`, `email` and `profile` are non-sensitive, so no review beyond brand verification.
4. **Data access:** add `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`. Nothing else.
5. **Clients → Create client → Web application**, named for Property.
   - The JavaScript origin, if required and accepted, is `https://coercaodobem.github.io` (origins do not include the `/property/direct/` path).
   - Add the exact Property callback URL above.
6. Copy only the public **Client ID** (`….apps.googleusercontent.com`) into `google.clientIds.web`. Ignore the client secret.

Flow used: `response_type=id_token` (no access token is ever issued).

## Microsoft (Entra ID, work/school and personal accounts)

1. [Entra admin center](https://entra.microsoft.com/) → **App registrations → New registration**, named for Property.
2. **Supported account types:** "Accounts in any organizational directory and personal Microsoft accounts".
3. **Redirect URI:** platform **Web**, the exact Property callback URL above.
4. **Authentication → Implicit grant and hybrid flows:** tick **ID tokens** only. Leave "Access tokens" unticked.
5. **API permissions:** keep only Microsoft Graph `openid`, `email`, `profile` (delegated); remove `User.Read` if it was added by default.
6. **Branding & properties:** use the deployed Property app URL and Property's published privacy statement. (Publisher verification is optional; without it the consent screen says "unverified".)
7. Copy the public **Application (client) ID** (a GUID) into `microsoft.clientIds.web`. Create no client secret or certificate.

Flow used: `response_type=id_token` against the `common` authority. The token's issuer names the account's tenant; the verifier checks it against `tid`.

## Apple (needs a paid Apple Developer account)

1. [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list) → **Identifiers → App IDs**: create a Property-owned App ID with the **Sign in with Apple** capability, if needed.
2. **Identifiers → Services IDs → +**: use a Property-owned identifier and description. Enable **Sign in with Apple → Configure**:
   - Primary App ID: the one above.
   - Domains and subdomains: `coercaodobem.github.io`, if accepted by Apple's current domain rules.
   - Return URL: the exact Property callback URL above.
   - If Apple requires domain verification and GitHub Pages cannot serve the required file at the required path, leave this provider disabled until Property uses a domain/configuration that supports verification.
3. The client ID is the Property-owned **Services ID** → `apple.clientIds.web`. Create no key: Property does not redeem Apple's code.

Flow used: `response_type=code id_token`, `response_mode=fragment`, **no scope**. Apple only allows the fragment without scopes, so the token carries an Apple-assigned identifier and never an email. Asking for name or email requires `form_post`, which only a server can read: out of scope.

## GitLab (gitlab.com)

1. gitlab.com → **User settings → Applications** (or a group's **Settings → Applications** to own it as a group) → **Add new application**, named for Property.
2. Redirect URI: the exact Property callback URL above.
3. **Confidential: unticked** (public client; GitLab then requires PKCE, which Property uses).
4. Scopes: `openid`, `profile`, `email`. Nothing else.
5. Copy the public **Application ID** into `gitlab.clientIds.web`. Ignore the secret.

Flow used: `response_type=code` with PKCE (S256), exchanged from the browser with no secret. GitLab returns an access and a refresh token with the ID token; Property keeps neither and revokes both at once. GitLab adds the person's direct groups (`groups_direct`) to every ID token; the app says so before sign-in.

## Twitch

1. [Twitch developer console](https://dev.twitch.tv/console/apps) → **Register Your Application**: use the Property name, category **Website Integration**, **Client Type: Public**.
2. OAuth Redirect URLs: the exact Property callback URL above.
3. Copy the public **Client ID** into `twitch.clientIds.web`. There is no secret for a public client.

Flow used: `response_type=id_token`, scope `openid`, and `claims={"id_token":{"preferred_username":null}}` when the person shares their username. Twitch's email claim needs `user:read:email`, an API scope, so it is not offered.

## Not supported, and why

| Provider | Why not |
|---|---|
| Facebook | Its web login returns an access token, not an ID token Property can check without Facebook's API or a server. (Limited Login's ID token is iOS-only.) |
| X / Twitter | OAuth 2.0 only, no OpenID Connect: there is no signed ID token to verify. |
| LinkedIn | Signs ID tokens, but only through a code exchange that needs the client secret, and its key set has no CORS headers: it needs a server, which Property does not operate for this static app. |
| GitHub | OAuth apps issue no ID token. Account links go through published SSH keys instead. |
