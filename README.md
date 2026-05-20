# Dart Business Finder

A lightweight recording-friendly Google Maps dart game. Move around the map, throw a dart, scan nearby Google Places, and reveal a random business with simple website-status data on screen.

The app is built as a static frontend with plain HTML, CSS, and JavaScript. It is meant for screen recordings, quick experiments, and content workflows, not as a public SaaS.

## Features

- Fullscreen Google Map centered on Santo Domingo by default
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

Because this is a static app, you can open `index.html` directly in a browser.

For a local server, use any static server. With Node installed:

```bash
npx http-server . -p 5500 -c-1
```

Then open:

```text
http://localhost:5500
```

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
