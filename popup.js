async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
}

async function ensureInjected(tabId) {
    // Check if our content script already set a flag
    try {
        const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => Boolean(window.__AF_CONTENT_READY__)
        });
        if (result) return;
    } catch (_) { /* ignore, we'll inject */ }

    // Inject content.js (idempotent)
    await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"]
    });
}

async function sendToTab(type) {
    const tab = await getActiveTab();
    if (!tab?.id) return;

    try {
        // First try normally
        await chrome.tabs.sendMessage(tab.id, { type });
    } catch (e) {
        // If there’s no receiver, inject the content script and retry once
        await ensureInjected(tab.id);
        await chrome.tabs.sendMessage(tab.id, { type });
    }
}

// UI wiring
const fillBtn = document.getElementById("fill");
const toggle = document.getElementById("autofillToggle");
const openOptions = document.getElementById("openOptions");
const listBtn = document.getElementById("listFields"); // only if you added the List button

chrome.storage.local.get(["af_autoFillEnabled"], ({ af_autoFillEnabled }) => {
    if (toggle) toggle.checked = !!af_autoFillEnabled;
});

toggle?.addEventListener("change", async () => {
    await chrome.storage.local.set({ af_autoFillEnabled: toggle.checked });
});

fillBtn?.addEventListener("click", () => sendToTab("AF_FILL_NOW"));
listBtn?.addEventListener("click", () => sendToTab("AF_LIST_FIELDS"));

openOptions?.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
});
