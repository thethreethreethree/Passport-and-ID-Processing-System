// Passport/ID Field Recon — Phase 1
// Purpose: read the live target page and report every form field + stable selector
// candidates, so the auto-fill mapping (Phase C/D) is built from the real DOM,
// not from guessed class names. Read-only. Runs only on user click (activeTab).

const $ = (sel) => document.querySelector(sel);
let lastReport = null;
let parsedPlan = null;
let parsedRecord = null;

const FIELD_LABELS = {
  titlePrefix: "Title", firstName: "First name", lastName: "Last name",
  secondLastName: "Second last name", nationality: "Nationality", language: "Language",
  gender: "Sex", birthDate: "Date of birth", birthCountry: "Country of birth",
  birthPlace: "Place of birth",
};

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// Image OCR: preview -> auto-attempt -> user-drawn region if needed.
const imgEl = document.getElementById("imgfile");
let previewImg = null, previewScale = 1, sel = null, selecting = false;

// Warm the OCR model in the background when the popup opens, so the first scan is fast.
if (window.OCR && typeof Tesseract !== "undefined") window.OCR.warm();

function ocrProgress(m) {
  if (m && m.status)
    $("#status").textContent = "OCR: " + m.status + (m.progress ? " " + Math.round(m.progress * 100) + "%" : "");
}

function applyOcrText(text) {
  $("#mrztext").value = text.replace(/[^A-Z0-9<\n]/g, "").trim();
  document.getElementById("readmrz").click(); // parse + review
}

function drawPreview() {
  const c = document.getElementById("preview");
  const ctx = c.getContext("2d");
  ctx.drawImage(previewImg, 0, 0, c.width, c.height);
  if (sel) {
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 2;
    ctx.strokeRect(sel.x, sel.y, sel.w, sel.h);
  }
}

if (imgEl)
  imgEl.addEventListener("change", async () => {
    const file = imgEl.files && imgEl.files[0];
    if (!file) return;
    if (typeof Tesseract === "undefined" || !window.OCR) {
      $("#imgnote").textContent =
        "OCR assets aren't installed — run scripts/fetch-ocr-assets, then reload. You can still paste the MRZ below.";
      return;
    }
    sel = null;
    try {
      previewImg = await window.OCR.fileToImage(file);
    } catch (e) {
      $("#status").textContent = "Couldn't load image: " + e.message;
      return;
    }
    const c = document.getElementById("preview");
    const dispW = Math.min(previewImg.width, 640);
    previewScale = dispW / previewImg.width;
    c.width = dispW;
    c.height = Math.round(previewImg.height * previewScale);
    drawPreview();
    $("#previewwrap").style.display = "";

    $("#status").textContent = "Trying to read automatically… first run loads the model (~10s).";
    try {
      const result = await window.OCR.recognizeMRZ(previewImg, ocrProgress);
      if (result.text) {
        applyOcrText(result.text); // surface raw OCR text in the box + attempt parse
        if (result.parsed && result.parsed.valid)
          $("#status").textContent = "Read automatically — checksums valid. Review, then Fill form.";
        else
          $("#status").textContent =
            "OCR read the text now in the box but couldn't validate it. Draw a tighter box around the MRZ → Read selection — or copy that text to me so I can fix the reader.";
      } else {
        $("#status").textContent =
          "OCR found no MRZ-like text. Drag a box around the 2 MRZ lines, then “Read selection”.";
      }
    } catch (e) {
      $("#status").textContent = "OCR error: " + e.message;
    }
  });

// Drag-to-select on the preview canvas (display coords; mapped to source on read).
(function setupSelection() {
  const c = document.getElementById("preview");
  if (!c) return;
  const at = (e) => {
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };
  c.addEventListener("pointerdown", (e) => {
    selecting = true;
    const p = at(e);
    sel = { x: p.x, y: p.y, w: 0, h: 0 };
    c.setPointerCapture(e.pointerId);
  });
  c.addEventListener("pointermove", (e) => {
    if (!selecting) return;
    const p = at(e);
    sel.w = p.x - sel.x;
    sel.h = p.y - sel.y;
    drawPreview();
  });
  c.addEventListener("pointerup", () => { selecting = false; });
})();

