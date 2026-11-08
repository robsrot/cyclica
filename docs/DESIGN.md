# Cyclica — Phase 1 Design

Status: **draft for approval** · Written 2026-11-08 · Platform: Progressive Web App (PWA) for iPhone Safari

This document answers the five "before implementation" questions:

1. Architecture
2. Storage, encryption, key recovery, backup and restore
3. iOS-specific limitations and risks
4. Milestones
5. How you will test and install the app

It also defines the data model and analysis methodology that the later phases implement. Anything marked **(decision)** is open for your input.

---

## 1. Architecture

### 1.1 Stack

| Concern | Choice | Why |
|---|---|---|
| UI | React 18 + TypeScript | Type safety for a data-heavy app. Mature, and runs well in Safari. |
| Build | Vite | Fast and works natively on Windows. |
| Styling | Tailwind CSS | Design tokens (ivory, sage, rose, terracotta, lavender, charcoal) live in one config. |
| Local database | IndexedDB via **Dexie.js** | Mature wrapper with versioned schema migrations and transactions. |
| Offline / install | Service worker + Web App Manifest via **vite-plugin-pwa** (Workbox) | A standard, well-tested precaching setup. It only caches app files, never user data. |
| Cryptography | **Web Crypto API** (`crypto.subtle`) only | Uses the browser's native, audited implementations. No custom crypto and no JS crypto library. |
| Runtime validation | **zod** | Every record is validated when written, restored or migrated, so a corrupt record is reported instead of silently dropped. |
| Dates | date-fns | Local-calendar-day arithmetic without timezone surprises. |
| Charts | Small hand-written SVG components | Full control over n-labels, missing-data shading and VoiceOver descriptions, with no heavy chart dependency. |
| Tests | Vitest (+ fake-indexeddb) for logic; **Playwright with the WebKit engine** for end-to-end | WebKit is the engine behind iPhone Safari, and Playwright runs it on Windows. That's close to the real thing but not identical, so real-device checks are still part of the plan. |
| Hosting | **GitHub Pages, free tier** (public repository), deployed by a GitHub Actions workflow | HTTPS (required for service workers and Web Crypto), free, no server code. Chosen by you on 2026-11-08. |

### 1.2 Module layout

```
src/
  app/            navigation shell, routes, lock gate
  ui/             reusable components (scales, chips, sheets, charts)
  features/
    today/        dashboard
    track/        forms for each pillar + journal
    timeline/     unified day timeline
    patterns/     analysis screens
    learn/        science library + safety info
    settings/     privacy, backup, export, delete, thresholds
  domain/
    model/        record types + zod schemas (single source of truth)
    cycle/        period detection, cycle lengths, cycle-day alignment
    analysis/     day aggregation, descriptive stats, comparisons, thresholds
  data/
    db.ts         Dexie schema + migrations
    repo.ts       encrypted repository (the only code that touches IndexedDB)
  security/       key derivation, key wrapping, record encryption, lock timer
  backup/         encrypted backup file format, restore, plain export (CSV/JSON)
  content/        science library JSON (app content, not user data)
docs/             architecture, analysis methodology, security, test results
tests/            unit + end-to-end
```

Rules:
- UI never touches IndexedDB or crypto directly.
- Analysis code is pure functions over decrypted records, so it can be fully unit-tested.

### 1.3 What leaves the device

- **The hosting provider serves app files (HTML/JS/CSS/icons) only.** No health data is sent anywhere. There's no backend, no analytics, no telemetry, no error reporting service and no AI calls.
- A strict Content-Security-Policy (`connect-src 'self'`, no third-party scripts, fonts or images) stops the app's own code from talking to any other domain.
- What GitHub can see: that some device requested the app files (IP address, timestamp). That's normal for any web host.
- GitHub Pages doesn't allow custom HTTP headers, so the CSP is delivered as a `<meta http-equiv="Content-Security-Policy">` tag. That supports everything the app needs except `frame-ancestors` (anti-framing). Framing can't read data across origins, and the app is used from the Home Screen anyway.
- **Origin sharing:** every GitHub Pages project on one account is served from the same origin (`<username>.github.io`), and browsers isolate storage per origin. **Don't publish other Pages sites from the same account**, or use a dedicated GitHub account for Cyclica. Records are encrypted either way, but this keeps the app's origin clean.
- **The repository is public** (a GitHub Pages requirement on the free plan). It contains only app code: no data, keys or secrets.

