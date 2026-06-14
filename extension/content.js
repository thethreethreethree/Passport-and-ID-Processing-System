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

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      chrome.runtime.sendMessage({ action: "openPopup" });
    });

    bar.insertBefore(btn, bar.firstChild); // far-left of the header actions
  }

  inject();
  // Mews is a single-page app — re-add the button after re-renders / navigation.
  setInterval(inject, 1000);
})();
