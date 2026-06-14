// Service worker: opens the extension popup when the in-page "Scan & Fill" button
// asks for it (a content script can't open the popup directly).
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.action === "openPopup") {
    if (chrome.action && chrome.action.openPopup) {
      Promise.resolve(chrome.action.openPopup()).catch((e) => {
        // Older Chrome or gesture restriction — fall back to a hint on the badge.
        console.warn("openPopup failed:", e && e.message);
        chrome.action.setBadgeText({ text: "↑" });
        chrome.action.setBadgeBackgroundColor({ color: "#e44a3c" });
        setTimeout(() => chrome.action.setBadgeText({ text: "" }), 4000);
      });
    }
    sendResponse && sendResponse({ ok: true });
  }
  return true;
});
