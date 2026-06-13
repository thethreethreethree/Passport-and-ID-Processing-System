// Run: node extension/lib/mappers.test.js
const MRZ = require("./mrz.js");
const M = require("./mappers.js");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log("  ok  " + name); }
  else { fail++; console.log("FAIL  " + name + (extra !== undefined ? "  => " + JSON.stringify(extra) : "")); }
}

// --- unit: mappers ---
check("FRA -> FR", M.nationalityToAlpha2("FRA").alpha2 === "FR");
check("DEU -> DE", M.nationalityToAlpha2("DEU").alpha2 === "DE");
check("GBR -> GB", M.nationalityToAlpha2("GBR").alpha2 === "GB");
check("D -> DE (German passport MRZ code)", M.nationalityToAlpha2("D").alpha2 === "DE");
check("RKS -> XK (Kosovo)", M.nationalityToAlpha2("RKS").alpha2 === "XK");
check("XXA -> null (stateless)", M.nationalityToAlpha2("XXA").alpha2 === null);
check("ZZZ -> null (unknown)", M.nationalityToAlpha2("ZZZ").ok === false);

check("sex F -> Female", M.sexToGender("F") === "Female");
check("sex M -> Male", M.sexToGender("M") === "Male");
check("sex X -> null", M.sexToGender("X") === null);
check("title F -> Miss", M.sexToTitle("F") === "Miss");
check("title M -> Mister", M.sexToTitle("M") === "Mister");

// DOB century inference (currentYear 2026)
check("DOB 020628 -> 06/28/2002", M.formatBirthDate("020628", { currentYear: 2026 }).value === "06/28/2002");
check("DOB 901231 -> 12/31/1990", M.formatBirthDate("901231", { currentYear: 2026 }).value === "12/31/1990");
check("DOB 271231 -> 12/31/1927 (future->prev century)", M.formatBirthDate("271231", { currentYear: 2026 }).value === "12/31/1927");
check("DOB bad -> not ok", M.formatBirthDate("0206").ok === false);

// --- integration: synthesize a checksum-valid FRA/F MRZ matching Alice, then plan ---
const cd = MRZ.checkDigit;
const docNum = "12AB34567";
const dob = "020628";
const exp = "300101";
const personal = "<".repeat(14);
const c1 = cd(docNum), c2 = cd(dob), c3 = cd(exp), c4 = cd(personal);
const composite = docNum + c1 + dob + c2 + exp + c3 + personal + c4;
const cc = cd(composite);
const line1 = ("P<FRAPEQUET<<ALICE" + "<".repeat(44)).slice(0, 44);
const line2 = docNum + c1 + "FRA" + dob + c2 + "F" + exp + c3 + personal + c4 + cc;
check("synthetic line2 length 44", line2.length === 44, line2.length);

const parsed = MRZ.parse(line1 + "\n" + line2);
check("synthetic MRZ valid checksums", parsed.ok && parsed.valid === true, parsed.record && parsed.record.checks);
check("parsed surname PEQUET", parsed.record.surname === "PEQUET", parsed.record.surname);
check("parsed given ALICE", parsed.record.givenNames.join(" ") === "ALICE", parsed.record.givenNames);

const plan = M.buildFillPlan(parsed.record, { currentYear: 2026 });
const byId = Object.fromEntries(plan.map((e) => [e.fieldId, e]));
check("plan firstName=ALICE", byId.firstName.value === "ALICE", byId.firstName);
check("plan lastName=PEQUET", byId.lastName.value === "PEQUET", byId.lastName);
check("plan nationality option=nationality-FR", byId.nationality.optionId === "nationality-FR", byId.nationality);
check("plan gender option=gender-Female", byId.gender.optionId === "gender-Female", byId.gender);
check("plan birthDate=06/28/2002", byId.birthDate.value === "06/28/2002", byId.birthDate);
check("plan title option=titlePrefix-Miss", byId.titlePrefix.optionId === "titlePrefix-Miss", byId.titlePrefix);
check("plan title confidence low", byId.titlePrefix.confidence === "low");
check("birthCountry assumed = nationality (birthCountry-FR)", byId.birthCountry.optionId === "birthCountry-FR" && byId.birthCountry.source === "derived", byId.birthCountry);
check("birthCountry confidence low (derived)", byId.birthCountry.confidence === "low");
check("birthPlace flagged manual/ocr", byId.birthPlace.source === "ocr-visual");

// Confidence honesty: when MRZ checksums FAIL, names drop to low (never checksum-
// covered) while DOB-validated data-line fields can stay high.
const partialRec = {
  surname: "X", givenNames: ["Y"], nationality: "FRA", birthDate: "020628", sex: "F",
  checks: {
    documentNumber: { valid: false }, birthDate: { valid: true }, expiryDate: { valid: true },
    personalNumber: { valid: true }, composite: { valid: false },
  },
};
const pp = Object.fromEntries(M.buildFillPlan(partialRec, { currentYear: 2026 }).map((e) => [e.fieldId, e]));
check("failed-checksum: lastName downgraded to low", pp.lastName.confidence === "low", pp.lastName.confidence);
check("failed-checksum: firstName downgraded to low", pp.firstName.confidence === "low", pp.firstName.confidence);
check("failed-checksum: DOB-aligned nationality stays high", pp.nationality.confidence === "high", pp.nationality.confidence);
check("failed-checksum: birthDate stays high (own check valid)", pp.birthDate.confidence === "high", pp.birthDate.confidence);
// Fully valid record keeps names high.
const goodRec = { ...partialRec, checks: { documentNumber: { valid: true }, birthDate: { valid: true }, expiryDate: { valid: true }, personalNumber: { valid: true }, composite: { valid: true } } };
const gp = Object.fromEntries(M.buildFillPlan(goodRec, { currentYear: 2026 }).map((e) => [e.fieldId, e]));
check("valid record: lastName stays high", gp.lastName.confidence === "high", gp.lastName.confidence);
check("secondLastName flagged manual", byId.secondLastName.confidence === "manual");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
