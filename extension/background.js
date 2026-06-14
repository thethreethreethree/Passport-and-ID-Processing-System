// Opens the dashboard as a persistent popup WINDOW (not an auto-closing action
// popup), bound to the Mews tab it was launched from. A real window doesn't close
// when the Mews page steals focus — which is what was breaking the auto-fill.

let dashboardWindowId = null;

function dashUrl(tabId) {
  return chrome.runtime.getURL("popup.html") + "?tabId=" + tabId;
}

async function openDashboard(tabId) {
  if (!tabId) return;
  // Re-bind to the current guest: close any existing dashboard, open a fresh one.
  if (dashboardWindowId != null) {
    try { await chrome.windows.remove(dashboardWindowId); } catch (e) {}
    dashboardWindowId = null;
  }
  try {
    const win = await chrome.windows.create({
      url: dashUrl(tabId),
      type: "popup",
      width: 600,
      height: 820,
      focused: true,
    });
    dashboardWindowId = win.id;
  } catch (e) {
    console.warn("openDashboard failed:", e && e.message);
  }
}

// Toolbar icon click (no default_popup, so this fires).
chrome.action.onClicked.addListener((tab) => {
  if (tab && tab.id) openDashboard(tab.id);
});

// In-page "Scan & Fill" button asks to open the dashboard for its own tab.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.action === "openPopup") {
    const tabId = sender && sender.tab && sender.tab.id;
    if (tabId) openDashboard(tabId);
    sendResponse && sendResponse({ ok: true });
  }
  return true;
});

chrome.windows.onRemoved.addListener((wid) => {
  if (wid === dashboardWindowId) dashboardWindowId = null;
});