### 1.4 Honest threat model

| Protected against | Not protected against |
|---|---|
| Someone reading the raw database files, e.g. from a device backup | Someone who knows or watches you type your passphrase |
| The hosting provider (it never receives data) | A compromised iPhone (jailbreak, malware) |
| Other websites (browser same-origin isolation) | Someone using the phone while the app is unlocked |
| Tampering with stored records (AES-GCM authenticates every record) | **A malicious app update served from the host.** A web app runs whatever code the host serves. Mitigations: you control the GitHub account (turn on 2FA), deploys only come from your repository's `main` branch, and the CSP limits outbound connections. This is the main structural difference from a signed native app. |

---

## 2. Storage, encryption, key recovery, backup and restore

### 2.1 Storage layout (IndexedDB, via Dexie)

| Table | Contents | Plaintext fields |
|---|---|---|
| `vault` | **Wrapped** data key (never the raw key), KDF parameters, salts, format version | Parameters only |
| `records` | One row per user record: `{ id, iv, ciphertext }` | Random UUID only. **Type, date and content are all encrypted.** |
| `blobs` | Meal photos, encrypted, loaded only when viewed | Random UUID only |
| `meta` | Encrypted settings, last-backup timestamp, change counter | — |

Records are decrypted into memory once at unlock. A single person's data, even years of it, is a few thousand small records, which decrypt in well under a second. All queries then run in memory. This means **no health metadata (dates, record types) needs to sit in plaintext indexes.** Every write goes through a transaction (encrypt, then write) and only updates memory after the write succeeds.

### 2.2 Keys

```
passphrase ──PBKDF2-SHA-256 (600k iterations, random salt)──► Passphrase KEK ─┐
                                                                               ├─ each wraps ─► DATA KEY (random AES-256-GCM)
recovery code (128-bit random) ──HKDF-SHA-256──► Recovery KEK ─────────────────┘                    │
                                                                                                     ▼
                                                                    every record: AES-256-GCM, fresh 96-bit IV,
                                                                    record id bound as additional authenticated data
```

- **Data key**: random, generated once by `crypto.subtle.generateKey`. It's only ever stored *wrapped* (encrypted). After unlock it exists only in memory, as a non-extractable key. Locking or auto-lock discards it and clears the decrypted cache.
- **Passphrase key**: derived with PBKDF2-SHA-256. The 600,000 iterations follow the current OWASP password-storage guidance for PBKDF2-HMAC-SHA256 (to be re-verified in Milestone 1). The parameters are stored with the vault, so they can be raised later without re-encrypting the data.
  - *Trade-off:* Argon2id (memory-hard) is stronger against GPU brute force, but Web Crypto doesn't provide it, so it would need a WebAssembly library. I recommend native PBKDF2 plus a reasonably long passphrase. The app will show a strength hint.
- **Recovery code**: 128 random bits, shown once at setup as 26 grouped characters (e.g. `K7QM-…`). It also wraps the data key. **Print it or write it down. Don't store it on the same phone.**
- **Changing the passphrase** re-wraps the data key. Records don't need re-encrypting.
- **Why a passphrase every time?** The only way to keep the key *out of* storage is to derive it from something you know. Storing a "remembered" key in IndexedDB would put the key next to the data, which your requirement #6 rules out.

**(decision) Face ID convenience unlock.** Web apps can't call Face ID directly. They can create a **passkey** (WebAuthn), and Safari 18+ supports the **PRF extension**, which returns a secret only after Face ID succeeds. That secret can wrap the data key as a third, optional unlock path. It uses only standard APIs and stores no key in plain form.

Caveats:
- It's newer technology with reported early bugs.
- It ties to the app's domain.
- The passkey syncs through your iCloud Keychain.

I propose building it as an optional extra in the last milestone. The passphrase always works as the fallback, and if it misbehaves on your phone we drop it.

