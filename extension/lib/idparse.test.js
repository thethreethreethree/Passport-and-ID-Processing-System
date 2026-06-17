// Run: node extension/lib/idparse.test.js
const ID = require("./idparse.js");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log("  ok  " + name); }
  else { fail++; console.log("FAIL  " + name + (extra !== undefined ? "  => " + JSON.stringify(extra) : "")); }
}

// Idealised OCR text of the LTO driver's license sample (DAGOT, BENZON MAGURA).
const lto = [
  "REPUBLIC OF THE PHILIPPINES",
  "DEPARTMENT OF TRANSPORTATION",
  "LAND TRANSPORTATION OFFICE",
  "DRIVER'S LICENSE",
  "Last Name. First Name. Middle Name",
  "DAGOT, BENZON MAGURA",
  "Nationality Sex Date of Birth Weight (kg) Height(m)",
  "PHL M 1996/11/03 57 1.57",
  "Address",
  "-, SIBALTAN, EL NIDO (BACUIT), PALAWAN, 5313",
  "License No. Expiration Date Agency Code",
  "D56-25-002138 2029/11/03 D56",
  "Blood Type Eyes Color",
  "A+ BROWN",
  "DL Codes Conditions",
  "A,A1 NONE",
].join("\n");

const r = ID.parse(lto);
check("LTO detected", r.ok && r.type === "lto-license", r.type);
const rec = r.record || {};
check("LTO surname DAGOT", rec.surname === "DAGOT", rec.surname);
check("LTO first BENZON", rec.firstName === "BENZON", rec.firstName);
check("LTO middle MAGURA", rec.middleName === "MAGURA", rec.middleName);
check("LTO nationality PHL", rec.nationality === "PHL", rec.nationality);
check("LTO sex M", rec.sex === "M", rec.sex);
check("LTO DOB 11/03/1996", rec.birthDate === "11/03/1996", rec.birthDate);
check("LTO licence no D56-25-002138", rec.documentNumber === "D56-25-002138", rec.documentNumber);
check("LTO expiry 11/03/2029", rec.expiry === "11/03/2029", rec.expiry);
check("LTO address present", /SIBALTAN/.test(rec.address || ""), rec.address);

// Date parser variants
check("date YYYY/MM/DD", ID.parseDate("1996/11/03") === "11/03/1996");
check("date MONTH DD, YYYY", ID.parseDate("JANUARY 01, 1990") === "01/01/1990");
check("date MM/DD/YYYY", ID.parseDate("01/01/2026") === "01/01/2026");

// Name splitter
const n = ID.splitNameComma("DAGOT, BENZON MAGURA");
check("split surname/first/middle", n.surname === "DAGOT" && n.firstName === "BENZON" && n.middleName === "MAGURA", n);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
