async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
}

async function ensureInjected(tabId) {
    try {
        const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => Boolean(window.__AF_CONTENT_READY__)
        });
        if (result) return;
    } catch (_) {}
    await chrome.scripting.executeScript({ target: { tabId }, files: ["crypto.js", "content.js"] });
}

async function sendToTab(type) {
    const tab = await getActiveTab();
    if (!tab?.id) return;
    try {
        await chrome.tabs.sendMessage(tab.id, { type });
    } catch {
        await ensureInjected(tab.id);
        await chrome.tabs.sendMessage(tab.id, { type });
    }
}

const fillBtn = document.getElementById("fill");
const listBtn = document.getElementById("listFields");
const toggle = document.getElementById("autofillToggle");
const openOptions = document.getElementById("openOptions");
const pass = document.getElementById("pass");
const unlock = document.getElementById("unlock");
const lockBtn = document.getElementById("lock");
const status = document.getElementById("status");

chrome.storage.local.get(["af_autoFillEnabled"], ({ af_autoFillEnabled }) => {
    toggle.checked = !!af_autoFillEnabled;
});
toggle.addEventListener("change", async () => {
    await chrome.storage.local.set({ af_autoFillEnabled: toggle.checked });
});

fillBtn.addEventListener("click", () => sendToTab("AF_FILL_NOW"));
listBtn.addEventListener("click", () => sendToTab("AF_LIST_FIELDS"));

openOptions.addEventListener("click", (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });

async function renderStatus() {
    try {
        const s = await chrome.storage.session.get("af_passphrase");
        status.textContent = s.af_passphrase ? "Unlocked for this browser session." : "Locked.";
    } catch { status.textContent = "Session storage unavailable."; }
}
unlock.addEventListener("click", async () => {
    if (!pass.value) { alert("Enter passphrase"); return; }
    try { await chrome.storage.session.set({ af_passphrase: pass.value }); } catch {}
    pass.value = "";
    renderStatus();
});
lockBtn.addEventListener("click", async () => {
    try { await chrome.storage.session.remove("af_passphrase"); } catch {}
    renderStatus();
});
renderStatus();

