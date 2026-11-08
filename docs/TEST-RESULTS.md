# Test results

## M0 + M1 — 2026-11-08

Environment: Windows 11, Node 24.9, Vitest 5.1. The browser checks used the Claude desktop app's built-in Chromium browser at a 375×812 mobile viewport.

### Automated (`npm test`): 25 / 25 passed

**Crypto primitives**
- JSON round-trip
- A fresh IV on every write
- The ciphertext doesn't contain the plaintext
- Tampering is detected
- A ciphertext moved to another record id is rejected
- The wrong key is rejected
- Wrong-passphrase unwrapping fails
- The unwrapped key is non-extractable
- Unicode-equivalent passphrases (NFC/NFD) match
- Recovery code: 200 random round-trips, forgiving parsing, malformed input rejected

**Vault**
- Only wrapped key material is stored, with 600,000 PBKDF2 iterations
- An existing vault can't be overwritten
- A minimum passphrase length is enforced
- Unlocks with the passphrase or the recovery code, and rejects wrong secrets
- Passphrase change: the old one stops working and data stays readable
- A forgotten passphrase can be reset with the recovery code
- Rotating the recovery code invalidates the old code

**Session**
- Records persist encrypted across a database reopen, with only `{id, iv, ct}` visible
- `createdAt` is preserved on edit
- Invalid records are rejected without being written
- A damaged record is reported and kept, not deleted
- Delete works
- Settings are stored encrypted
- Lock wipes memory, and writes fail while locked

### Manual, production build in the browser (`vite preview`)

| Check | Result |
|---|---|
| Setup flow: welcome → passphrase (mismatch warning shown) → recovery code → confirm first group → persistence request → app | Pass |
| IndexedDB after setup contains only the wrapped key, salts and KDF parameters | Pass (inspected) |
| Persistence status reported honestly ("not granted" in an uninstalled desktop tab) | Pass |
| Auto-lock setting stored and still there after lock and unlock | Pass |
| Lock now → reload → lock screen | Pass |
| Wrong passphrase → clear error, no data change | Pass |
| Recovery code typed lower-case, with spaces and `O` for `0` → accepted → new passphrase → unlocked | Pass |
| Service worker registered and controlling the page | Pass |
| Server stopped → app still loads offline (lock screen) | Pass |
| No console errors | Pass |
| CSP meta tag present in the build; no inline scripts | Pass (inspected `dist/index.html`) |

### Not yet verified

- **Anything on a real iPhone**: Safari install, standalone mode, persistent storage on iOS, PBKDF2 unlock speed on the phone, Dynamic Type, VoiceOver, and auto-lock after backgrounding. This needs the GitHub Pages deployment.
- The install gate (shown only on iOS outside the Home Screen app) hasn't been exercised, because the test browser isn't iOS.
- The GitHub Actions workflow hasn't run yet (no repository).
- The update banner flow (needs two deployed versions).

### Known dependency advisories

`npm audit` reports moderate advisories in `deepmerge`, `glob` and `minimatch`, which `workbox-build` pulls in through `vite-plugin-pwa`. These run only at build time on the developer machine and are not shipped in the app. Revisit when vite-plugin-pwa updates.
