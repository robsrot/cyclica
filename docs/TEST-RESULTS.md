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

## M3 (tracking, journal, Today, timeline) — 2026-11-15

### Automated (`npm test`): 75 / 75 passed (25 new)

**Record schemas**
- Every pillar accepts valid entries and rejects out-of-range values (e.g. severity 11, Bristol type 8, unknown flow, a malformed time).
- Every pillar field is optional: a missing field means "not recorded".

**Periods and cycle day**
- Consecutive bleeding days form one period. A single unrecorded day inside a period doesn't split it.
- A new period starts after 2 or more days without a period day, and the gap is configurable.
- Spotting alone isn't a period day.
- Input order and duplicate dates don't change the result.
- Cycle lengths are start-to-start for completed cycles only, with no assumed length.
- Cycle day is null ("insufficient data") before the first recorded start, and updates when a period date is corrected.

**Time**
- Calendar arithmetic is correct across month ends, leap years and daylight-saving changes.
- An entry made in another time zone keeps its wall-clock time and offset when edited.
- Ordering uses the real instant across time zones.

**Day view**
- Only that day's entries are collected, and "none today" is kept distinct from "not recorded".
- Timeline order: all-day entries first, then by time, with sleep at its wake-up time.
- Durations are labelled as calculated or entered, and a missing duration stays missing.
- Descriptions contain no causal wording.

**session.save**
- Validates per kind and keeps the calendar day in sync with the time.
- Several entries of the same kind can exist on one day.
- Everything round-trips through encryption.

### Manual, production build in the browser (375×812)

| Check | Result |
|---|---|
| Today: all five areas shown as "○ Not recorded"; cycle card shows "insufficient data" | Pass |
| Period entry (medium flow + cramps, moderate) → tile "✓ Recorded"; cycle card "Period day 1 · calculated"; backup reminder appears | Pass |
| Two headaches on one day (one with end time + new medication "Ibuprofen 400 mg", rated "partly helped"), digestion, energy + sleepiness, sleep (calculated 7 h 50 min in bed), lunch with a new food item + Dairy tag, caffeine, note | Pass |
| Timeline order: all-day entries, then 07:05 sleep → 08:00 caffeine → 09:10 medication → 09:10–11:00 headache → 12:30 lunch → 13:30 digestion → 18:30 headache → 20:00 note | Pass |
| Entries on a past day via the day switcher | Pass |
| Correcting a period date (15 → 13 Nov) moves flow and symptoms; cycle day recalculates (day 3 on 15 Nov) | Pass |
| "None today" for headache, then recording a headache that day → marker removed automatically | Pass |
| Editing an entry (headache severity) updates the timeline | Pass |
| Search finds note text and medication names; opening a result → delete with confirmation | Pass |
| "Recorded in the 24 hours before" panel on a headache lists only your own entries, with the "not necessarily related" wording | Pass |
| Settings → Tracking options: custom cycle symptom added; food list shows the item created from the meal | Pass |
| App update: new build → "A new version is ready" banner → Update → unlock → data intact | Pass |
| No console errors | Pass |

Note: the first scripted run reported two entries as unsaved. Repeated step by step and on another day, they saved correctly. The cause was the test script starting the next entry before the previous save had finished. In the app that can't happen, because the open form covers the add button.

### Not yet verified / not built

- **Meal photos**: not built yet. Planned as an encrypted, on-device-only addition.
- Everything on a real iPhone: the date/time pickers, VoiceOver reading of the tiles and chips, Dynamic Type at large sizes.
- Performance with years of data (expected fine: a few thousand small records), not measured yet.

## M4 (My Patterns, comparisons, experiments) — 2026-11-15

### Automated (`npm test`): 96 / 96 passed (21 new)

Validated against **synthetic data with known built-in effects** (`tests/fixtures/synthetic.ts`): 220 days, cycles of 27–33 days, 20% untracked days. Three planted effects:
- headaches more likely in the 3 days before a period
- energy rising with sleep duration
- digestive symptoms more likely on "Dairy" days

Caffeine and stress have no effect in the data.

| Check | Result |
|---|---|
| Finds each planted effect, in the right direction, with an interval excluding zero | Pass (3/3) |
| No planted effects (6 seeds × 5 questions): share of "difference" verdicts | ≤ 15% (expected ~5% at the 95% level) |
| Caffeine (no effect) not flagged even when other effects exist | Pass |
| Untracked days excluded from denominators, with the count shown | Pass |
| Three headaches on one day = one headache day | Pass |
| Too few days/weeks → "insufficient" with the reason | Pass |
| Cycle questions need ≥ 3 completed cycles | Pass |
| Current cycle never classified as "before a period" (no prediction) | Pass |
| Bootstrap interval deterministic and contains the estimate | Pass |
| "Other recorded factors" computed with sample sizes; the grouping factor excluded | Pass |
| Median split uses the user's own values and says so | Pass |
| Cycle lengths reported as recorded (no 28-day assumption); next-period estimate only with ≥ 3 cycles, labelled as not a prediction | Pass |
| No causal wording in any headline, caveat, limitation or title, across all questions and verdicts | Pass |
| Experiments compare the period with the same number of days before; nothing is shown before the start | Pass |

### Manual, production build in the browser (375×812)

The demo data (1,196 entries) was restored through the real **fresh-install restore** flow from an encrypted backup file generated by `tests/unit/demo-backup.test.ts`.

| Check | Result |
|---|---|
| Fresh-install restore of 1,196 entries; preview lists counts per kind and the date range of the entries | Pass |
| Time-period choices; coverage card (days with entries per area) | Pass |
| Cycle: 8 periods, average 29.4 days over 7 cycles, range 27–33, period length 5.0, next period shown as an estimate with its limitation | Pass (matches the generator) |
| "Not enough data" shown for afternoon/evening energy (the demo only has morning check-ins) | Pass |
| Charts: axes from zero, n per bar, "no data" buckets, table alternative | Pass |
| "Headaches in the 7 days before a period": 43% vs 6%, interval +23 to +47 points, factors table | Pass (planted effect found) |
| "Headaches with vs without caffeine": no clear difference, with the "not recorded ≠ didn't happen" caveat | Pass |
| Session comparison counter | Pass |
| Experiment created via the form (medication/diet notice shown); results compare 43 days with the 43 before; the factors table reveals fewer period days during the experiment | Pass |
| Threshold settings sheet | Pass (viewed; changes go through the same settings store tested in M1–M3) |
| No console errors | Pass |

Fixed during testing: a duplicate empty "Keep in mind" heading in experiments; ISO dates in a note; the backup preview showing creation times instead of entry dates; the "Based on since…" wording; the cycle-day chart using only the selected period; a missing "the" in result headlines.

### Not yet verified

- Real-world behaviour with your own data, which will be sparser and messier than synthetic data.
- Performance on the iPhone with a year or more of data. Each comparison runs 2,000 resamples; the desktop is instant, but the phone hasn't been measured.
