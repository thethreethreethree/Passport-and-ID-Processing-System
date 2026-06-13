# Install — Frendz · Passport / ID Autofill

A Chrome extension that reads a passport/ID MRZ locally and auto-fills the Mews
guest profile. No build step, no account, **runs fully offline** — nothing leaves
the computer.

## Option A — from the ZIP (easiest; offline, no internet needed)

1. Copy `dist/frendz-passport-autofill.zip` to the target computer.
2. Unzip it anywhere (e.g. the Desktop). You'll get a folder that contains
   `manifest.json` directly.
3. Open Chrome → go to `chrome://extensions`.
4. Turn on **Developer mode** (top-right toggle).
5. Click **Load unpacked** and select the **unzipped folder** (the one with
   `manifest.json` in it).
6. Pin the frendz icon — done.

## Option B — from GitHub

1. Download or clone the repository.
2. In `chrome://extensions` → enable **Developer mode** → **Load unpacked** →
   select the **`extension`** folder (the one containing `manifest.json`).
3. The OCR model is committed, so it works immediately. (If `extension/lib/tesseract/`
   is ever empty, run `powershell -ExecutionPolicy Bypass -File scripts\fetch-ocr-assets.ps1`.)

## Common mistakes

- **"Manifest file is missing or unreadable"** → you selected the repo root. Select the
  **`extension`** subfolder (or the unzipped folder), the one with `manifest.json`.
- **Image scanning does nothing / errors** → the OCR engine files aren't present. Confirm
  `extension/lib/tesseract/` contains `mrz.traineddata.gz`, `worker.min.js`,
  `tesseract.min.js`, and the `tesseract-core-*` files. (Paste-MRZ works without them.)

## Updating a machine

Unpacked extensions don't auto-update. To update: replace that machine's folder with the
new version, then click the ↻ **reload** button on the extension card in `chrome://extensions`.

## What it needs

- Google Chrome (or any Chromium browser: Edge, Brave) with Developer mode.
- Access to the Mews guest profile page (`app.mews.com/.../Customer/.../Detail`).