const readSelEl = document.getElementById("readsel");
if (readSelEl)
  readSelEl.addEventListener("click", async () => {
    if (!previewImg || !sel || Math.abs(sel.w) < 5 || Math.abs(sel.h) < 5) {
      $("#status").textContent = "Draw a box around the MRZ lines first.";
      return;
    }
    const x = Math.min(sel.x, sel.x + sel.w), y = Math.min(sel.y, sel.y + sel.h);
    const rect = {
      x: x / previewScale, y: y / previewScale,
      w: Math.abs(sel.w) / previewScale, h: Math.abs(sel.h) / previewScale,
    };
    $("#status").textContent = "Reading selection…";
    try {
      const result = await window.OCR.recognizeRegion(previewImg, rect, ocrProgress);
      if (result.text && result.text.replace(/[^A-Z0-9<]/g, "").length > 10) {
        applyOcrText(result.text);
        const valid = result.parsed && result.parsed.valid;
        $("#status").textContent = valid
          ? "Read from selection — checksums valid. Review, then Fill."
          : "Read from selection — didn't fully validate. The raw text is in the box: verify/fix it, or copy it to me so I can fix the reader.";
      } else {
        $("#status").textContent =
          "No MRZ-like text in that box. Try a tighter box on just the 2 MRZ lines, or copy any text in the box to me.";
      }
    } catch (e) {
      $("#status").textContent = "OCR error: " + e.message;
    }
  });

document.getElementById("readmrz").addEventListener("click", () => {
  const raw = $("#mrztext").value.trim();
  if (!raw) { $("#status").textContent = "Paste the MRZ lines first."; return; }
  if (!window.MRZ || !window.Mappers || !window.MRZCorrect) { $("#status").textContent = "Libraries failed to load."; return; }
  const res = window.MRZCorrect.parseCorrected(raw);
  if (!res.ok) {
    $("#reviewcard").style.display = "none";
    $("#fillform").disabled = true;
    $("#status").textContent = "Could not find MRZ lines: " + res.reason;
    return;
  }
  parsedRecord = res.record;
  parsedPlan = window.Mappers.buildFillPlan(res.record, { currentYear: 2026 });
  renderReview(res, parsedPlan);
  $("#reviewcard").style.display = "";
  $("#fillform").disabled = false;
  $("#filliddoc").disabled = false;
  $("#filladdress").disabled = false;
  $("#status").textContent = "Parsed " + res.record.format + ". Review, then Fill.";
});

function renderReview(res, plan) {
  let corr = "";
  if (res.corrected && res.corrections && res.corrections.length) {
    corr =
      " <span class='note'>auto-corrected: " +
      esc(res.corrections.map((c) => c.field + " " + c.from + "→" + c.to).join(", ")) +
      "</span>";
  }
  $("#mrzvalid").innerHTML =
    '<span class="badge ' + (res.valid ? "b-ok" : "b-miss") + '">' +
    (res.valid ? "MRZ checksums valid" : "MRZ checksum mismatch — data may be misread") +
    "</span> <span class='note'>" + esc(res.record.format) + " · " + esc(res.record.issuingState || "") + "</span>" +
    corr;

  const rows = plan
    .map((e) => {
      const label = FIELD_LABELS[e.fieldId] || e.fieldId;
      const display = e.kind === "combobox" ? (e.optionId ? e.value || "" : "") : e.value || "";
      const cell = display ? '<span class="val">' + esc(display) + "</span>" : '<span class="empty">—</span>';
      const bcls = e.confidence === "high" ? "b-high" : e.confidence === "low" ? "b-low" : "b-manual";
      const note = e.note ? '<div class="note">' + esc(e.note) + "</div>" : "";
      return (
        "<tr><td>" + esc(label) + "</td><td>" + cell +
        "</td><td><span class='badge " + bcls + "'>" + e.confidence + "</span></td></tr>" +
        (note ? "<tr><td></td><td colspan='2'>" + note + "</td></tr>" : "")
      );
    })
    .join("");
  $("#record").innerHTML =
    "<table><tr><th>Field</th><th>Value</th><th>Confidence</th></tr>" + rows + "</table>";
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fillOnce(plan) {
  const tab = await getActiveTab();
  const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: fillPlan, args: [plan] });
  return r.result;
}

