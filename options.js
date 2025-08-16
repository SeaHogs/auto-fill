const fields = [
    "firstName","lastName","fullName","email","phone",
    "address1","city","postalCode","country",
    "university","degree","major","gpa","gradYear",
    "linkedin","github","website","summary"
];

async function load() {
    const data = await chrome.storage.local.get("af_profile");
    const profile = data.af_profile || {};
    fields.forEach(k => {
        const el = document.getElementById(k);
        if (el && profile[k] !== undefined) el.value = profile[k];
    });
}
async function save() {
    const profile = {};
    fields.forEach(k => profile[k] = document.getElementById(k).value.trim());
    await chrome.storage.local.set({ af_profile: profile });
    alert("Saved!");
}
async function reset() {
    if (!confirm("Clear all stored profile data?")) return;
    await chrome.storage.local.remove("af_profile");
    await load();
}

document.getElementById("save").addEventListener("click", save);
document.getElementById("reset").addEventListener("click", reset);
load();
