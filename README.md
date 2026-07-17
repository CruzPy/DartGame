# Dart Business Finder

A lightweight recording-friendly Google Maps dart game. Move around the map, throw a dart, scan nearby Google Places, and reveal a random business with simple website-status data on screen.

The app is built as a static frontend with plain HTML, CSS, and JavaScript. It is meant for screen recordings, quick experiments, and content workflows, not as a public SaaS.

## Features

- Fullscreen Google Map centered on Santo Domingo by default
- Selectable dart landing boundaries by city, state, country, or map-click Custom boundary
- Adjustable Custom boundary radius in miles
- Recent area selection history with place and Custom boundary restores
- Dart throw animation with impact pulse and radar scan
- Real nearby places from Google Places
- Red, green, and yellow business dots
- Winner reveal card with confetti
- Closeable winner card that does not reset the current search
- Place preview card when clicking nearby dots, without changing the winner
- Draggable, stackable floating cards that work with mouse or touch
- Shaded scan-radius circle around the dart landing area
- Search history for reviewing and restoring previous throws
- Google Maps link for the winner
- Website link when Google provides one
- Phone, rating, review count, address, category, and distance from dart
- Current throw stats:
  - nearest town/city
  - businesses scanned with website found/not found counts
  - website gap percentage
- Reset button to clear the current reveal

## Website Status Rules

The app now requires a Google Places phone number before a place can qualify as a prospect or winner. Places without a phone are marked as needing a closer look instead of being selected, which helps avoid stale listings, private locations, and weak Google profiles.

The app only treats a place as having a real dedicated website when Google returns a believable owned domain.

These count as real websites:

- `businessname.com`
- `businessname.com.do`
- `businessname.net`
- `businessname.store`
- `restaurantname.do`

These do not count as real dedicated websites:

- Instagram
- Facebook
- WhatsApp links
- TikTok
- YouTube
- Linktree
- Google Maps links
- Google Business Profile links
- Delivery, marketplace, travel, or listing pages

## Best Categories To Target

For fresher, easier-to-contact leads, focus throws around dense commercial areas that contain these categories:

- Beauty and personal care: salons, barber shops, spas, nail salons
- Auto and motorcycle services: repair shops, tire shops, car washes, detailing shops
- Home and trade services: hardware stores, plumbers, electricians, painters, roofers
- Health clinics: dentists, doctors, pharmacies, physical therapy, veterinary clinics
- Food businesses: restaurants, bakeries, cafes, takeout counters, bars
- Fitness and specialty retail: gyms, pet stores, florists, jewelry, furniture, electronics, clothing, shoes
- Local essentials: supermarkets, convenience stores, colmados, mini markets

Lower-priority categories are banks, malls, big chains, hotels, tourist attractions, schools, government offices, parks, churches, and residential/private places. Those are more likely to already have websites, be non-prospects, or produce noisy results.

## Setup

### 1. Clone or download the project

```bash
git clone <your-repo-url>
cd DartGame
```

### 2. Create your local config file

Copy the sample config:

```bash
cp config.sample.js config.js
```

On Windows PowerShell:

```powershell
Copy-Item config.sample.js config.js
```

### 3. Get a Google Maps API key

1. Go to https://console.cloud.google.com/.
2. Create or select a Google Cloud project.
3. Go to **APIs & Services** > **Library**.
4. Enable **Maps JavaScript API**.
5. Enable **Places API**.
6. Go to **APIs & Services** > **Credentials**.
7. Create an API key.
8. Paste it into `config.js`:

```js
const GOOGLE_MAPS_API_KEY = 'YOUR_REAL_KEY_HERE';
```

### 4. Restrict your API key

Before publishing or sharing the app, restrict your key in Google Cloud.

Recommended restrictions:

- Application restriction: **Websites**
- Website restrictions:
  - `http://localhost:*/*` for local testing
  - your GitHub Pages URL, for example `https://yourusername.github.io/*`
  - your custom domain if you use one
- API restrictions:
  - Maps JavaScript API
  - Places API

Do not commit your real `config.js` file. It is intentionally listed in `.gitignore`.

## Run Locally

**Recommended (with the Website Builder):** start the bridge server — it serves the
app and powers the in-app "🌐 Hacer Página Web" chat sidebar:

```bash
node bridge/server.js
```

Then open `http://127.0.0.1:4173`. (From the workspace root, `start-dart.cmd`
does both steps.) The bridge runs website builds through your locally installed
Claude Code CLI — you need `claude` installed and logged in (`claude login`).

**Map-only fallback:** the finder itself is still a static app — you can open
`index.html` directly or use any static server (`npx http-server . -p 5500 -c-1`).
Without the bridge, the build button still opens the confirmation card, but
"Generar sitio web" is disabled — use the "Copiar payload (manual)" button
there to copy the handoff JSON to the clipboard (the old workflow).

## Website Builder (bridge + chat sidebar)

Selecting a winner and clicking "🌐 Hacer Página Web" opens a chat sidebar that
pushes the map aside, shows a confirmation card (business details + model
picker), and — on "Generar sitio web" — runs the `dr-site-builder` skill
end-to-end through the Claude Code CLI, streaming every step into the chat.
You can answer the skill's sí/no checkpoints inline, approve/deny tool
permissions, stop and continue at any point, and reload the page without
losing the build (it re-attaches automatically). Per-build token usage and
API-equivalent cost are recorded and shown when the build finishes.

- `bridge/` — zero-dependency Node server (127.0.0.1:4173): static serving,
  REST + SSE API, provider adapters (`bridge/providers/`), build lifecycle and
  event log (`bridge/data/`, gitignored).
- `builder-api.js` / `builder-chat.js` / `builder-settings.js` / `builder.css`
  — the frontend client, chat sidebar, and settings window. The "✨ AI" button
  in the top bar expands/collapses the sidebar; the ⚙ inside the chat header
  opens settings (provider status, default model, optional API key stored
  outside the repo).
- Engine v1 is the local Claude Code CLI (billed to your Claude subscription).
  The adapter interface is provider-agnostic so an API-key backend (Claude
  Agent SDK) or other vendors can be added without reworking the UI.

## Deploy To GitHub Pages

1. Commit these files:
   - `index.html`
   - `style.css`
   - `app.js`
   - `config.sample.js`
   - `.gitignore`
   - `README.md`
2. Do not commit `config.js`.
3. For a public GitHub Pages deploy, you still need a `config.js` available at runtime.

Simple options:

- Keep the repo public but deploy from a branch/environment where `config.js` is added manually.
- Use a build step in GitHub Actions to generate `config.js` from a repository secret.
- Host the app somewhere you can provide `config.js` privately.

Important: frontend API keys are visible to browser users. Restrict the key by referrer and API usage in Google Cloud.

## Files

- `index.html` - app markup
- `style.css` - layout, map overlays, animations, confetti, responsive styles
- `app.js` - Google Maps setup, dart throw flow, Places scan, classification, reveal logic
- `config.sample.js` - safe sample config for public GitHub
- `config.js` - your local API key file, ignored by Git

## Notes

Google may show console warnings about legacy Maps APIs such as `PlacesService` or `Marker`. The app currently keeps those APIs to stay simple and lightweight. A future version could migrate to the newer Places and Advanced Marker APIs.