### 2.3 Auto-lock

The app locks after a configurable period in the background or inactive (default: 5 minutes; options: immediately / 1 / 5 / 15 / 60 min). The timer uses `visibilitychange` and timestamps, because iOS suspends the app's JavaScript in the background.

### 2.4 Encrypted backup file

File name: `cyclica-backup-2026-11-08-1430.cyclica` (a JSON text file).

```
{
  "format": "cyclica-backup", "formatVersion": 1, "createdAt": "...",   ← plaintext header
  "vault":   { wrapped data key under passphrase KEK and recovery KEK, salts, params },
  "payload": { iv, ciphertext }   ← AES-GCM( data key, gzip(JSON of all records, photos, settings, app version, record counts) )
}
```

- It opens with **either your passphrase or your recovery code**, on any device, including a fresh install.
- **Saving:** the iOS share sheet (`navigator.share` with a file) → *Save to Files* → iCloud Drive or any provider you choose. If sharing is unavailable, the app falls back to a normal download.
- Old backups keep the passphrase that was active when they were made. The app tells you this when you change your passphrase.

### 2.5 Restore

1. Choose the file, then enter your passphrase or recovery code.
2. Decrypt the file, then validate **every** record against its schema. Unknown or invalid records are listed, never silently dropped.
3. A preview shows the record counts by type, the date range and the backup date.
4. Choose:
   - **Replace** (fresh installs; if data exists, the app first creates an automatic encrypted pre-restore snapshot)
   - **Merge** (matched by record id; the newer `updatedAt` wins; conflicts are listed)
5. All of it is written in **one transaction**. If anything fails, nothing changes.

### 2.6 Backup status and reminders

- The Today screen and Settings show the last backup date and the number of changes since then.
- A gentle banner appears when the last backup is older than a threshold (default 7 days) **and** there are unsaved changes. No banner appears if nothing changed.
- iOS won't run a web app in the background, so **backups are always a deliberate tap**. The app does not claim to back up automatically.

### 2.7 Other export and deletion

- **Plain export (CSV per record type + one JSON file).** *Unencrypted*, with a clear warning. It's for reading your data, giving it to a clinician or moving to another tool.
- **Delete all data:** a two-step confirmation (type `DELETE`). It wipes IndexedDB, caches and the vault, then returns to first-run setup.
- **Persistent storage:** the app calls `navigator.storage.persist()` and shows the real result ("granted" / "not granted" / "unsupported") in Settings, plus estimated usage from `navigator.storage.estimate()`. It never promises the data can't be deleted.

### 2.8 Recovery scenarios (also shown in-app)

| Situation | What to do |
|---|---|
| New or lost iPhone | Open the app URL in Safari, *Share → Add to Home Screen*, open the icon, choose **Restore from backup**, pick the file from iCloud Drive, enter your passphrase. |
| Home Screen icon deleted | iOS deletes the web app's data with it. Reinstall and restore as above. |
| Forgot passphrase | Unlock with the recovery code, then set a new passphrase. |
| Lost passphrase **and** recovery code | **The data cannot be recovered by anyone.** This is a direct consequence of real encryption. |
| App moved to a different web address | Data belongs to the old address. Restore from backup at the new one. **So we choose the address once and keep it.** |
| App update | Database migrations are versioned. Before any migration, an encrypted snapshot is taken. A failed migration rolls back and shows an error, and never resets anything. |

---

## 3. iOS / PWA limitations and risks

1. **Install before use.** On iOS, the Home Screen app and Safari tabs have **separate storage**. Data entered in a Safari tab won't appear in the installed app. The app detects when it's not installed and shows install instructions instead of the setup screen.
2. **Storage eviction.** Safari deletes website storage after 7 days without use, but Home Screen web apps are exempt (per WebKit). Persistent storage can be requested and its status shown. Deleting the icon, or iOS clearing space in extreme low-storage situations, can still remove data, **which is why backups matter**.
3. **No background work.** There are no automatic backups, no background sync and no scheduled local notifications. Web Push exists for installed web apps (iOS 16.4+), but it needs a push server, which contradicts the zero-backend design, so v1 doesn't use it. **Reminders:**
   - in-app banners
   - optionally, a calendar file (`.ics`) you add to Apple Calendar for a recurring "log today" reminder. It's generated on-device, contains no health data and needs no server.
