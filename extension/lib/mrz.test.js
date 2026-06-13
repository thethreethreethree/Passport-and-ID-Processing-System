// Run: node extension/lib/mrz.test.js
const MRZ = require("./mrz.js");

let pass = 0,
  fail = 0;
function check(name, cond, extra) {
  if (cond) {
    pass++;
    console.log("  ok  " + name);
  } else {
    fail++;
    console.log("FAIL  " + name + (extra ? "  => " + JSON.stringify(extra) : ""));
  }
}

// --- ICAO Doc 9303 TD3 reference specimen (known-good checksums) ---
const td3 =
  "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<\n" +
  "L898902C36UTO7408122F1204159ZE184226B<<<<<10";
const r = MRZ.parse(td3);
check("TD3 parses", r.ok && r.record.format === "TD3");
check("TD3 surname", r.record.surname === "ERIKSSON", r.record.surname);
check("TD3 given names", r.record.givenNames.join(" ") === "ANNA MARIA", r.record.givenNames);
check("TD3 issuing state", r.record.issuingState === "UTO", r.record.issuingState);
check("TD3 nationality", r.record.nationality === "UTO", r.record.nationality);
check("TD3 doc number", r.record.documentNumber === "L898902C3", r.record.documentNumber);
check("TD3 birthDate", r.record.birthDate === "740812", r.record.birthDate);
check("TD3 sex", r.record.sex === "F", r.record.sex);
check("TD3 expiry", r.record.expiryDate === "120415", r.record.expiryDate);
check("TD3 docNumber check valid", r.record.checks.documentNumber.valid, r.record.checks.documentNumber);
check("TD3 birthDate check valid", r.record.checks.birthDate.valid, r.record.checks.birthDate);
check("TD3 expiry check valid", r.record.checks.expiryDate.valid, r.record.checks.expiryDate);
check("TD3 composite check valid", r.record.checks.composite.valid, r.record.checks.composite);
check("TD3 overall valid", r.valid === true);

// --- TD1 reference specimen (ICAO 9303 Part 5) ---
const td1 =
  "I<UTOD231458907<<<<<<<<<<<<<<<\n" +
  "7408122F1204159UTO<<<<<<<<<<<6\n" +
  "ERIKSSON<<ANNA<MARIA<<<<<<<<<<";
const r1 = MRZ.parse(td1);
check("TD1 parses", r1.ok && r1.record.format === "TD1");
check("TD1 surname", r1.record.surname === "ERIKSSON", r1.record.surname);
check("TD1 nationality", r1.record.nationality === "UTO", r1.record.nationality);
check("TD1 birthDate", r1.record.birthDate === "740812", r1.record.birthDate);
check("TD1 sex", r1.record.sex === "F", r1.record.sex);

// --- Check-digit unit (ICAO worked example: "520727" -> 3) ---
check("checkDigit 520727 == 3", MRZ.checkDigit("520727") === 3, MRZ.checkDigit("520727"));
check("checkDigit AB2134<<<...", MRZ.checkDigit("AB2134") !== null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
