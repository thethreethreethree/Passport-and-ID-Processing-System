// Philippine ID parser — extracts fields from the VISUAL OCR text of PH IDs that
// have no MRZ: LTO driver's license, PhilID (national ID), PRC professional ID.
// Unlike the MRZ there are no checksums, so every field is "review me". Pure +
// deterministic. Browser (window.IDParse) + Node (module.exports).
(function (root) {
  "use strict";

  const MONTHS = {
    JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, MAY: 5, JUNE: 6,
    JULY: 7, AUGUST: 8, SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12,
    JAN: 1, FEB: 2, MAR: 3, APR: 4, JUN: 6, JUL: 7, AUG: 8, SEP: 9, SEPT: 9, OCT: 10, NOV: 11, DEC: 12,
  };

  const lines = (text) => String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  const stripLead = (s) => (s || "").replace(/^[\s:>►▶|/\-]+/, "").trim();

  // MM/DD/YYYY from many input formats.
  function parseDate(s) {
    if (!s) return null;
    s = clean(s);
    let m;
    if ((m = s.match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/))) return fmt(m[2], m[3], m[1]); // YYYY/MM/DD
    if ((m = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/))) return fmt(m[1], m[2], m[3]); // MM/DD/YYYY
    if ((m = s.toUpperCase().match(/([A-Z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/)) && MONTHS[m[1]])
      return fmt(MONTHS[m[1]], m[2], m[3]); // MONTH DD, YYYY
    return null;
  }
  function fmt(mm, dd, yyyy) {
    return String(+mm).padStart(2, "0") + "/" + String(+dd).padStart(2, "0") + "/" + yyyy;
  }

  // Value associated with a label: text after the label on the same line, else the
  // next non-empty line. `labelRe` should match the label text.
  function valueFor(L, labelRe) {
    for (let i = 0; i < L.length; i++) {
      const m = L[i].match(labelRe);
      if (m) {
        const same = stripLead(L[i].slice(m.index + m[0].length));
        if (same) return same;
        if (L[i + 1]) return stripLead(L[i + 1]);
      }
    }
    return null;
  }

  function detectType(text) {
    const t = (text || "").toUpperCase();
    if (/LAND TRANSPORTATION|DRIVER.?S LICENSE/.test(t)) return "lto-license";
    if (/PAGKAKAKILANLAN|PHILIPPINE IDENTIFICATION|PHILSYS|PAMBANSANG/.test(t)) return "philid";
    if (/PROFESSIONAL REGULATION|PROFESSIONAL IDENTIFICATION|REGISTRATION NO/.test(t)) return "prc-id";
    return null;
  }

  // Split a Filipino "SURNAME, FIRST MIDDLE" name into parts.
  function splitNameComma(s) {
    const parts = clean(s).split(",");
    const surname = clean(parts[0] || "");
    const rest = clean(parts.slice(1).join(",")).split(/\s+/).filter(Boolean);
    return { surname, firstName: rest[0] || "", middleName: rest.slice(1).join(" ") };
  }

  function parseLTO(text) {
    const L = lines(text);
    const upper = text.toUpperCase();

    const nameLine = valueFor(L, /Middle Name/i); // line under "Last Name. First Name. Middle Name"
    const name = nameLine ? splitNameComma(nameLine) : { surname: "", firstName: "", middleName: "" };

    // Value row "PHL M 1996/11/03 57 1.57"
    const valRow = L.find((l) => /^[A-Z]{3}\s+[MFX]\s+\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/.test(l)) || "";
    const vt = valRow.split(/\s+/);
    const nationality = vt[0] || (/(\bPHL\b)/.test(upper) ? "PHL" : null);
    const sex = vt[1] || null;
    const birthDate = parseDate(vt[2]) || parseDate(valueFor(L, /Date of Birth/i));

    const licNo = (upper.match(/\b([A-Z]\d{2}-\d{2}-\d{6})\b/) || [])[1] || stripLead(valueFor(L, /License No/i) || "");
    // License-no row "D56-25-002138 2029/11/03 D56" → expiry is the date in it.
    const licRow = L.find((l) => /[A-Z]\d{2}-\d{2}-\d{6}/.test(l)) || "";
    const expiry = parseDate((licRow.match(/\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/) || [])[0]) || parseDate(valueFor(L, /Expiration Date/i));
    const address = valueFor(L, /Address/i);

    return {
      docType: "lto-license", documentLabel: "Driver's license",
      surname: name.surname, firstName: name.firstName, middleName: name.middleName,
      nationality: nationality && /PHL|PHILIPPINE/i.test(nationality) ? "PHL" : nationality,
      sex: sex ? sex.toUpperCase() : null,
      birthDate, documentNumber: licNo || null, expiry, address: address || null,
    };
  }

  function parsePhilID(text) {
    const L = lines(text);
    const upper = text.toUpperCase();
    const pcn = (upper.match(/\b(\d{4}-\d{4}-\d{4}-\d{4})\b/) || [])[1] || null;
    return {
      docType: "philid", documentLabel: "National ID",
      surname: valueFor(L, /Last Name/i),
      firstName: valueFor(L, /Given Names?/i),
      middleName: valueFor(L, /Middle Name/i),
      nationality: "PHL",
      sex: null, // not reliably on the PhilID front
      birthDate: parseDate(valueFor(L, /Date of Birth/i)),
      documentNumber: pcn,
      expiry: null, // PhilID has no expiry
      address: valueFor(L, /Address/i),
    };
  }

  function parsePRC(text) {
    const L = lines(text);
    return {
      docType: "prc-id", documentLabel: "PRC ID",
      surname: valueFor(L, /LAST NAME/i),
      firstName: valueFor(L, /FIRST NAME/i),
      middleName: valueFor(L, /MIDDLE NAME/i),
      nationality: "PHL",
      sex: null,
      birthDate: null, // PRC ID has no DOB
      documentNumber: valueFor(L, /REGISTRATION NO/i),
      expiry: parseDate(valueFor(L, /VALID UNTIL/i)),
      address: null,
    };
  }

  // Parse any supported PH ID from its OCR text. Returns { ok, type, record } or
  // { ok:false } if the type isn't recognised.
  function parse(text) {
    const type = detectType(text);
    if (type === "lto-license") return { ok: true, type, record: parseLTO(text) };
    if (type === "philid") return { ok: true, type, record: parsePhilID(text) };
    if (type === "prc-id") return { ok: true, type, record: parsePRC(text) };
    return { ok: false, reason: "unrecognised ID type", type: null };
  }

  const api = { parse, detectType, parseDate, parseLTO, parsePhilID, parsePRC, splitNameComma, valueFor };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.IDParse = api;
})(typeof self !== "undefined" ? self : this);