async function injectFn(func, args) {
  const tab = await getActiveTab();
  const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func, args: args || [] });
  return r.result;
}

async function runFill(plan, label) {
  $("#status").textContent = "Filling " + label + "…";
  try {
    const report = await fillOnce(plan);
    lastReport = report;
    $("#out").textContent = JSON.stringify(report, null, 2);
    const filled = report.results.filter((x) => x.ok).length;
    const tried = report.results.filter((x) => x.attempted).length;
    const missed = report.results.filter((x) => x.attempted && !x.ok).length;
    $("#status").textContent =
      `${label}: filled ${filled}/${tried} field(s).` +
      (missed ? ` ${missed} couldn’t be set — is the right form open?` : " Confirm amber fields before saving.");
  } catch (e) {
    $("#status").textContent = "Error: " + e.message;
  }
}

// Auto-open a section's + form and fill it — then STOP so the user reviews and
// clicks Save themselves. If the form is already open, just fill it. Never saves.
async function fillSectionInteractive(headingText, anchorFieldId, plan, label) {
  if (!parsedRecord) return;
  $("#status").textContent = `${label}: opening + filling…`;
  try {
    // Already-open form (user opened it, or an edit form) — just fill it.
    if (await injectFn(fieldExists, [anchorFieldId])) {
      await runFill(plan, label);
      $("#status").textContent = `${label}: filled — review and click Save in Mews.`;
      return;
    }
    // Otherwise check the section and auto-open its + form.
    const state = await injectFn(sectionState, [headingText]);
    if (state && state.found && !state.empty) {
      $("#status").textContent = `${label}: already has a row. To add another, open its + form, then click again.`;
      return;
    }
    const opened = await injectFn(openSectionAdd, [headingText]);
    if (!opened || !opened.clicked) {
      $("#out").textContent = JSON.stringify({ sectionState: state, openSectionAdd: opened }, null, 2);
      $("#status").textContent = `${label}: couldn’t find the + button (${(opened && opened.reason) || "?"}) — see Recon box.`;
      return;
    }
    const appeared = await injectFn(waitForField, [anchorFieldId, 4000]);
    if (!appeared) { $("#status").textContent = `${label}: the + form didn’t open.`; return; }
    await runFill(plan, label);
    $("#status").textContent = `${label}: filled — review and click Save in Mews.`;
  } catch (e) {
    $("#status").textContent = `${label} error: ` + e.message;
  }
}

document.getElementById("fillform").addEventListener("click", () => {
  if (parsedPlan) runFill(parsedPlan, "Profile");
});
document.getElementById("filliddoc").addEventListener("click", () => {
  fillSectionInteractive("Identity documents", "number", window.Mappers.buildIdentityDocPlan(parsedRecord, { currentYear: 2026 }), "Identity document");
});
document.getElementById("filladdress").addEventListener("click", () => {
  fillSectionInteractive("Addresses", "addressLine1", window.Mappers.buildAddressPlan(parsedRecord), "Address");
});

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Inject a self-contained function into every frame of the active tab and
// collect the per-frame results.
async function inject(func, args = []) {
  const tab = await getActiveTab();
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    func,
    args,
  });
  return { tab, results };
}

