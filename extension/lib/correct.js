// Checksum-guided MRZ correction — recover common OCR confusions using the
// MRZ's own check digits. Deterministic, testable. Browser (window.MRZCorrect)
// + Node (module.exports). Depends on MRZ (checkDigit).
(function (root) {
  "use strict";

  const MRZ =
    typeof module !== "undefined" && module.exports ? require("./mrz.js") : root.MRZ;

  // Letters that are commonly OCR-confused with digits (alpha -> digit).
  const TO_DIGIT = { O: "0", Q: "0", D: "0", I: "1", L: "1", Z: "2", S: "5", B: "8", G: "6", A: "4", T: "7" };
  // Digits commonly confused with letters (digit -> candidate letters).
  const TO_ALPHA = { "0": ["O", "D", "Q"], "1": ["I", "L"], "2": ["Z"], "5": ["S"], "8": ["B"], "6": ["G"], "4": ["A"], "7": ["T"] };

  const valid = (value, checkChar) => {
    const exp = MRZ.checkDigit(value);
    const act = checkChar === "<" ? 0 : parseInt(checkChar, 10);
    return exp !== null && exp === act;
  };

  // Fix a field that must be all digits (dates). Strategy: map confused letters
  // to digits; if the check still fails, try single-position digit swaps.
  function fixNumeric(value, checkChar) {
    if (valid(value, checkChar)) return { value, changed: false };

    let mapped = value
      .split("")
      .map((c) => (/[0-9]/.test(c) ? c : TO_DIGIT[c] || c))
      .join("");
    if (valid(mapped, checkChar)) return { value: mapped, changed: mapped !== value };

    // Single-position digit search over the letter-mapped candidate.
    const arr = mapped.split("");
    for (let i = 0; i < arr.length; i++) {
      const orig = arr[i];
      for (let d = 0; d <= 9; d++) {
        arr[i] = String(d);
        if (valid(arr.join(""), checkChar)) return { value: arr.join(""), changed: true };
      }
      arr[i] = orig;
    }
    return { value, changed: false, unresolved: true };
  }

  // Fix an alphanumeric field (document/personal number). Try confusion
  // substitutions at ambiguous positions, up to a small combinatorial cap.
  function fixAlnum(value, checkChar, maxPositions = 3) {
    if (valid(value, checkChar)) return { value, changed: false };

    const positions = [];
    for (let i = 0; i < value.length; i++) {
      const c = value[i];
      const alts = [];
      if (TO_DIGIT[c]) alts.push(TO_DIGIT[c]);
      if (TO_ALPHA[c]) alts.push(...TO_ALPHA[c]);
      if (alts.length) positions.push({ i, alts });
    }
    if (!positions.length || positions.length > 12) return { value, changed: false, unresolved: true };

    // Try combinations of up to maxPositions simultaneous substitutions.
    const limit = Math.min(maxPositions, positions.length);
    for (let k = 1; k <= limit; k++) {
      const combo = combinations(positions, k);
      for (const subset of combo) {
        const result = trySubset(value, subset);
        if (result && valid(result, checkChar)) return { value: result, changed: true };
      }
    }
    return { value, changed: false, unresolved: true };
  }

  function trySubset(value, subset) {
    // subset: array of {i, alts}; pick the FIRST alt for each (greedy, then
    // expanded by caller via combinations of alt choices when needed).
    const arr = value.split("");
    for (const p of subset) arr[p.i] = p.alts[0];
    return arr.join("");
  }

  function combinations(items, k) {
    const out = [];
    const rec = (start, acc) => {
      if (acc.length === k) { out.push(acc.slice()); return; }
      for (let i = start; i < items.length; i++) { acc.push(items[i]); rec(i + 1, acc); acc.pop(); }
    };
    rec(0, []);
    return out;
  }

  // Correct a TD3 second line in place, field by field, using each check digit.
  function correctTD3Line2(l2) {
    const corrections = [];
    const docNo = fixAlnum(l2.slice(0, 9), l2[9]);
    if (docNo.changed) corrections.push({ field: "documentNumber", from: l2.slice(0, 9), to: docNo.value });
    const dob = fixNumeric(l2.slice(13, 19), l2[19]);
    if (dob.changed) corrections.push({ field: "birthDate", from: l2.slice(13, 19), to: dob.value });
    const exp = fixNumeric(l2.slice(21, 27), l2[27]);
    if (exp.changed) corrections.push({ field: "expiryDate", from: l2.slice(21, 27), to: exp.value });

    const fixed =
      docNo.value + l2[9] + l2.slice(10, 13) + dob.value + l2[19] + l2[20] +
      exp.value + l2[27] + l2.slice(28);
    return { line2: fixed, corrections };
  }

  function countValid(checks) {
    return Object.values(checks).filter((c) => c.valid).length;
  }

  // From a long/contaminated OCR line, the MRZ is usually the leading or trailing
  // 44-char window; from a short line, pad it. Returns candidate 44-char strings.
  function candidates44(line) {
    const out = [];
    if (line.length > 44) {
      out.push(line.slice(0, 44));
      out.push(line.slice(-44));
    } else if (line.length >= 36) {
      out.push((line + "<".repeat(44)).slice(0, 44));
    }
    return out;
  }

  const FILLER_L1 = "P<XXX".padEnd(44, "<");

  // The data line (line 2) carries all the TD3 check digits, so identify it by
  // which candidate maximizes passing checks — noise lines can't fake checksums.
  // The name line (line 1) has NO check digit, so it cannot be found by checksum;
  // pick it by name-likeness (has "<<", mostly letters) and adjacency to line 2.
  function bestTD3(raw) {
    const lines = MRZ.toLines(raw);

    // --- line 2: best by its own checks ---
    let bestL2 = null, bestL2Score = -1;
    lines.forEach((l, idx) => {
      for (const c of candidates44(l)) {
        const corr = correctTD3Line2(c);
        let r;
        try { r = MRZ.parse(FILLER_L1 + "\n" + corr.line2); } catch (e) { continue; }
        if (!r.ok || r.record.format !== "TD3") continue;
        const score = countValid(r.record.checks);
        if (score > bestL2Score) {
          bestL2Score = score;
          bestL2 = { line2: corr.line2, corrections: corr.corrections, idx };
        }
      }
    });
    if (!bestL2) return null;

    // --- line 1: best name-like candidate, preferring the line just above line 2 ---
    // MRZ content is left-aligned, so the name is at the START of its line (use the
    // leading 44 chars, not a trailing window that could grab underprint letters).
    let bestL1 = null, bestL1Score = -Infinity;
    lines.forEach((l, idx) => {
      if (idx === bestL2.idx) return; // never reuse the data line as the name line
      if (l.length < 10) return;
      // Score on the RAW line so padding can't fabricate a "<<" separator.
      const hasSep = /<</.test(l) ? 30 : -100; // a name line must have the "<<" separator
      const letters = (l.match(/[A-Z]/g) || []).length;
      const digits = (l.match(/[0-9]/g) || []).length;
      const chevrons = (l.match(/</g) || []).length;
      const adjacent = idx === bestL2.idx - 1 ? 50 : 0;
      const score = hasSep + chevrons + letters * 0.5 - digits * 5 + adjacent;
      if (score > bestL1Score) {
        bestL1Score = score;
        bestL1 = l.length > 44 ? l.slice(0, 44) : l.padEnd(44, "<");
      }
    });

    const line1 = bestL1 || FILLER_L1;
    const r = MRZ.parse(line1 + "\n" + bestL2.line2);
    return { r, corrections: bestL2.corrections, line1, line2: bestL2.line2, l2Score: bestL2Score };
  }

  // Entry: parse with correction + tolerant MRZ-line discovery for noisy OCR text.
  function parseCorrected(raw) {
    const first = MRZ.parse(raw);
    if (first.ok && first.valid) return { ...first, corrected: false, corrections: [] };

    // Clean, length-tolerant path: detect the two MRZ lines among OCR noise and
    // identify them by which pair's checksums actually pass.
    const bp = bestTD3(raw);
    if (bp && bp.r.valid)
      return { ...bp.r, corrected: bp.corrections.length > 0, corrections: bp.corrections, recovered: "line-search" };

    // Legacy single-pair correction (helps when lines were already isolated).
    const lines = MRZ.toLines(raw).filter((l) => l.length >= 43 && l.length <= 45).slice(-2);
    if (lines.length === 2) {
      const l1 = (lines[0] + "<".repeat(44)).slice(0, 44);
      const { line2, corrections } = correctTD3Line2((lines[1] + "<".repeat(44)).slice(0, 44));
      if (corrections.length) {
        const reparsed = MRZ.parse(l1 + "\n" + line2);
        if (reparsed.valid) return { ...reparsed, corrected: true, corrections };
      }
    }

    // Confidence floor: only trust a partial read if the DATA line is genuinely
    // MRZ (enough check digits pass). Otherwise refuse — better "couldn't read"
    // than presenting a visual field as a confident name (data-as-asset honesty).
    const compositeOk = bp && bp.r.record.checks.composite && bp.r.record.checks.composite.valid;
    if (bp && (bp.l2Score >= 3 || compositeOk))
      return { ...bp.r, corrected: bp.corrections.length > 0, corrections: bp.corrections, recovered: "line-search-partial" };

    return { ok: false, reason: "No reliable MRZ found (checksums failed)", lines: MRZ.toLines(raw) };
  }

  const api = { fixNumeric, fixAlnum, correctTD3Line2, bestTD3, parseCorrected, TO_DIGIT, TO_ALPHA };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MRZCorrect = api;
})(typeof self !== "undefined" ? self : this);
