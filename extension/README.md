# Passport/ID Field Recon — Phase 1

A read-only Chrome extension that inspects the live target page and reports every
form field, so the auto-fill logic (later phases) is built from the **real DOM**
instead of guessed class names.

## Why recon first

Auto-fill (mapping extracted passport data → form fields, then writing it in) can't
be built until we know the actual field anchors. The target form looks like a modern
SPA, so CSS class names are probably auto-generated and brittle. This tool captures
**multiple selector candidates per field** (id, name, aria-label, structural path) so
we choose the most stable one from evidence, not assumption.

## Load it (unpacked)

1. Open `chrome://extensions`
2. Toggle **Developer mode** (top-right)
3. **Load unpacked** → select this `extension/` folder
4. Open the target profile form, click the extension icon, then **Scan fields**

- **Highlight on page** outlines each field and tags it with its index.
- **Copy JSON** copies the full report.

It uses only `activeTab` + `scripting`: it can read a page **only** when you click the
button, and it sends nothing anywhere.

## What to do with the output

Paste the scanned JSON back into the chat. From it we map the extractable passport
fields (via MRZ + OCR) onto these form fields and decide selector strategy + which
fields need OCR-of-visual-zone vs. manual entry.

## Phase map (current → next)

| Stage | What | Status |
|-------|------|--------|
| E. Recon | identify page + fields + selectors | ✅ done |
| C. Map | extracted data → these fields | ✅ done — [FIELD-MAP.md](FIELD-MAP.md), `lib/mappers.js` (30 tests) |
| B. Extract (core) | MRZ parse + checksum validation | ✅ done — `lib/mrz.js` (21 tests, ICAO specimens) |
| B. Correction | checksum-guided OCR-error fixing | ✅ done — `lib/correct.js` (9 tests) |
| D. Fill | text + combobox-click-by-id + React events | ✅ done — verified on live Mews |
| A. Capture/UI | upload + paste, review-with-confidence, fill | ✅ done — `popup.*` |
| B. Extract (OCR) | image → MRZ text (local WASM Tesseract) | ⚠ built — needs in-browser test with real images |

Run all tests:
```
node lib/mrz.test.js && node lib/mappers.test.js && node lib/correct.test.js
```

## OCR (local, offline)

Install the Tesseract assets once (~30 MB, stays local, gitignored):

```
bash scripts/fetch-ocr-assets.sh        # or: powershell -File scripts\fetch-ocr-assets.ps1
```

Then reload the extension and use the **file picker** in the popup. The OCR layer
(`lib/ocr.js`) crops to the MRZ band, grayscales + Otsu-binarizes, runs Tesseract with
the `A-Z0-9<` whitelist, and feeds the result through checksum-guided correction. If no
crop checksum-validates it returns the best attempt flagged low-confidence. Manual paste
remains the guaranteed fallback.

## Locked decisions

- **Extraction = in-browser (local), MRZ-first + WASM OCR fallback.** Passport image and
  data never leave the machine. No cloud OCR, no API keys.
- **Capture = file upload.** User selects an existing photo/scan in the popup. (Camera
  can be added later.)

## Open decisions (deferred to evidence, not pre-decided)

- **Selector strategy:** chosen per-field from the recon report.
- **Coverage gap:** MRZ has no Email / Telephone / Language / Place of birth / Title;
  those need visual-zone OCR or manual entry. Exact gap confirmed after recon.
