// MRZ parser — ICAO 9303 TD3 (passport, 2×44), TD1 (ID card, 3×30), TD2 (2×36).
// Pure, deterministic, no DOM/OCR. Returns a structured record + checksum validity.
// Works in both the browser (window.MRZ) and Node (module.exports).
(function (root) {
  "use strict";

  // Char value for check-digit math: 0-9 => 0-9, A-Z => 10-35, '<' => 0.
  function charValue(c) {
    if (c >= "0" && c <= "9") return c.charCodeAt(0) - 48;
    if (c >= "A" && c <= "Z") return c.charCodeAt(0) - 55;
    if (c === "<") return 0;
    return NaN; // invalid char
  }

  // ICAO check digit: weights cycle 7,3,1.
  function checkDigit(str) {
    const weights = [7, 3, 1];
    let sum = 0;
    for (let i = 0; i < str.length; i++) {
      const v = charValue(str[i]);
      if (Number.isNaN(v)) return null;
      sum += v * weights[i % 3];
    }
    return sum % 10;
  }

  // Validate a field against its trailing check digit char.
  function checkField(value, checkChar) {
    const expected = checkDigit(value);
    const actual = checkChar === "<" ? 0 : parseInt(checkChar, 10);
    return { value, checkChar, expected, valid: expected !== null && expected === actual };
  }

  // Split an MRZ name field ("SURNAME<<GIVEN<NAMES") into parts.
  function parseName(field) {
    const [surnameRaw, givenRaw = ""] = field.split("<<");
    const surname = surnameRaw.replace(/<+/g, " ").trim();
    const givenNames = givenRaw
      .replace(/<+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return { surname, givenNames };
  }

  function normSex(c) {
    if (c === "M") return "M";
    if (c === "F") return "F";
    return "X"; // '<' or anything else => unspecified
  }

  function cleanCode(s) {
    return (s || "").replace(/</g, "").trim();
  }

  // Normalize raw OCR text into candidate MRZ lines (uppercase, MRZ charset only).
  function toLines(raw) {
    return String(raw)
      .toUpperCase()
      .split(/\r?\n/)
      .map((l) => l.replace(/[^A-Z0-9<]/g, ""))
      .filter((l) => l.length > 0);
  }

  function parseTD3(l1, l2) {
    const documentCode = cleanCode(l1.slice(0, 2));
    const issuingState = cleanCode(l1.slice(2, 5));
    const name = parseName(l1.slice(5, 44));

    const documentNumber = checkField(l2.slice(0, 9), l2[9]);
    const nationality = cleanCode(l2.slice(10, 13));
    const birthDate = checkField(l2.slice(13, 19), l2[19]);
    const sex = normSex(l2[20]);
    const expiryDate = checkField(l2.slice(21, 27), l2[27]);
    const personalNumber = checkField(l2.slice(28, 42), l2[42]);

    // Composite check spans the variable fields + their check digits.
    const composite =
      l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 28) + l2.slice(28, 43);
    const compositeCheck = checkField(composite, l2[43]);

    return {
      format: "TD3",
      documentCode,
      issuingState,
      surname: name.surname,
      givenNames: name.givenNames,
      documentNumber: cleanCode(documentNumber.value),
      nationality,
      birthDate: birthDate.value,
      sex,
      expiryDate: expiryDate.value,
      personalNumber: cleanCode(personalNumber.value),
      checks: { documentNumber, birthDate, expiryDate, personalNumber, composite: compositeCheck },
    };
  }

  function parseTD1(l1, l2, l3) {
    const documentCode = cleanCode(l1.slice(0, 2));
    const issuingState = cleanCode(l1.slice(2, 5));
    const documentNumber = checkField(l1.slice(5, 14), l1[14]);
    const optional1 = l1.slice(15, 30);

    const birthDate = checkField(l2.slice(0, 6), l2[6]);
    const sex = normSex(l2[7]);
    const expiryDate = checkField(l2.slice(8, 14), l2[14]);
    const nationality = cleanCode(l2.slice(15, 18));

    const composite =
      l1.slice(5, 30) + l2.slice(0, 7) + l2.slice(8, 15) + l2.slice(18, 29);
    const compositeCheck = checkField(composite, l2[29]);

    const name = parseName(l3.slice(0, 30));

    return {
      format: "TD1",
      documentCode,
      issuingState,
      surname: name.surname,
      givenNames: name.givenNames,
      documentNumber: cleanCode(documentNumber.value),
      nationality,
      birthDate: birthDate.value,
      sex,
      expiryDate: expiryDate.value,
      optionalData: cleanCode(optional1),
      checks: { documentNumber, birthDate, expiryDate, composite: compositeCheck },
    };
  }

  function parseTD2(l1, l2) {
    const documentCode = cleanCode(l1.slice(0, 2));
    const issuingState = cleanCode(l1.slice(2, 5));
    const name = parseName(l1.slice(5, 36));

    const documentNumber = checkField(l2.slice(0, 9), l2[9]);
    const nationality = cleanCode(l2.slice(10, 13));
    const birthDate = checkField(l2.slice(13, 19), l2[19]);
    const sex = normSex(l2[20]);
    const expiryDate = checkField(l2.slice(21, 27), l2[27]);

    const composite =
      l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 28) + l2.slice(28, 35);
    const compositeCheck = checkField(composite, l2[35]);

    return {
      format: "TD2",
      documentCode,
      issuingState,
      surname: name.surname,
      givenNames: name.givenNames,
      documentNumber: cleanCode(documentNumber.value),
      nationality,
      birthDate: birthDate.value,
      sex,
      expiryDate: expiryDate.value,
      checks: { documentNumber, birthDate, expiryDate, composite: compositeCheck },
    };
  }

  // Main entry: accept raw OCR text OR already-clean lines; detect format; parse.
  function parse(raw) {
    const all = toLines(raw);
    // Pick the trailing lines that look like MRZ (consistent length, mostly fillers/caps).
    const td3 = all.filter((l) => l.length >= 43 && l.length <= 45).slice(-2);
    const td2 = all.filter((l) => l.length >= 35 && l.length <= 37).slice(-2);
    const td1 = all.filter((l) => l.length >= 29 && l.length <= 31).slice(-3);

    let result = null;
    if (td3.length === 2) result = parseTD3(pad(td3[0], 44), pad(td3[1], 44));
    else if (td1.length === 3) result = parseTD1(pad(td1[0], 30), pad(td1[1], 30), pad(td1[2], 30));
    else if (td2.length === 2) result = parseTD2(pad(td2[0], 36), pad(td2[1], 36));

    if (!result) return { ok: false, reason: "No MRZ lines detected", lines: all };

    const checks = result.checks;
    const valid = Object.values(checks).every((c) => c.valid);
    return { ok: true, valid, record: result };
  }

  function pad(s, n) {
    return (s + "<".repeat(n)).slice(0, n);
  }

  const api = { parse, checkDigit, checkField, parseName, parseTD3, parseTD1, parseTD2, toLines };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MRZ = api;
})(typeof self !== "undefined" ? self : this);
