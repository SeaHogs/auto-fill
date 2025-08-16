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

$("save").addEventListener("click", save);
$("reset").addEventListener("click", reset);
load();
