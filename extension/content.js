// Injects a branded "Scan & Fill" button into the Mews customer header.
// Clicking it asks the service worker to open the extension popup (where OCR runs —
// it can't run in the Mews page itself due to that page's security policy).
(function () {
  const BTN_ID = "frendz-scan-fill-btn";
  const onCustomerDetail = () =>
    /\/Commander\/[^/]+\/Customer\/[^/]+\/Detail/.test(location.href);

  function inject() {
    if (!onCustomerDetail()) return;
    if (document.getElementById(BTN_ID)) return;

    // The header action icons (edit / print / help) live in this portal.
    const portal = document.getElementById("page-header-actions-portal");
    if (!portal) return;
    const bar = portal.querySelector(":scope > div > div") || portal.firstElementChild || portal;

    const btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.title = "Scan a passport / ID and fill this profile";
    btn.setAttribute("aria-label", "Scan & Fill");
    Object.assign(btn.style, {
      border: "0", background: "transparent", cursor: "pointer", padding: "0",
      marginRight: "12px", lineHeight: "0", display: "inline-flex", alignItems: "center",
    });

    const img = document.createElement("img");
    img.src = chrome.runtime.getURL("images/scan-fill-button.png");
    img.alt = "Scan & Fill";
    Object.assign(img.style, { height: "34px", width: "auto", display: "block" });
    btn.appendChild(img);

    // Acts exactly like the popup's "Choose File": open the picker here (a real
    // user click), then hand the image to the popup, which opens and scans it.
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      pickFile();
    });

    bar.insertBefore(btn, bar.firstChild); // far-left of the header actions
  }

  function pickFile() {
    let input = document.getElementById("frendz-file-input");
    if (!input) {
      input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.id = "frendz-file-input";
      input.style.display = "none";
      input.addEventListener("change", onFileChosen);
      document.body.appendChild(input);
    }
    input.value = "";
    input.click(); // valid: triggered by the button's user click
  }

  function onFileChosen(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    // Open the popup right away (while the gesture is fresh), then stash the image;
    // the popup polls storage for it.
    chrome.runtime.sendMessage({ action: "openPopup" });
    const reader = new FileReader();
    reader.onload = () => {
      chrome.storage.local.set({ pendingImage: { dataUrl: reader.result, name: file.name, ts: Date.now() } });
    };
    reader.readAsDataURL(file);
  }

  inject();
  // Mews is a single-page app — re-add the button after re-renders / navigation.
  setInterval(inject, 1000);
})();
