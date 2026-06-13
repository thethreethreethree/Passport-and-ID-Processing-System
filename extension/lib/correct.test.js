// Run: node extension/lib/correct.test.js
const MRZ = require("./mrz.js");
const C = require("./correct.js");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log("  ok  " + name); }
  else { fail++; console.log("FAIL  " + name + (extra !== undefined ? "  => " + JSON.stringify(extra) : "")); }
}

// Build a known-valid Alice TD3 MRZ.
const cd = MRZ.checkDigit;
const docNum = "12AB34567", dob = "020628", exp = "300101", personal = "<".repeat(14);
const c1 = cd(docNum), c2 = cd(dob), c3 = cd(exp), c4 = cd(personal);
const composite = docNum + c1 + dob + c2 + exp + c3 + personal + c4, cc = cd(composite);
const line1 = ("P<FRAPEQUET<<ALICE" + "<".repeat(44)).slice(0, 44);
const line2 = docNum + c1 + "FRA" + dob + c2 + "F" + exp + c3 + personal + c4 + cc;

function setChar(s, i, ch) { return s.slice(0, i) + ch + s.slice(i + 1); }

// Clean parse should pass straight through, no correction.
const clean = C.parseCorrected(line1 + "\n" + line2);
check("clean parse valid, not corrected", clean.valid && clean.corrected === false);

// Corrupt DOB: position 13 '0' -> 'O' (classic OCR error).
let bad = setChar(line2, 13, "O");
let r = C.parseCorrected(line1 + "\n" + bad);
check("DOB O->0 recovered to valid", r.valid === true, r.corrections);
check("DOB value back to 020628", r.record && r.record.birthDate === "020628", r.record && r.record.birthDate);
check("DOB correction reported", r.corrected && r.corrections.some((x) => x.field === "birthDate"));

// Corrupt document number: position 3 'B' -> '8'.
bad = setChar(line2, 3, "8");
r = C.parseCorrected(line1 + "\n" + bad);
check("docNumber 8->B recovered to valid", r.valid === true, r.corrections);
check("docNumber back to 12AB34567", r.record && r.record.documentNumber === "12AB34567", r.record && r.record.documentNumber);

// Corrupt two fields at once: DOB and expiry.
bad = setChar(line2, 13, "O");        // DOB 0->O
bad = setChar(bad, 21, "E");          // expiry '3'->? use a non-mappable to test single-pos search: 'E' won't map
// Use a mappable confusion instead: expiry pos 21 '3' stays; corrupt pos 22 '0'->'O'
bad = setChar(line2, 13, "O");
bad = setChar(bad, 22, "O");
r = C.parseCorrected(line1 + "\n" + bad);
check("two-field (DOB+expiry) recovered", r.valid === true, r.corrections);

// Unit: fixNumeric directly.
check("fixNumeric O2O628 -> 020628", C.fixNumeric("O2O628", String(cd("020628"))).value === "020628");
check("fixNumeric already-valid unchanged", C.fixNumeric("020628", String(cd("020628"))).changed === false);

// Line-search: MRZ lines buried in visual-field noise + trailing underprint contamination
// (the real failure mode from a German passport OCR dump).
const sayar1 = "P<D<<SAYAR<<AHMET<ALI" + "<".repeat(23);
const sayar2 = "C5L80V3PY7D<<9008157M2912224<<<<<<<<<<<<<<<8";
const noisy = [
  "REPUBLICOFGERMANY",
  "REISEPASS",
  "MAINZ",
  "150819901",
  sayar1 + "BUNDESREPUBLIKDEUTSCHLAND",        // line1 + underprint
  "DEUTSCHLANDBUNDESREPUBLIKDEUTSCHLAND",
  sayar2 + "DEUTSCHLAND",                       // line2 + underprint
  "CC",
].join("\n");
const rs = C.parseCorrected(noisy);
check("line-search recovers valid MRZ from noise", rs.ok && rs.valid === true, rs.recovered);
check("line-search surname SAYAR", rs.record && rs.record.surname === "SAYAR", rs.record && rs.record.surname);
check("line-search given AHMET ALI", rs.record && rs.record.givenNames.join(" ") === "AHMET ALI", rs.record && rs.record.givenNames);
check("line-search dob 900815", rs.record && rs.record.birthDate === "900815", rs.record && rs.record.birthDate);
check("line-search sex M", rs.record && rs.record.sex === "M");
check("line-search tagged recovered", rs.recovered === "line-search");

// Real OCR dump from a German passport (MRZ model) — hologram garbles the name
// line and there are visual-field noise lines. The data line must be found and the
// name line must be the SAYAR line, NOT a random noise line (the bug we fixed).
const realDump = [
  "EF0022SS9EBE60L",
  "NW4B2AUSSHNNGSEUDA08GGBSD20F0PIY1000000G106SRA",
  "3LGE24OFISSU07D40J6IVFRCED047XPIFNJINBSJ8IGAU6OFD2EFN",
  "E9E23L12L201922L12L2029SQN8UEJI21102FSEREIM000",
  "JG08R41GBARAT6EPEB",
  "GABEEGEJSTADTGROB<GERAU0",
  "ER<D<<SAYCC<<AMMET<ALI<<<<<<<<<<<<<<<<5<C",
  "EM45L80V3PY7D<<9008157M2912224<<<<<<<<<<<<<<<8",
].join("\n");
const rd = C.parseCorrected(realDump);
check("real dump: nationality D extracted", rd.record && rd.record.nationality === "D", rd.record && rd.record.nationality);
check("real dump: sex M extracted", rd.record && rd.record.sex === "M", rd.record && rd.record.sex);
check("real dump: DOB 900815 extracted", rd.record && rd.record.birthDate === "900815", rd.record && rd.record.birthDate);
check("real dump: name line is SAYAR-ish, not noise", rd.record && /^SAY/.test(rd.record.surname), rd.record && rd.record.surname);
check("real dump: NOT the garbage surname", rd.record && rd.record.surname !== "AUSSHNNGSEUDA08GGBSD20F0PIY1000000G106S", rd.record && rd.record.surname);

// Confidence floor: a crop that cut off the data line (only fragments) must be
// REFUSED, not presented as a confident (wrong) read. This was a real regression:
// a visual field ("STADT GROSS-GERAU") got labelled high-confidence last name.
const cutoff = [
  "ALJZD0L14<49Y172TT00000",
  "ML946BR6AUORYAULR6BBNFA44<ZBR",
  "FAHELLRSTADTGROB<GERAUTB",
  "E2<0<<<AYAR<<RRET<RLI<<<<<<<<<<T7000I",
  "BR<006R2220",
].join("\n");
const co = C.parseCorrected(cutoff);
check("cut-off data line is refused (ok:false)", co.ok === false, co.record && co.record.surname);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
