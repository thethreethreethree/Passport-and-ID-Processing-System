// Mappers — turn a parsed MRZ record into a Mews fill plan.
// Pure/deterministic. Browser (window.Mappers) + Node (module.exports).
// Mapping vocabularies come from the captured recon (see FIELD-MAP.md).
(function (root) {
  "use strict";

  // ISO 3166-1 alpha-3 -> alpha-2 (Mews combobox values are alpha-2).
  const A3_A2 = {
    ABW:"AW",AFG:"AF",AGO:"AO",AIA:"AI",ALA:"AX",ALB:"AL",AND:"AD",ARE:"AE",ARG:"AR",ARM:"AM",
    ASM:"AS",ATA:"AQ",ATF:"TF",ATG:"AG",AUS:"AU",AUT:"AT",AZE:"AZ",BDI:"BI",BEL:"BE",BEN:"BJ",
    BES:"BQ",BFA:"BF",BGD:"BD",BGR:"BG",BHR:"BH",BHS:"BS",BIH:"BA",BLM:"BL",BLR:"BY",BLZ:"BZ",
    BMU:"BM",BOL:"BO",BRA:"BR",BRB:"BB",BRN:"BN",BTN:"BT",BVT:"BV",BWA:"BW",CAF:"CF",CAN:"CA",
    CCK:"CC",CHE:"CH",CHL:"CL",CHN:"CN",CIV:"CI",CMR:"CM",COD:"CD",COG:"CG",COK:"CK",COL:"CO",
    COM:"KM",CPV:"CV",CRI:"CR",CUB:"CU",CUW:"CW",CXR:"CX",CYM:"KY",CYP:"CY",CZE:"CZ",DEU:"DE",
    DJI:"DJ",DMA:"DM",DNK:"DK",DOM:"DO",DZA:"DZ",ECU:"EC",EGY:"EG",ERI:"ER",ESH:"EH",ESP:"ES",
    EST:"EE",ETH:"ET",FIN:"FI",FJI:"FJ",FLK:"FK",FRA:"FR",FRO:"FO",FSM:"FM",GAB:"GA",GBR:"GB",
    GEO:"GE",GGY:"GG",GHA:"GH",GIB:"GI",GIN:"GN",GLP:"GP",GMB:"GM",GNB:"GW",GNQ:"GQ",GRC:"GR",
    GRD:"GD",GRL:"GL",GTM:"GT",GUF:"GF",GUM:"GU",GUY:"GY",HKG:"HK",HMD:"HM",HND:"HN",HRV:"HR",
    HTI:"HT",HUN:"HU",IDN:"ID",IMN:"IM",IND:"IN",IOT:"IO",IRL:"IE",IRN:"IR",IRQ:"IQ",ISL:"IS",
    ISR:"IL",ITA:"IT",JAM:"JM",JEY:"JE",JOR:"JO",JPN:"JP",KAZ:"KZ",KEN:"KE",KGZ:"KG",KHM:"KH",
    KIR:"KI",KNA:"KN",KOR:"KR",KWT:"KW",LAO:"LA",LBN:"LB",LBR:"LR",LBY:"LY",LCA:"LC",LIE:"LI",
    LKA:"LK",LSO:"LS",LTU:"LT",LUX:"LU",LVA:"LV",MAC:"MO",MAF:"MF",MAR:"MA",MCO:"MC",MDA:"MD",
    MDG:"MG",MDV:"MV",MEX:"MX",MHL:"MH",MKD:"MK",MLI:"ML",MLT:"MT",MMR:"MM",MNE:"ME",MNG:"MN",
    MNP:"MP",MOZ:"MZ",MRT:"MR",MSR:"MS",MTQ:"MQ",MUS:"MU",MWI:"MW",MYS:"MY",MYT:"YT",NAM:"NA",
    NCL:"NC",NER:"NE",NFK:"NF",NGA:"NG",NIC:"NI",NIU:"NU",NLD:"NL",NOR:"NO",NPL:"NP",NRU:"NR",
    NZL:"NZ",OMN:"OM",PAK:"PK",PAN:"PA",PCN:"PN",PER:"PE",PHL:"PH",PLW:"PW",PNG:"PG",POL:"PL",
    PRI:"PR",PRK:"KP",PRT:"PT",PRY:"PY",PSE:"PS",PYF:"PF",QAT:"QA",REU:"RE",ROU:"RO",RUS:"RU",
    RWA:"RW",SAU:"SA",SDN:"SD",SEN:"SN",SGP:"SG",SGS:"GS",SHN:"SH",SJM:"SJ",SLB:"SB",SLE:"SL",
    SLV:"SV",SMR:"SM",SOM:"SO",SPM:"PM",SRB:"RS",SSD:"SS",STP:"ST",SUR:"SR",SVK:"SK",SVN:"SI",
    SWE:"SE",SWZ:"SZ",SXM:"SX",SYC:"SC",SYR:"SY",TCA:"TC",TCD:"TD",TGO:"TG",THA:"TH",TJK:"TJ",
    TKL:"TK",TKM:"TM",TLS:"TL",TON:"TO",TTO:"TT",TUN:"TN",TUR:"TR",TUV:"TV",TWN:"TW",TZA:"TZ",
    UGA:"UG",UKR:"UA",UMI:"UM",URY:"UY",USA:"US",UZB:"UZ",VAT:"VA",VCT:"VC",VEN:"VE",VGB:"VG",
    VIR:"VI",VNM:"VN",VUT:"VU",WLF:"WF",WSM:"WS",YEM:"YE",ZAF:"ZA",ZMB:"ZM",ZWE:"ZW",
    // MRZ-specific / non-ISO codes seen on travel documents:
    D:"DE",            // Germany uses "D" in the MRZ, not "DEU"
    RKS:"XK",          // Kosovo (Mews value XK)
    GBD:"GB",GBN:"GB",GBO:"GB",GBP:"GB",GBS:"GB", // British subsets -> GB
  };

  // Codes that are valid MRZ but have no single country (stateless/UN/etc).
  const NON_COUNTRY = new Set(["XXA","XXB","XXC","XXX","UNO","UNA","UNK","EUE","RKO"]);

  function nationalityToAlpha2(alpha3) {
    const code = (alpha3 || "").toUpperCase().replace(/</g, "");
    if (A3_A2[code]) return { alpha2: A3_A2[code], ok: true };
    if (NON_COUNTRY.has(code)) return { alpha2: null, ok: false, reason: "non-country code (" + code + ")" };
    return { alpha2: null, ok: false, reason: "unknown alpha-3 (" + code + ")" };
  }

  function sexToGender(sex) {
    if (sex === "M") return "Male";
    if (sex === "F") return "Female";
    return null; // X / unspecified -> leave blank
  }

  // Title is a low-confidence derivation (marital status is NOT on a passport).
  function sexToTitle(sex) {
    if (sex === "M") return "Mister"; // Mr.
    if (sex === "F") return "Miss"; // Ms. (neutral default; value id is "Miss")
    return null;
  }

  // YYMMDD (no century) -> target format, inferring century so the date isn't
  // in the future (standard MRZ DOB rule). `format` default matches observed Mews value.
  function formatBirthDate(yymmdd, opts) {
    opts = opts || {};
    const m = /^(\d{2})(\d{2})(\d{2})$/.exec(yymmdd || "");
    if (!m) return { ok: false, reason: "bad DOB digits (" + yymmdd + ")" };
    const yy = +m[1], mm = +m[2], dd = +m[3];
    const currentYear = opts.currentYear || 2026;
    let year = 2000 + yy;
    if (year > currentYear) year = 1900 + yy; // future -> previous century
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31)
      return { ok: false, reason: "invalid month/day", year, mm, dd };
    const fmt = opts.format || "MM/DD/YYYY";
    const out = fmt
      .replace("YYYY", String(year))
      .replace("MM", String(mm).padStart(2, "0"))
      .replace("DD", String(dd).padStart(2, "0"));
    return { ok: true, value: out, year, month: mm, day: dd };
  }

  // Build the ordered fill plan consumed by Stage D.
  // Each entry: { fieldId, kind, value, optionId?, confidence, source, note? }
  function buildFillPlan(record, opts) {
    opts = opts || {};
    const plan = [];
    const add = (e) => plan.push(e);

    // Confidence must track checksum validity. Names are NEVER covered by an MRZ
    // check digit, so they're "high" only when the WHOLE read validates; data-line
    // fields (nationality/sex/DOB) lean on the DOB check as an alignment proxy.
    const chk = record.checks || null;
    const ck = (name) => !chk || (chk[name] && chk[name].valid);
    const dobOk = ck("birthDate");
    const allOk = !chk || Object.values(chk).every((c) => c.valid);
    const nameConf = allOk ? "high" : "low";
    const dataConf = dobOk ? "high" : "low";

    // Names (MRZ). Mews has no clean second-surname source in MRZ.
    const given = (record.givenNames || []).join(" ");
    add({
      fieldId: "firstName", kind: "text", value: given,
      confidence: given ? nameConf : "low", source: "mrz",
      note: given ? (allOk ? undefined : "checksums failed — verify against the document") : "no given names in MRZ",
    });
    add({
      fieldId: "lastName", kind: "text", value: record.surname || "",
      confidence: record.surname ? nameConf : "low", source: "mrz",
      note: record.surname ? (allOk ? undefined : "checksums failed — verify against the document") : "no surname in MRZ",
    });
    add({
      fieldId: "secondLastName", kind: "text", value: "",
      confidence: "manual", source: "none",
      note: "not derivable from MRZ; fill only if a second surname is visible on the document",
    });

    // Nationality (MRZ, high) -> combobox by alpha-2.
    const nat = nationalityToAlpha2(record.nationality);
    add({
      fieldId: "nationality", kind: "combobox",
      value: nat.alpha2, optionId: nat.alpha2 ? "nationality-" + nat.alpha2 : null,
      confidence: nat.ok ? dataConf : "low", source: "mrz",
      note: nat.ok ? undefined : "could not map nationality: " + nat.reason,
    });

    // Sex (MRZ) -> combobox.
    const gender = sexToGender(record.sex);
    add({
      fieldId: "gender", kind: "combobox",
      value: gender, optionId: gender ? "gender-" + gender : null,
      confidence: gender ? dataConf : "low", source: "mrz",
      note: gender ? undefined : "MRZ sex '" + record.sex + "' has no Mews option; leave blank",
    });

    // Date of birth (MRZ) -> text.
    const dob = formatBirthDate(record.birthDate, opts);
    add({
      fieldId: "birthDate", kind: "text", value: dob.ok ? dob.value : "",
      confidence: dob.ok ? dataConf : "low", source: "mrz",
      note: dob.ok ? undefined : "could not format DOB: " + dob.reason,
    });

    // Title (derived, low) -> combobox; suggest, user confirms.
    const title = sexToTitle(record.sex);
    add({
      fieldId: "titlePrefix", kind: "combobox",
      value: title, optionId: title ? "titlePrefix-" + title : null,
      confidence: "low", source: "derived",
      note: "derived from sex; marital status is not on a passport — confirm before saving",
    });

    // Country of birth: not in MRZ. Per decision, default to nationality (user-confirmable).
    add({
      fieldId: "birthCountry", kind: "combobox",
      value: nat.alpha2, optionId: nat.alpha2 ? "birthCountry-" + nat.alpha2 : null,
      confidence: nat.ok ? "low" : "manual", source: "derived",
      note: "assumed same as nationality; country of birth can differ (born abroad / naturalized) — confirm",
    });
    // Place of birth: genuinely only on the visual zone.
    add({ fieldId: "birthPlace", kind: "text", value: "",
      confidence: "manual", source: "ocr-visual",
      note: "not in MRZ; requires visual-zone OCR or manual entry" });

    return plan;
  }

  const api = {
    A3_A2, nationalityToAlpha2, sexToGender, sexToTitle, formatBirthDate, buildFillPlan,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Mappers = api;
})(typeof self !== "undefined" ? self : this);