$("#scan").addEventListener("click", async () => {
  $("#status").textContent = "Scanning…";
  try {
    const { tab, results } = await inject(scanFields);
    const frames = results
      .map((r) => ({ frameId: r.frameId, ...(r.result || {}) }))
      .filter((fr) => fr.fields);

    const fields = [];
    const buttons = [];
    frames.forEach((fr) => {
      (fr.fields || []).forEach((f) => fields.push({ frameId: fr.frameId, ...f }));
      (fr.buttons || []).forEach((b) => buttons.push({ frameId: fr.frameId, ...b }));
    });

    lastReport = {
      page: {
        url: tab.url,
        title: tab.title,
        scannedFrames: frames.length,
        framePages: frames.map((fr) => ({ frameId: fr.frameId, url: fr.url, title: fr.title })),
      },
      fieldCount: fields.length,
      fields,
      buttonCount: buttons.length,
      buttons,
    };

    $("#out").textContent = JSON.stringify(lastReport, null, 2);
    $("#status").textContent = `Found ${fields.length} field(s), ${buttons.length} button(s) across ${frames.length} frame(s).`;
  } catch (e) {
    $("#status").textContent = "Error: " + e.message;
  }
});

$("#fillsample").addEventListener("click", async () => {
  $("#status").textContent = "Filling…";
  try {
    // Sample record (matches Alice Pequet: FRA / Female / DOB 2002-06-28, MRZ YYMMDD = 020628).
    const sampleRecord = {
      surname: "PEQUET",
      givenNames: ["ALICE"],
      nationality: "FRA",
      birthDate: "020628",
      sex: "F",
    };
    if (!window.Mappers) throw new Error("Mappers lib not loaded");
    const plan = window.Mappers.buildFillPlan(sampleRecord, { currentYear: 2026 });

    const tab = await getActiveTab();
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id }, // main frame only — avoid double-fill
      func: fillPlan,
      args: [plan],
    });
    const report = res.result;
    lastReport = report;
    $("#out").textContent = JSON.stringify(report, null, 2);
    const filled = report.results.filter((r) => r.ok).length;
    const tried = report.results.filter((r) => r.attempted).length;
    $("#status").textContent = `Filled ${filled}/${tried} field(s). Check the form; review the report for any misses.`;
  } catch (e) {
    $("#status").textContent = "Error: " + e.message;
  }
});

$("#scanmenu").addEventListener("click", async () => {
  $("#status").textContent = "Scanning menu…";
  try {
    const { results } = await inject(scanOpenMenu);
    const r = results.map((x) => x.result).find((x) => x && (x.message || x.captured || x.liveScan));
    if (!r) {
      $("#status").textContent = "No menu data found. Open a dropdown first, then click again.";
      return;
    }
    if (r.message && !r.captured) {
      // First click: observer just armed.
      $("#status").textContent = r.message;
      $("#out").textContent = JSON.stringify(r, null, 2);
      return;
    }
    lastReport = r;
    $("#out").textContent = JSON.stringify(r, null, 2);
    const menus = (r.captured && r.captured.length) || 0;
    const items = (r.captured || []).reduce((a, c) => a + (c.items ? c.items.length : 0), 0);
    $("#status").textContent = menus
      ? `Captured ${menus} menu(s), ${items} item(s) total. Click “Copy JSON” and paste it back.`
      : "No menus captured yet — open a dropdown on the page, then click again.";
  } catch (e) {
    $("#status").textContent = "Error: " + e.message;
  }
});

$("#highlight").addEventListener("click", async () => {
  try {
    await inject(highlightFields);
    $("#status").textContent = "Highlighted fields on the page.";
  } catch (e) {
    $("#status").textContent = "Error: " + e.message;
  }
});

$("#clearhl").addEventListener("click", async () => {
  try {
    await inject(clearHighlights);
    $("#status").textContent = "Cleared highlights.";
  } catch (e) {
    $("#status").textContent = "Error: " + e.message;
  }
});

