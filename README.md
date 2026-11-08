# Cyclica

A private, local-first menstrual cycle and wellbeing tracker. It's a Progressive Web App for iPhone, built on Windows and hosted free on GitHub Pages.

- Design and decisions: [docs/DESIGN.md](docs/DESIGN.md)
- Test results per milestone: [docs/TEST-RESULTS.md](docs/TEST-RESULTS.md)

## Status

| Milestone | State |
|---|---|
| M0 Skeleton, PWA, deploy workflow | Built. Not yet deployed (needs your GitHub repository). |
| M1 Security core (passphrase, recovery code, encryption, auto-lock) | Built and tested on desktop. **Not yet tested on a real iPhone.** |
| M2 Backup / restore / export / delete | Not started. **Don't enter real data until M2 is done.** |
| M3–M6 | Not started |

## Develop on Windows

```bash
npm install
npm run dev        # http://localhost:5173/cyclica/ (no service worker, no CSP in dev)
npm test           # unit tests
npm run build      # production build in dist/
npm run preview    # serve the production build at http://localhost:4173/cyclica/
```

## Publish to GitHub Pages (one-time setup)

1. Create a free GitHub account and turn on two-factor authentication. Don't publish other GitHub Pages sites from this account (see DESIGN.md §1.3).
2. Create a **public** repository named `cyclica`. The name becomes part of the app's address, so don't rename it later.
3. In the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Push this project to the `main` branch. The workflow in `.github/workflows/deploy.yml` runs the tests, builds and publishes.
5. The app is then at `https://<your-username>.github.io/cyclica/`.

If you use a different repository name, the workflow adapts the base path automatically. The local `npm run build` uses `/cyclica/` unless you set `BASE_PATH`.

## Install on iPhone

1. Open the app address in **Safari** (not another browser).
2. Tap **Share → Add to Home Screen → Add**.
3. Open Cyclica **from the Home Screen icon** and set it up there. A Safari tab has separate storage from the installed app.
