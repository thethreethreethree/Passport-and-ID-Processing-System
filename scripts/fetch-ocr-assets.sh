#!/usr/bin/env bash
# Download the local Tesseract.js OCR assets into extension/lib/tesseract/.
# Run once. Assets stay local — OCR runs fully offline afterwards.
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)/extension/lib/tesseract"
mkdir -p "$DIR"

JS="https://unpkg.com/tesseract.js@5/dist"
CORE="https://unpkg.com/tesseract.js-core@5"
TRAINEDDATA="https://tessdata.projectnaptha.com/4.0.0_best/eng.traineddata.gz"

get() { echo "  $2"; curl -fsSL -m 300 -o "$DIR/$2" "$1/$2"; }

echo "Fetching Tesseract.js into $DIR"
get "$JS" tesseract.min.js
get "$JS" worker.min.js
for f in \
  tesseract-core.wasm tesseract-core.wasm.js \
  tesseract-core-simd.wasm tesseract-core-simd.wasm.js \
  tesseract-core-lstm.wasm tesseract-core-lstm.wasm.js \
  tesseract-core-simd-lstm.wasm tesseract-core-simd-lstm.wasm.js; do
  get "$CORE" "$f"
done
echo "  eng.traineddata.gz (fallback)"
curl -fsSL -m 600 -o "$DIR/eng.traineddata.gz" "$TRAINEDDATA"

# MRZ-specific (OCR-B) model — the primary recognizer; gzip for tesseract.js.
MRZ_TD="https://github.com/DoubangoTelecom/tesseractMRZ/raw/master/tessdata_fast/mrz.traineddata"
echo "  mrz.traineddata.gz (OCR-B / MRZ model)"
curl -fsSL -m 300 -o "$DIR/mrz.traineddata" "$MRZ_TD"
gzip -kf "$DIR/mrz.traineddata"

echo "Done. Reload the extension in chrome://extensions."