4. **No Apple Health access.** Web apps can't read HealthKit, so sleep is entered manually.
5. **Face ID only through passkeys** (see 2.2). There's no Keychain or Secure Enclave key storage like native apps have.
6. **iOS file protection.** iOS encrypts the phone's storage when it's locked, but a web app can't choose its data-protection class. That's why the app encrypts records itself.
7. **Code trust.** See the threat model (1.4). A native app is signed by Apple; a web app trusts its host.
8. **WebKit/IndexedDB bugs.** Safari has had IndexedDB bugs in the past. Mitigations: error handling everywhere, transactions, a startup integrity check and backups.
9. **Updates.** The service worker downloads a new version in the background, and the app shows "Update ready – tap to reload". It never reloads in the middle of a form.
10. **Camera.** Meal photos use the standard photo picker / camera input. They are resized on-device to keep storage small, encrypted and never uploaded.

---

## 4. Data model (summary)

Common fields on every stored record:
- `id` (UUID)
- `kind`
- `schemaVersion`
- `createdAt` and `updatedAt` (UTC instants)
- `occurredAt` (local date-time **with UTC offset**, so travel across time zones keeps the correct local day), or `date` (local calendar day) for day-level records
- `notes?`
- `links?` (ids of related records)

**Only user-entered information is stored.** Everything calculated or estimated (cycle day, cycle length, phase, sleep duration when bed and wake times are given, averages) is derived at read time, with a `kind: "calculated" | "estimated"` tag that the UI always displays. Nothing calculated is ever saved as if it were user-entered.

| Kind | Key fields |
|---|---|
| `bleeding` | date, flow (spotting / light / medium / heavy), unusual?, notes. Periods are *derived* from runs of bleeding days (rules in section 6). |
| `cycleSymptom` | date, symptom (cramps, breast tenderness, bloating, mood, skin/acne, fatigue, appetite, custom), intensity? |
| `fertilityObs` (optional) | date, cervical mucus / basal body temperature / LH test result |
| `headache` | start, end or duration, severity 1–10, location(s), character, continuous/intermittent, associated symptoms, impact on activities, medication links, "medication seemed to help" (your report), *your* diagnosis label (marked as user-entered) |
| `digestion` | time, bloating / discomfort / pain (none–mild–moderate–severe), gas, constipation, diarrhoea, overall comfort, bowel movement, Bristol type 1–7 (optional, with a reference sheet) |
| `checkIn` | time, slot (morning / afternoon / evening, optional), **energy** 1–10, mental clarity, motivation, **sleepiness** 1–10, difficulty staying awake, physically exhausted, mentally tired. Energy and sleepiness are separate fields; every field is optional. |
| `sleep` | bedtime, wake time, duration override, awakenings, quality 1–5, felt rested. Assigned to the **wake-up date**. |
| `meal` | time, type (breakfast / lunch / dinner / snack / drink), food-item references, free description, portion, category tags, photo ids. **No calorie or nutrient values.** |
| `foodItem` | reusable: name, ingredients, your category tags (e.g. dairy, gluten — fully customisable) |
| `lifestyle` | time, type (water, caffeine, alcohol, exercise, stress, workload, travel, illness, event, custom), value + unit or scale |
| `medication` | time, name, dose, medication vs supplement |
| `note` | date/time, text, links to any record |
| `dayStatus` | date, area, status = **"none"** (e.g. "No headache today", "No bleeding") |
| `experiment` | title, what you changed, start, planned end, outcome measures, notes |

**Missing vs none vs not applicable.** `dayStatus` is how the app knows the difference between *"not recorded"* and *"recorded: none"*. Every frequency uses only days where that area was actually tracked (an entry or an explicit "none") as its denominator. Untracked days are reported as "not recorded", never as zero.

---

## 5. Daily tracking workflow