$("#copy").addEventListener("click", async () => {
  if (!lastReport) {
    $("#status").textContent = "Nothing to copy — run a scan first.";
    return;
  }
  await navigator.clipboard.writeText(JSON.stringify(lastReport, null, 2));
  $("#status").textContent = "Copied report JSON to clipboard.";
});

/* ============================================================================
 * Injected functions below. These are serialized and run IN THE PAGE, so they
 * must be fully self-contained (no references to popup scope).
 * ==========================================================================*/

function scanFields() {
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return (
      r.width > 0 &&
      r.height > 0 &&
      st.visibility !== "hidden" &&
      st.display !== "none" &&
      el.type !== "hidden"
    );
  };

  // Find the human-readable label for a control, trying the most reliable
  // sources first and falling back to layout heuristics for SPA forms.
  const guessLabel = (el) => {
    if (el.labels && el.labels.length) {
      const t = clean(el.labels[0].innerText);
      if (t) return { text: t, source: "label[for]" };
    }
    const lb = el.getAttribute("aria-labelledby");
    if (lb) {
      const t = clean(
        lb
          .split(/\s+/)
          .map((id) => document.getElementById(id))
          .filter(Boolean)
          .map((n) => n.innerText)
          .join(" ")
      );
      if (t) return { text: t, source: "aria-labelledby" };
    }
    const al = el.getAttribute("aria-label");
    if (al && clean(al)) return { text: clean(al), source: "aria-label" };

    const wrap = el.closest("label");
    if (wrap) {
      const t = clean(wrap.innerText);
      if (t) return { text: t, source: "wrapping-label" };
    }

    // Climb a few ancestors; the nearest short preceding text is usually the label.
    let node = el;
    for (let i = 0; i < 4 && node; i++) {
      let sib = node.previousElementSibling;
      while (sib) {
        const t = clean(sib.innerText || sib.textContent || "");
        if (t && t.length <= 60) return { text: t, source: "preceding-sibling" };
        sib = sib.previousElementSibling;
      }
      node = node.parentElement;
    }
    if (el.placeholder) return { text: clean(el.placeholder), source: "placeholder" };
    return { text: "", source: "none" };
  };

  const esc = (s) =>
    window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/[^a-zA-Z0-9_-]/g, "\\$&");

  const uniqueById = (el) =>
    el.id && document.querySelectorAll("#" + esc(el.id)).length === 1;

  // Structural CSS path as a last-resort selector.
  const cssPath = (el) => {
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && parts.length < 6) {
      if (uniqueById(cur)) {
        parts.unshift("#" + esc(cur.id));
        break;
      }
      let sel = cur.tagName.toLowerCase();
      const parent = cur.parentElement;
      if (parent) {
        const sameTag = [...parent.children].filter((c) => c.tagName === cur.tagName);
        if (sameTag.length > 1) sel += `:nth-of-type(${sameTag.indexOf(cur) + 1})`;
      }
      parts.unshift(sel);
      cur = cur.parentElement;
    }
    return parts.join(" > ");
  };

  const controls = [...document.querySelectorAll("input, select, textarea")];

  const fields = controls.map((el, i) => {
    const label = guessLabel(el);
    const rawLabel = label.text;
    const required = !!el.required || el.getAttribute("aria-required") === "true" || /\*/.test(rawLabel);

    // Selector candidates, most-stable first. We capture all so the mapping
    // step can choose by evidence rather than committing to a brittle one now.
    const selectors = {};
    if (uniqueById(el)) selectors.byId = "#" + esc(el.id);
    if (el.name) selectors.byName = `${el.tagName.toLowerCase()}[name="${el.name}"]`;
    if (el.getAttribute("aria-label"))
      selectors.byAriaLabel = `${el.tagName.toLowerCase()}[aria-label="${el.getAttribute("aria-label")}"]`;
    selectors.cssPath = cssPath(el);

    return {
      index: i,
      tag: el.tagName.toLowerCase(),
      type: (el.getAttribute("type") || (el.tagName === "SELECT" ? "select" : "text")).toLowerCase(),
      label: rawLabel.replace(/\s*\*\s*$/, ""),
      labelSource: label.source,
      name: el.name || null,
      id: el.id || null,
      placeholder: el.placeholder || null,
      required,
      value: el.value || "",
      options:
        el.tagName === "SELECT"
          ? [...el.options].slice(0, 50).map((o) => clean(o.textContent))
          : undefined,
      visible: isVisible(el),
      classList: el.className && typeof el.className === "string" ? el.className : null,
      selectors,
    };
  });

  // Also capture clickable buttons (the "+" add buttons, modal Save buttons).
  const clickables = [...document.querySelectorAll('button, [role="button"], a[href], input[type="button"], input[type="submit"]')];
  const buttons = clickables.filter(isVisible).slice(0, 100).map((el, i) => {
    const aria = el.getAttribute("aria-label") || "";
    const title = el.getAttribute("title") || "";
    const text = clean(el.innerText || el.textContent || "");
    const r = el.getBoundingClientRect();
    const sel = {};
    if (uniqueById(el)) sel.byId = "#" + esc(el.id);
    if (aria) sel.byAriaLabel = `${el.tagName.toLowerCase()}[aria-label="${aria}"]`;
    sel.cssPath = cssPath(el);
    return {
      index: i,
      tag: el.tagName.toLowerCase(),
      text: text.slice(0, 50),
      ariaLabel: aria || null,
      title: title || null,
      id: el.id || null,
      type: el.getAttribute("type") || null,
      classList: typeof el.className === "string" ? el.className : null,
      rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
      selectors: sel,
    };
  });

  return { url: location.href, title: document.title, fields, buttons };
}

