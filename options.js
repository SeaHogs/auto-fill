const fields = [
    "firstName","lastName","fullName","email","phone","birthday",
    "address1","city","postalCode","country",
    "university","degree","major","gpa","gradYear",
    "linkedin","github","website","summary"
];

const $ = (id) => document.getElementById(id);

async function getSessionPass() {
    try {
        const s = await chrome.storage.session.get("af_passphrase");
        return s.af_passphrase || "";
    } catch { return ""; }
}

async function load() {
    const local = await chrome.storage.local.get(["af_profile", "af_profile_enc"]);
    const encBundle = local.af_profile_enc;
    const sessionPass = await getSessionPass();

    // UI state
    const encEnabled = !!encBundle;
    $("encEnabled").checked = encEnabled;
    $("encStatus").textContent = encEnabled
        ? (sessionPass ? "Encrypted (unlocked for this session)" : "Encrypted (locked; enter passphrase to Save/overwrite)")
        : "Not encrypted";

    let profile = {};
    if (encBundle && sessionPass) {
        try { profile = await AF_CRYPTO.decryptJSON(encBundle, sessionPass); }
        catch { console.warn("[AutoFill] Wrong session passphrase; cannot prefill options."); }
    } else if (local.af_profile) {
        profile = local.af_profile;
    }

    fields.forEach(k => { const el = $(k); if (el && profile[k] !== undefined) el.value = profile[k]; });
}

async function save() {
    const encEnabled = $("encEnabled").checked;
    const pass = $("encPass").value;
    const pass2 = $("encPass2").value;

    const profile = {};
    fields.forEach(k => profile[k] = $(k).value.trim());

    if (encEnabled) {
        if (!pass || pass !== pass2) { alert("Passphrases must be non-empty and match."); return; }
        const bundle = await AF_CRYPTO.encryptJSON(profile, pass);
        await chrome.storage.local.set({ af_profile_enc: bundle });
        await chrome.storage.local.remove("af_profile");
        // cache for this browser session so content.js can decrypt
        try { await chrome.storage.session.set({ af_passphrase: pass }); } catch {}
        alert("Saved (encrypted).");
    } else {
        await chrome.storage.local.set({ af_profile: profile });
        await chrome.storage.local.remove("af_profile_enc");
        alert("Saved (plaintext).");
    }
    await load();
}

async function reset() {
    if (!confirm("Clear all stored profile data (both plaintext and encrypted)?")) return;
    await chrome.storage.local.remove(["af_profile", "af_profile_enc"]);
    await load();
}

async function fetchFromAWS() {
    const syncMessage = document.getElementById('syncMessage');
    
    try {
        syncMessage.style.display = 'block';
        syncMessage.style.background = '#e3f2fd';
        syncMessage.textContent = 'Fetching from company database...';
        
        // Fetch from AWS
        const storageService = new StorageService(SERVICE_CONFIG);
        const userId = await getUserIdentifier();
        const remoteProfile = await storageService.loadProfile(userId);
        
        if (remoteProfile && remoteProfile.data) {
            // Populate form fields with AWS data
            for (const [key, value] of Object.entries(remoteProfile.data)) {
                const field = document.getElementById(key);
                if (field && value !== undefined) {
                    field.value = value;
                }
            }
            
            // Update sync status
            await chrome.storage.local.set({
                lastSyncTime: Date.now(),
                lastSyncSource: 'aws'
            });
            
            syncMessage.style.background = '#c8e6c9';
            syncMessage.textContent = '✓ Successfully fetched from company database';
            updateSyncStatus();
            
            // Auto-save locally
            await save();
        }
    } catch (error) {
        syncMessage.style.background = '#ffcdd2';
        syncMessage.textContent = '✗ Failed to fetch: ' + error.message;
    }
    
    // Hide message after 3 seconds
    setTimeout(() => {
        syncMessage.style.display = 'none';
    }, 3000);
}

async function pushToAWS() {
    const syncMessage = document.getElementById('syncMessage');
    
    try {
        syncMessage.style.display = 'block';
        syncMessage.style.background = '#e3f2fd';
        syncMessage.textContent = 'Pushing to company database...';
        
        // Collect current form data
        const profile = {};
        const fields = [
            "firstName","lastName","fullName","email","phone","birthday",
            "address1","city","postalCode","country",
            "university","degree","major","gpa","gradYear",
            "linkedin","github","website","summary"
        ];
        
        fields.forEach(key => {
            const el = document.getElementById(key);
            if (el) profile[key] = el.value.trim();
        });
        
        // Push to AWS
        const storageService = new StorageService(SERVICE_CONFIG);
        await storageService.saveProfile(profile);
        
        // Update sync status
        await chrome.storage.local.set({
            lastSyncTime: Date.now(),
            lastSyncSource: 'pushed'
        });
        
        syncMessage.style.background = '#c8e6c9';
        syncMessage.textContent = '✓ Successfully pushed to company database';
        updateSyncStatus();
        
    } catch (error) {
        syncMessage.style.background = '#ffcdd2';
        syncMessage.textContent = '✗ Failed to push: ' + error.message;
    }
    
    // Hide message after 3 seconds
    setTimeout(() => {
        syncMessage.style.display = 'none';
    }, 3000);
}

async function updateSyncStatus() {
    const storage = await chrome.storage.local.get(['lastSyncTime', 'lastSyncSource']);
    const statusText = document.getElementById('syncStatusText');
    const timeText = document.getElementById('lastSyncTime');
    
    if (storage.lastSyncTime) {
        const date = new Date(storage.lastSyncTime);
        const source = storage.lastSyncSource === 'aws' ? 'Fetched from AWS' : 
                       storage.lastSyncSource === 'pushed' ? 'Pushed to AWS' : 'Local only';
        
        statusText.textContent = `✓ ${source}`;
        statusText.style.color = '#4caf50';
        timeText.textContent = `Last sync: ${date.toLocaleString()}`;
    } else {
        statusText.textContent = '⚠ Not synced';
        statusText.style.color = '#ff9800';
        timeText.textContent = '';
    }
}

// Initialize sync controls when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Add event listeners for sync buttons
    const fetchBtn = document.getElementById('fetchFromAWS');
    const pushBtn = document.getElementById('pushToAWS');
    const autoSyncCheckbox = document.getElementById('autoSync');
    
    if (fetchBtn) fetchBtn.addEventListener('click', fetchFromAWS);
    if (pushBtn) pushBtn.addEventListener('click', pushToAWS);
    
    if (autoSyncCheckbox) {
        // Load auto-sync preference
        chrome.storage.local.get(['syncWithAWS'], (result) => {
            autoSyncCheckbox.checked = result.syncWithAWS !== false;
        });
        
        // Save auto-sync preference
        autoSyncCheckbox.addEventListener('change', () => {
            chrome.storage.local.set({ syncWithAWS: autoSyncCheckbox.checked });
        });
    }
    
    // Update sync status on load
    updateSyncStatus();
});

$("save").addEventListener("click", save);
$("reset").addEventListener("click", reset);
load();
