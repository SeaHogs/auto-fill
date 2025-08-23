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
        if (result) return; // Already injected
    } catch (error) {
        console.log("Could not check injection status:", error);
    }
    
    // Try to inject the scripts
    try {
        await chrome.scripting.executeScript({ 
            target: { tabId }, 
            files: ["crypto.js", "content.js"] 
        });
        console.log("Scripts injected successfully");
    } catch (error) {
        console.error("Failed to inject scripts:", error);
        throw error;
    }
}

async function sendToTab(type) {
    const tab = await getActiveTab();
    if (!tab?.id) {
        console.log("No active tab found");
        return;
    }
    
    // Check if it's a restricted URL
    if (tab.url && (
        tab.url.startsWith('chrome://') || 
        tab.url.startsWith('chrome-extension://') ||
        tab.url.startsWith('edge://') ||
        tab.url.startsWith('about:') ||
        tab.url === 'chrome://newtab/'
    )) {
        console.log("Cannot run on system pages");
        alert("AutoFill cannot run on browser system pages.\nPlease navigate to a regular website!");
        return;
    }
    
    try {
        await chrome.tabs.sendMessage(tab.id, { type });
    } catch (error) {
        console.log("First attempt failed, trying to inject script...");
        try {
            await ensureInjected(tab.id);
            // Small delay to let script initialize
            await new Promise(resolve => setTimeout(resolve, 100));
            await chrome.tabs.sendMessage(tab.id, { type });
        } catch (retryError) {
            console.error("Failed after retry:", retryError);
            alert("Could not connect to this page.\nTry refreshing the page or navigate to a different website.");
        }
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