function highlightFields() {
  document.querySelectorAll("[data-recon-badge]").forEach((n) => n.remove());
  const controls = [...document.querySelectorAll("input, select, textarea")];
  controls.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    el.style.outline = "2px solid #ef4444";
    el.style.outlineOffset = "1px";
    const badge = document.createElement("div");
    badge.setAttribute("data-recon-badge", "1");
    badge.textContent = String(i);
    Object.assign(badge.style, {
      position: "fixed",
      zIndex: 2147483647,
      left: r.left + window.scrollX * 0 + "px",
      top: r.top + "px",
      transform: "translate(-50%, -50%)",
      background: "#ef4444",
      color: "#fff",
      font: "11px/1 system-ui, sans-serif",
      padding: "2px 5px",
      borderRadius: "8px",
      pointerEvents: "none",
    });
    document.body.appendChild(badge);
  });
}

function clearHighlights() {
  document.querySelectorAll("[data-recon-badge]").forEach((n) => n.remove());
  document.querySelectorAll("input, select, textarea").forEach((el) => {
    el.style.outline = "";
    el.style.outlineOffset = "";
  });
}

// Execute a fill plan against the live page. Self-contained (injected). Async.
// Returns a per-field report — never throws, so a single bad field can't abort the rest.
async function fillPlan(plan) {
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (fn, timeout = 2000, step = 50) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const v = fn();
      if (v) return v;
      await delay(step);
    }
    return null;
  };

  // React-controlled inputs ignore el.value = x; use the native setter + events.
  const setNativeValue = (el, value) => {
    const proto =
      el.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const fillText = (fieldId, value) => {
    const el = document.getElementById(fieldId);
    if (!el) return { ok: false, reason: "input #" + fieldId + " not found" };
    el.focus();
    setNativeValue(el, value);
    el.blur();
    el.dispatchEvent(new Event("blur", { bubbles: true }));
    return { ok: el.value === value, displayed: el.value };
  };

  const openMenu = (input) => {
    input.focus();
    input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    input.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    input.click();
  };

  const fillCombobox = async (fieldId, optionValue) => {
    const input = document.getElementById(fieldId);
    if (!input) return { ok: false, reason: "input #" + fieldId + " not found" };
    const optId = fieldId + "-" + optionValue;

    openMenu(input);
    let opt = await waitFor(() => document.getElementById(optId), 1500);

    if (!opt) {
      // Fallbacks: some comboboxes open on the parent container or on ArrowDown.
      input.parentElement && input.parentElement.click();
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      opt = await waitFor(() => document.getElementById(optId), 1500);
    }
    if (!opt) return { ok: false, reason: "option #" + optId + " did not appear" };

    opt.scrollIntoView({ block: "nearest" });
    ["mousedown", "mouseup", "click"].forEach((t) =>
      opt.dispatchEvent(new MouseEvent(t, { bubbles: true }))
    );
    await delay(120);
    return { ok: true, optionId: optId, displayed: input.value };
  };

  const results = [];
  for (const entry of plan) {
    const base = {
      fieldId: entry.fieldId,
      kind: entry.kind,
      confidence: entry.confidence,
      source: entry.source,
    };

    // Skip anything with no value to write (manual / not-from-MRZ fields).
    const hasValue =
      entry.kind === "combobox" ? !!entry.optionId : entry.value !== "" && entry.value != null;
    if (!hasValue) {
      results.push({ ...base, attempted: false, ok: false, reason: entry.note || "no value" });
      continue;
    }

    let r;
    try {
      r =
        entry.kind === "combobox"
          ? await fillCombobox(entry.fieldId, entry.value)
          : fillText(entry.fieldId, entry.value);
    } catch (e) {
      r = { ok: false, reason: "exception: " + e.message };
    }
    results.push({ ...base, attempted: true, value: entry.value, ...r });
  }

  return { url: location.href, filledAt: new Date().toString(), results };
}