- **Today**: the date, the cycle status ("Cycle day 12 · calculated", or "Insufficient data"), and four pillar tiles each showing *Recorded / Not recorded / None today*. It also shows last night's sleep, recent context entries, a short timeline and the backup status. A persistent **+** button opens quick add.
- **Quick add**: a bottom sheet with eight large buttons (Period, Headache, Digestion, Energy, Sleep, Meal, Context, Note). Each form fits on one screen: tap-scales, chips, a "now" time with an easy change, and optional fields collapsed under "More detail". Typical entry: 2–4 taps.
- **One-tap "none today"** on each pillar tile.
- Recent and favourite food items and context chips are reused, so typing is rarely needed.

---

## 6. Analysis methodology (summary — full version in `docs/ANALYSIS.md` in Milestone 4)

1. **Unit of analysis = one local calendar day.** Several entries on one day are combined with a documented rule per measure:
   - headache day = any episode, with max severity
   - digestion = max per symptom
   - energy = mean per time-of-day slot
   - sleep = assigned to the wake-up day

   This avoids counting five entries from one bad day as five independent observations.
2. **Denominators are tracked days only** (see the data model).
3. **Periods and cycles.**
   - A period starts on the first day of light, medium or heavy flow after at least 2 bleeding-free days. Spotting alone doesn't start a period. This is configurable and shown in-app.
   - Cycle length = start-to-start, for completed cycles only.
   - Variability = range and standard deviation, shown only with at least 3 completed cycles.
