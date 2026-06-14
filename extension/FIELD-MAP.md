# Field Map — Mews Customer / Profile

Target: `app.mews.com/Commander/.../Customer/.../Detail` (Mews Commander).

Derived from the Phase 1 recon scan. This is the source-of-truth for which passport
datum feeds which form field, and **how** each field must be filled.

## Two control kinds (critical for the fill stage)

All fields are `<input type="text">`, but there are two mechanically different kinds:

- **Plain text inputs** — have both `id` and `name` (class `…hCSBkE`). Fillable by the
  React value-injection trick (native setter + dispatch `input`/`change`).
- **Custom comboboxes** — have an `id` but **`name: null`** (class
  `InputElement-sc-3a6e4bf2-0 … fDTpSf`). These render with a ▾ chevron. Setting
  `.value` does NOT select a value — they need interaction.

Combobox fields: `titlePrefix`, `nationality`, `language`, `gender`, `birthCountry`.

> Note: the hashed class suffixes (`sc-b7fddab1-3`, `hCSBkE`, etc.) are build-generated
> and will change on Mews deploys. Anchor on `id` (stable), not on class.

## Combobox mechanics (from "Scan open menu" capture)

Each combobox renders its options into a list `#{fieldId}-option-list` (referenced by
the input's `aria-controls` when open). **Every option is uniquely addressable:**

- `role="option"`, `id="{fieldId}-{value}"`, and a `value` attribute holding the code.
- Examples: `#nationality-FR` (value `FR`), `#titlePrefix-Miss` (value `Miss`),
  `#nationality-` (the blank option, value `null`).

**Fill strategy for comboboxes (no fuzzy text matching needed):**
1. Click/focus `#{fieldId}` to open the list.
2. Wait for `#{fieldId}-{value}` to exist in the DOM.
3. Dispatch a real click (mousedown/mouseup/click) on that option element.
4. Verify the input's displayed text updated; otherwise report failure (don't guess).

So mapping a combobox = mapping the passport datum → the option **`value` code**.

### Known vocabularies (captured)

- **`titlePrefix`** — `Mister`=Mr., `Miss`=Ms., `Misses`=Mrs., `Doctor`=Dr.,
  `Professor`=Prof., blank=`` (id `titlePrefix-`).
- **`nationality`** — values are **ISO 3166-1 alpha-2** (`FR`, `DE`, `US`…). MRZ supplies
  **alpha-3** → convert alpha-3→alpha-2, then target `#nationality-{alpha2}`. Mews label
  text deviates from ISO for some entries but the `value` codes are standard; we match on
  code, so label drift is irrelevant. Non-ISO entries seen: Kosovo=`XK`.
- **`gender`** — `Female`=Female, `Male`=Male, blank=`` (id `gender-`). No non-binary
  option. MRZ `M`→`Male`, `F`→`Female`; MRZ `X`/`<`/unspecified → leave blank + flag.
- **`language`** — vocabulary NOT yet captured (pending). Inferred field; low priority.
- **`birthCountry`** — assumed identical country list to `nationality`
  (`#birthCountry-{alpha2}`); to be confirmed by a quick capture.

## Map

| Form field | id | Control | Source | Confidence | Notes |
|---|---|---|---|---|---|
| First name | `firstName` | text | MRZ given names | high | |
| Last name | `lastName` | text (required) | MRZ surname | high | |
| Nationality | `nationality` | combobox | MRZ nationality (alpha-3) | high | alpha-3→alpha-2, click `#nationality-{alpha2}` |
| Sex | `gender` | combobox | MRZ sex | high | `M`/`F`/`X` → option value (vocab pending) |
| Date of birth | `birthDate` | text (date) | MRZ DOB (YYMMDD) | high | convert to field format; existing value `06/28/2002` ⇒ MM/DD/YYYY. Century inference on YY. |
| Second last name | `secondLastName` | text | name parsing | medium | only for multi-surname (Hispanic) names; else blank |
| Title | `titlePrefix` | combobox | derived from Sex | low | F→`Miss` (Ms.), M→`Mister` (Mr.); marital status NOT on passport — suggest, user confirms |
| Language | `language` | combobox | inferred from nationality | low | NOT on the passport; inference only |
| Country of birth | `birthCountry` | combobox | **assumed = nationality** | low | NOT in MRZ; defaulted to nationality alpha-2 (`#birthCountry-{alpha2}`) per decision — confirm, can differ |
| Place of birth | `birthPlace` | text | visual-zone OCR | medium | NOT in MRZ |
| Email | `email` | text | not passport (booking) | — | leave as-is |
| Telephone | `telephone` | text | not passport (booking) | — | leave as-is |

## Coverage summary

- **MRZ, high-confidence (5):** firstName, lastName, nationality, gender, birthDate
- **Derived / inferred, low-confidence — filled but flagged "confirm", never silent (3):**
  titlePrefix (from sex), birthCountry (= nationality, per decision), language (from nationality)
- **Visual-zone OCR / manual only (2):** birthPlace, secondLastName
- **Not from passport (2):** email, telephone

## Identity documents — add form (opened via the `+` button)

| Form field | id | Control | Source | Confidence |
|---|---|---|---|---|
| Number | `number` | text | MRZ `documentNumber` (own check digit) | high |
| Type | `type` | combobox | MRZ doc code (P→`Passport`) → `#type-Passport` | high (value assumed) |
| Issuing country | `issuingCountryCode` | combobox | MRZ issuing state (D→DE) → `#issuingCountryCode-DE` | high |
| Expiration date | `expiryDateString` | text | MRZ `expiryDate` (future century) → MM/DD/YYYY | high |
| Issue date | `issueDateString` | text | **not in MRZ** | manual |
| Issuing city | `issuingCity` | text | not in MRZ | manual |
| Mark as verified | `isVerified` | checkbox | human decision | manual (left alone) |

> `type` option value is assumed `Passport`; the fill verifies `#type-Passport` exists before
> clicking (fails safe). Capture the Type menu (Scan open menu) to confirm/extend other types.

## Addresses — add form (opened via the `+` button)

| Form field | id | Control | Source | Confidence |
|---|---|---|---|---|
| Country | `countryCode` | combobox | nationality (DE) → `#countryCode-DE` | low (guess) |
| Address line 1/2 | `addressLine1`/`addressLine2` | text | not on passport | manual |
| City | `city` | text | not on passport | manual |
| Postal code | `postalCode` | text | not on passport | manual |

> The identity-doc and address forms render in the main frame, so the same fill engine
> (text + combobox-click-by-id) targets them once the `+` form is open.

## Out-of-scope fields on this page (ignore for auto-fill)

`Search` box, `taxIdentifier`, `carRegistrationNumber`, `occupation`, `companyFieldId`,
`createdMeta` / `updatedMeta` (read-only metadata), `otherAccountId` (search).