// --- Section orchestration helpers (injected; each fully SELF-CONTAINED, because
// executeScript injects one function at a time with no shared helpers) ---

// Locate a section heading element (a leaf whose visible text == headingText).
// Returned as a string of code is not possible, so each function re-implements it.

// Is the section empty (no existing row)?
function sectionState(headingText) {
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
  const isVis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const heading = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6,div,span,p,strong,b,label")]
    .find((e) => e.children.length === 0 && norm(e.textContent) === headingText && isVis(e));
  if (!heading) return { found: false };
  let card = heading.parentElement;
  for (let i = 0; i < 10 && card; i++) {
    if (card.querySelector("table") || /no data available/i.test(card.textContent)) break;
    card = card.parentElement;
  }
  card = card || heading.parentElement;
  const noData = /no data available/i.test(card.textContent || "");
  const rows = card.querySelectorAll("tbody tr").length;
  return { found: true, empty: noData || rows === 0, rows, noData };
}

// Click the section's "+" add button — found POSITIONALLY as the right-most
// clickable on the heading's row (robust to hashed class names).
function openSectionAdd(headingText) {
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
  const isVis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const heading = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6,div,span,p,strong,b,label")]
    .find((e) => e.children.length === 0 && norm(e.textContent) === headingText && isVis(e));
  if (!heading) return { clicked: false, reason: "heading '" + headingText + "' not found" };
  const hr = heading.getBoundingClientRect();
  const hcy = hr.top + hr.height / 2;
  const cands = [...document.querySelectorAll('button, [role="button"], a[href]')]
    .filter(isVis)
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter((o) => Math.abs(o.r.top + o.r.height / 2 - hcy) <= 32 && o.r.left >= hr.right - 4)
    .sort((a, b) => b.r.left - a.r.left); // right-most first
  if (!cands.length) {
    const near = [...document.querySelectorAll("button,[role=button]")].filter(isVis)
      .map((el) => ({ y: Math.round(el.getBoundingClientRect().top), x: Math.round(el.getBoundingClientRect().left), cls: (el.className || "").toString().slice(0, 30) }))
      .filter((o) => Math.abs(o.y - hcy) <= 120).slice(0, 12);
    return { clicked: false, reason: "no button on heading row", diag: { headingY: Math.round(hcy), headingRight: Math.round(hr.right), nearbyButtons: near } };
  }
  const add = cands[0].el;
  add.scrollIntoView({ block: "center" });
  ["mousedown", "mouseup", "click"].forEach((t) => add.dispatchEvent(new MouseEvent(t, { bubbles: true })));
  return { clicked: true, picked: { x: Math.round(cands[0].r.left), cls: (add.className || "").toString().slice(0, 50) } };
}