4. **Cycle alignment.** Two views:
   - **Cycle day** (counted from a recorded period start)
   - **Days before the next period** (only for cycles that have ended, so it's retrospective and needs no prediction)

   "Period (recorded)" is the only phase shown as fact. Ovulation or other phases are **not** estimated from the calendar by default. If you record LH tests or BBT, those appear as *your observations*, never as "confirmed ovulation".
5. **Next period estimate.** Shown only after 3 or more completed cycles. It's displayed as a date range from your own cycle lengths, labelled *estimate*, with a one-line limitation note.
6. **Descriptive statistics** always show n (days), the date range and the number of untracked days excluded and why.
7. **Comparisons** (e.g. next-day energy after < 6 h vs ≥ 6 h sleep):
   - both group means with n per group
   - the difference
   - an uncertainty interval from a **block bootstrap** (resampling whole weeks or cycles, because consecutive days aren't independent)
   - no p-values
   - plain-language wording: "Lower on average in your records; the uncertainty range includes no difference."
8. **Temporal order.** Context factors are counted in explicit windows (e.g. 0–24 h *before* headache onset, ±1 h *around*, *after*), compared with the same windows on tracked days without the symptom. Wording never says "caused" or "triggered".
9. **Confounding check.** Each comparison shows "Other things that also differed between these days" (e.g. sleep, stress, cycle day) when they did.
10. **No auto-generated "insight feed".** Scanning every factor against every symptom guarantees chance findings. Instead, you choose a question from a curated list. Each result is labelled *exploratory*, and the app shows how many comparisons you've looked at with a reminder that some differences appear by chance.
11. **Minimum-data rules** (defaults, configurable, rationale documented):

| Insight | Default minimum | Rationale |
|---|---|---|
| Average of a measure | 7 tracked days | Below this, a single unusual day dominates the average. |
| Two-group comparison | 7 tracked days **per group**, spanning at least 3 different weeks | Avoids comparing two clumps of consecutive days. |
| Average cycle length | 2 completed cycles | One cycle isn't an average. |
| Cycle variability / next-period estimate | 3 completed cycles | A spread can't be described from 2 values. |
| "Recurring" cycle pattern | Present in at least 3 of the cycles that have tracking in that window, with at least 3 such cycles | The brief requires multiple cycles. 3 is the smallest number where "recurring" means more than "happened twice". |

Below a threshold, the app shows: *"Not enough recorded data to identify a reliable pattern yet."*, along with how much more data would be needed.

12. **Experiments**: a before/after comparison using the same rules, with fixed limitation text (no blinding, other things change, expectation effects, seasonal drift). Experiments touching prescribed medication show a "talk to your prescriber" notice and are never suggested by the app.

The logic will be validated with synthetic test datasets that have known answers, including edge cases: irregular cycles, missing weeks, time-zone travel and many entries per day.

---

## 7. Science library approach

- Content lives in versioned JSON in the code repository. It's app content, not user data.
- Every entry has:
  - topic
  - title
  - authors or organisation
  - year
  - journal or publisher
  - DOI or stable URL
  - evidence type
  - main findings
  - limitations
  - evidence label
  - last-reviewed date
- **Verification process (per source):**
  1. Find it via PubMed, Cochrane, NICE, ACOG, WHO or NIH.
  2. Open the actual page.
  3. Confirm the DOI or URL resolves and that the title, authors and year match.
  4. Write findings only from what the source states.
  5. Record the review date.

  Anything that can't be verified is left out.
- The labels "Strong / Moderate / Limited / Insufficient / Conflicting" are explained in-app and explicitly **not** a formal GRADE assessment. Each entry is marked *"Summarised with AI assistance on <date>; not clinician-reviewed"*, which is honest about who checked it.
- **Safety page** (red-flag symptoms: sudden or severe headache, headache with neurological symptoms, severe abdominal pain, very heavy bleeding, persistent or worsening symptoms), worded from clinical guidance (e.g. NICE / NHS / ACOG). Neutral, not alarmist, with every line traceable to a source.
- Expect a **focused** first library (roughly 15–30 well-verified entries across the 10 topics), not an exhaustive one.

---

## 8. Milestones

| # | Milestone | Done when |
|---|---|---|
| M0 | **Skeleton + deploy pipeline** | Vite/React/TS/Tailwind app with manifest, service worker and CSP, deployed to GitHub Pages and installed on your iPhone. Proves offline launch and standalone mode **before** building on it. |
| M1 | **Security core** | Setup (passphrase + recovery code), lock screen, auto-lock, encrypted repository, persistent-storage request. Unit tests for key derivation, wrapping, record encryption and tamper detection. |
| M2 | **Backup / restore / export / delete** | Encrypted backup, restore (replace + merge), fresh-install restore test, CSV/JSON export, delete-all, backup status. *Built before tracking, so your data is never at risk from day one.* |
| M3 | **Tracking + journal + Today + timeline** | All four pillars, meals with food library and photos, lifestyle, medication, notes, day status, edit and delete everywhere. |
| M4 | **Analysis + charts** | Cycle engine, day aggregation, descriptive stats, comparisons, minimum-data rules, charts with n and missing-data display, experiments. Synthetic-data tests. |
| M5 | **Science library + safety info** | Researched and verified content, with the source verification log. |
| M6 | **Quality + polish** | Accessibility (Dynamic Type via relative text sizes, VoiceOver labels, contrast), empty and error states, `.ics` reminder, optional Face ID passkey, Playwright WebKit end-to-end suite, real-iPhone test checklist, final docs and a known-limitations list. |

Each milestone ends with tests run and results recorded in `docs/TEST-RESULTS.md`, including anything that **wasn't** verified.

---

## 9. How you'll test and install

**On Windows (development):** `npm run dev` runs the app in your desktop browser. `npm test` runs the unit tests and `npm run e2e` runs the Playwright WebKit suite with iPhone viewport emulation.

**On your iPhone.** Service workers and Web Crypto require HTTPS, so the phone uses the deployed build:
- **App URL:** `https://<your-username>.github.io/cyclica/`. Your real data lives here. **The address is fixed by your username and the repository name, so neither should be renamed later.**
- **Testing new versions:** before a release, each version is tested on your PC (desktop browser + Playwright WebKit with iPhone emulation) using fake data. A separate test deployment would share the same origin on GitHub Pages, so it isn't used for anything that could touch real data.

Deploying: push to the `main` branch of your public `cyclica` repository, and a GitHub Actions workflow builds and publishes the site. You need a free GitHub account (created and logged in by you, with 2FA on).

**Installing:** open the production URL in **Safari** → Share button → **Add to Home Screen** → open from the icon → create a passphrase → save the recovery code → make your first backup to iCloud Drive.

**Real-device checklist (M6):** install, airplane-mode launch, lock and unlock, auto-lock, add and edit and delete entries, backup to iCloud Drive, delete the app, reinstall, restore, verify counts, update flow.
