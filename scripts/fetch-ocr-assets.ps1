# Download the local Tesseract.js OCR assets into extension\lib\tesseract\.
# Run once (PowerShell). Assets stay local — OCR runs fully offline afterwards.
#   powershell -ExecutionPolicy Bypass -File scripts\fetch-ocr-assets.ps1
$ErrorActionPreference = "Stop"
$dir = Join-Path $PSScriptRoot "..\extension\lib\tesseract"
New-Item -ItemType Directory -Force -Path $dir | Out-Null

$js   = "https://unpkg.com/tesseract.js@5/dist"
$core = "https://unpkg.com/tesseract.js-core@5"
$td   = "https://tessdata.projectnaptha.com/4.0.0_best/eng.traineddata.gz"

function Get-Asset($base, $name) {
  Write-Host "  $name"
  Invoke-WebRequest -Uri "$base/$name" -OutFile (Join-Path $dir $name) -MaximumRedirection 5
}

Write-Host "Fetching Tesseract.js into $dir"
Get-Asset $js "tesseract.min.js"
Get-Asset $js "worker.min.js"
$coreFiles = @(
  "tesseract-core.wasm","tesseract-core.wasm.js",
  "tesseract-core-simd.wasm","tesseract-core-simd.wasm.js",
  "tesseract-core-lstm.wasm","tesseract-core-lstm.wasm.js",
  "tesseract-core-simd-lstm.wasm","tesseract-core-simd-lstm.wasm.js"
)
foreach ($f in $coreFiles) { Get-Asset $core $f }
Write-Host "  eng.traineddata.gz (fallback)"
Invoke-WebRequest -Uri $td -OutFile (Join-Path $dir "eng.traineddata.gz") -MaximumRedirection 5

# MRZ-specific (OCR-B) model — the primary recognizer; gzip for tesseract.js.
$mrzUrl = "https://github.com/DoubangoTelecom/tesseractMRZ/raw/master/tessdata_fast/mrz.traineddata"
Write-Host "  mrz.traineddata.gz (OCR-B / MRZ model)"
$mrzRaw = Join-Path $dir "mrz.traineddata"
Invoke-WebRequest -Uri $mrzUrl -OutFile $mrzRaw -MaximumRedirection 5
$in = [System.IO.File]::OpenRead($mrzRaw)
$out = [System.IO.File]::Create("$mrzRaw.gz")
$gz = New-Object System.IO.Compression.GZipStream($out, [System.IO.Compression.CompressionMode]::Compress)
$in.CopyTo($gz); $gz.Close(); $out.Close(); $in.Close()

Write-Host "Done. Reload the extension in chrome://extensions."
