// Browser MRZ OCR (Option B: crop + preprocess + Tesseract). window.OCR.
// Accuracy levers, in order of impact:
//   1) crop to the MRZ band — biggest win (auto-guess, or user-drawn region)
//   2) grayscale + upscale + Otsu binarize
//   3) charset whitelist A-Z0-9< and uniform-block segmentation
//   4) checksum-guided correction downstream (lib/correct.js)
// Tesseract assets are local (lib/tesseract/), fetched once via scripts/fetch-ocr-assets.
(function (root) {
  "use strict";

  // One cached worker per language: "mrz" (OCR-B model, passports) and "eng"
  // (general text, for PH IDs which have no MRZ).
  const PARAMS = {
    mrz: {
      tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<",
      tessedit_pageseg_mode: "6", // uniform block
      tessedit_do_invert: "0",
    },
    eng: {
      tessedit_pageseg_mode: "3", // fully automatic page segmentation (mixed blocks)
      tessedit_do_invert: "0",
    },
  };
  const workers = {};

  async function getWorker(lang, onProgress) {
    lang = lang || "mrz";
    if (typeof Tesseract === "undefined")
      throw new Error("Tesseract not loaded — run scripts/fetch-ocr-assets to install OCR assets.");
    if (!workers[lang]) {
      const base = chrome.runtime.getURL("lib/tesseract/");
      workers[lang] = (async () => {
        const worker = await Tesseract.createWorker(lang, 1, {
          workerPath: base + "worker.min.js",
          corePath: base,
          langPath: base,
          workerBlobURL: false,
          logger: onProgress ? (m) => onProgress(m) : undefined,
        });
        await worker.setParameters(PARAMS[lang] || {});
        return worker;
      })();
    }
    return workers[lang];
  }

  function fileToImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("could not load image")); };
      img.src = url;
    });
  }

  // Draw a source rect to a canvas, grayscale, and Otsu-binarize.
  // Note: normalising to ~1600px wide is deliberate — it suppresses the faint
  // security underprint (BUNDESREPUBLIK…) that floods OCR at full resolution.
  function preprocess(img, sx, sy, sw, sh, opts) {
    opts = opts || {};
    const targetWidth = opts.targetWidth || 1600;
    const scale = targetWidth / sw; // normalise width (down- or up-scale to target)

    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);

    const id = ctx.getImageData(0, 0, w, h);
    const px = id.data;
    const hist = new Array(256).fill(0);
    const gray = new Uint8ClampedArray(w * h);
    for (let i = 0, j = 0; i < px.length; i += 4, j++) {
      const g = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0;
      gray[j] = g;
      hist[g]++;
    }

    // Otsu threshold -> black/white.
    const total = w * h;
    let sum = 0;
    for (let t = 0; t < 256; t++) sum += t * hist[t];
    let sumB = 0, wB = 0, max = 0, threshold = 127;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (wB === 0) continue;
      const wF = total - wB;
      if (wF === 0) break;
      sumB += t * hist[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > max) { max = between; threshold = t; }
    }
    for (let i = 0, j = 0; i < px.length; i += 4, j++) {
      const v = gray[j] > threshold ? 255 : 0;
      px[i] = px[i + 1] = px[i + 2] = v;
      px[i + 3] = 255;
    }
    ctx.putImageData(id, 0, 0);
    return canvas;
  }


  function parseText(text) {
    return root.MRZCorrect ? root.MRZCorrect.parseCorrected(text) : root.MRZ && root.MRZ.parse(text);
  }

  // OCR a specific source-image region (user-drawn box). Best accuracy path.
  async function recognizeRegion(img, rect, onProgress) {
    const worker = await getWorker("mrz", onProgress);
    const canvas = preprocess(img, rect.x, rect.y, rect.w, rect.h, { targetWidth: 1600 });
    const { data } = await worker.recognize(canvas);
    const text = (data && data.text) || "";
    return { text, parsed: parseText(text) };
  }

  // Full-card general-text OCR (eng model) for IDs without an MRZ. Grayscale +
  // upscale the whole image (no binarisation — these are colour cards).
  function fullCanvas(img, targetWidth) {
    const s = targetWidth / img.width;
    const w = Math.max(1, Math.round(img.width * s));
    const h = Math.max(1, Math.round(img.height * s));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const id = ctx.getImageData(0, 0, w, h);
    const px = id.data;
    for (let i = 0; i < px.length; i += 4) {
      const g = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0;
      px[i] = px[i + 1] = px[i + 2] = g;
    }
    ctx.putImageData(id, 0, 0);
    return canvas;
  }

  async function recognizeFullText(imgOrFile, onProgress) {
    const img = imgOrFile instanceof Image ? imgOrFile : await fileToImage(imgOrFile);
    const worker = await getWorker("eng", onProgress);
    const { data } = await worker.recognize(fullCanvas(img, 1600));
    return { text: (data && data.text) || "" };
  }

  const chevrons = (s) => (s.match(/</g) || []).length;

  // Auto attempt: try several bottom-band crops; stop at the first checksum-valid read.
  // Always returns the rawest MRZ-looking text (even on failure) so it can be inspected.
  async function recognizeMRZ(imgOrFile, onProgress) {
    const img = imgOrFile instanceof Image ? imgOrFile : await fileToImage(imgOrFile);
    const worker = await getWorker("mrz", onProgress);
    // Bottom-band crops only (where the MRZ lives). Dropped the full-image passes:
    // they were slow, noisy, and the manual crop is the accurate fallback anyway.
    const crops = [0.72, 0.66, 0.78];
    const attempts = [];
    let best = null;
    let rawest = "";
    for (const top of crops) {
      const sy = Math.floor(img.height * top);
      const canvas = preprocess(img, 0, sy, img.width, img.height - sy, { targetWidth: 1600 });
      const { data } = await worker.recognize(canvas);
      const text = (data && data.text) || "";
      if (chevrons(text) > chevrons(rawest)) rawest = text;
      const parsed = parseText(text);
      const ok = parsed && parsed.ok;
      const valid = parsed && parsed.valid;
      attempts.push({ cropTop: top, ok: !!ok, valid: !!valid });
      if (ok && (!best || (valid && !best.valid))) best = { top, text, parsed };
      if (valid) return { text, parsed, attempts, cropTop: top };
    }
    if (best) return { text: best.text, parsed: best.parsed, attempts, cropTop: best.top, weak: true };
    // Nothing parsed — return the rawest recognized text for inspection/diagnosis.
    return { text: rawest, parsed: parseText(rawest), attempts, weak: true, rawOnly: true };
  }

  // Warm up the MRZ worker (load model) ahead of time so the first scan is fast.
  function warm() {
    try { return getWorker("mrz"); } catch (e) { return Promise.resolve(null); }
  }

  root.OCR = { recognizeMRZ, recognizeRegion, recognizeFullText, fileToImage, warm };
})(typeof self !== "undefined" ? self : this);