// Wait for a field id to appear (the modal has opened).
async function waitForField(id, timeout) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const el = document.getElementById(id);
    if (el && el.getBoundingClientRect().width > 0) return true;
    await new Promise((r) => setTimeout(r, 80));
  }
  return false;
}

// Is a field present and visible (i.e. its form/modal is already open)?
function fieldExists(id) {
  const el = document.getElementById(id);
  return !!(el && el.getBoundingClientRect().width > 0);
}

// Capture a custom-combobox option list. Two-step so the capture survives the
// popup stealing focus (which can close the menu): the first click arms a
// MutationObserver that records the option list AT THE MOMENT it opens (while
// the page still has focus); the second click returns what was captured.
function scanOpenMenu() {
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none";
  };

  const snapshot = (scope) => {
    const root = scope && scope.querySelectorAll ? scope : document;
    let items = [...root.querySelectorAll('[role="option"], [role="menuitem"]')].filter(visible);
    if (items.length < 2)
      items = [...root.querySelectorAll('[role="listbox"] li, [role="menu"] li, ul li')].filter(visible);
    if (items.length < 2)
      items = [...root.querySelectorAll('[class*="ption"], [class*="enu-item"], [class*="ropdown-item"]')].filter(
        (el) => visible(el) && el.children.length === 0 && clean(el.textContent)
      );
    return items
      .slice(0, 200)
      .map((el) => ({
        text: clean(el.textContent),
        id: el.id || null,
        role: el.getAttribute("role") || null,
        value:
          el.getAttribute("data-value") ||
          el.getAttribute("value") ||
          el.getAttribute("data-id") ||
          null,
        tag: el.tagName.toLowerCase(),
        classList: typeof el.className === "string" ? el.className : null,
      }))
      .filter((o) => o.text);
  };

  const expandedInfo = () =>
    [...document.querySelectorAll('[aria-expanded="true"]')].map((e) => ({
      id: e.id || null,
      controls: e.getAttribute("aria-controls") || null,
      activedescendant: e.getAttribute("aria-activedescendant") || null,
    }));

  if (!window.__reconMenuArmed) {
    window.__reconMenuArmed = true;
    window.__reconMenuCaptures = {}; // signature -> capture (keeps every distinct menu)
    window.__reconMenuObserver = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          const snap = snapshot(node);
          if (snap.length >= 2) {
            const sig = snap.length + "|" + snap.slice(0, 3).map((o) => o.text).join("¦");
            const prev = window.__reconMenuCaptures[sig];
            if (!prev || snap.length > prev.items.length) {
              window.__reconMenuCaptures[sig] = { items: snap, expanded: expandedInfo() };
            }
          }
        }
      }
    });
    window.__reconMenuObserver.observe(document.documentElement, { childList: true, subtree: true });
    return {
      armed: true,
      message:
        "Capture armed. Now open each dropdown you care about (Sex, Title, Nationality, Language, Country of birth) one at a time, then click “Scan open menu” again.",
    };
  }

  const captures = Object.values(window.__reconMenuCaptures || {});
  return {
    armed: true,
    menuCount: captures.length,
    captured: captures,
    liveScan: snapshot(document),
    expandedNow: expandedInfo(),
  };
}
