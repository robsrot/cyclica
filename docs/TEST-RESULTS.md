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

## M2 (backup, restore, export, delete) — 2026-11-08

### Automated (`npm test`): 50 / 50 passed (25 new)

**Backup file**
- Contains no readable personal data, kind names or passphrase. Only the format, version, date, wrapped keys and ciphertext are visible.
- File names use the local date and time.
- Non-Cyclica files are rejected, and so are incomplete files and backups from a newer format version.
- A wrong passphrase is rejected without writing anything.
- A tampered payload is detected, and so is a tampered creation date (the header is authenticated).

**Restore to a fresh install**
- All records come back identical. The same passphrase unlocks the new device after a restart, and the restored data counts as backed up.
- Restoring with the recovery code works, and the code keeps working afterwards.
- An old backup opens with the passphrase that was active when it was made, not the newer one.
- Restore-fresh refuses to overwrite an existing vault.
- Damaged (undecryptable) records are carried along unchanged instead of being dropped.

**Restore into an unlocked device**
- Merge adds missing records, takes the newer version, keeps a local version when it's newer, and never deletes local-only records.
- A newer record in the backup wins on merge.
- Replace takes a snapshot first, then the device matches the backup exactly. The snapshot can bring the previous state back.
- A backup from a *different* vault is re-encrypted with this device's key, and the device passphrase is unchanged after a restart.
- Restored changes count towards the backup reminder.
- At most 3 snapshots are kept.

**Backup status**
- Changes are counted, including deletions, and reset when a backup is made. The reminder becomes "due" after the configured number of days.
- Status survives locking.
- A brand-new device shows "nothing to back up".

**Plain export**
- CSV quoting, line breaks and arrays are handled. Spreadsheet formula injection is neutralised.
- The export produces one JSON file plus one CSV per record kind.

**Delete all**
- Vault, records, settings and snapshots are removed, and the app can be set up again afterwards.

**Database upgrade v1 → v2**
- Existing vault and records are untouched and the snapshots table is added.

### Manual, production build in the browser (375×812)

| Check | Result |
|---|---|
| Real browser: a v1 database (as shipped in M1) opened by the M2 build is upgraded to v2 with its vault and records intact, and the app shows the lock screen | Pass |
| Today shows no backup reminder when there's nothing to back up | Pass |
| Create backup file: the status updates to "today, downloaded, no changes since"; the file holds only ciphertext | Pass (the download was intercepted in the test browser; no file was written to disk) |
| Delete all data: the button stays disabled until DELETE is typed; afterwards the database is empty and the welcome screen shows | Pass |
| Fresh install → "Restore from a backup" → wrong passphrase gives a clear error → recovery code opens it → preview → restore → persistence step → app | Pass |
| Restored settings came back (reminder 14 days) and the status says "restored from this backup" | Pass |
| Lock → reload → unlock with the original passphrase after restore | Pass |
| In-app restore: merge/replace choice; "Replace everything" disabled until the checkbox is ticked; report shown; automatic snapshot listed | Pass |
| No console errors | Pass |

### Not yet verified

- **On iPhone:**
  - the share sheet → "Save to Files" → iCloud Drive
  - picking the backup file from iCloud Drive in the restore flow
  - removing the Home Screen icon, reinstalling and restoring
- Backups containing real tracked entries in the UI. Tracking arrives in M3. Until then only the unit tests exercise backups with data, including umlauts and multiple record kinds.
- The CSV opening correctly in Numbers or Excel.
