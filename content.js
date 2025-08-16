window.__AF_CONTENT_READY__ = true;
console.debug("[AutoFill] content script loaded on", location.href);

function norm(s) {
    return (s || "")
        .toLowerCase()
        .replace(/[_\-:/()]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

// Simple Heuristic synonym buckets
const FIELD_RULES = [
    { key: "email", any: ["email","e-mail","mail"] },
    { key: "phone", any: ["phone","mobile","contact number","telephone","tel"] },
    { key: "firstName", any: ["first name","given name","forename"] },
    { key: "lastName",  any: ["last name","surname","family name"] },
    { key: "fullName",  any: ["full name","name of applicant","your name","name"] },
    { key: "address1",  any: ["address","street address","address line","unit no"] },
    { key: "city",      any: ["city","town"] },
    { key: "postalCode",any: ["postal code","zip","zip code","postcode"] },
    { key: "country",   any: ["country","nation"] },
    { key: "university",any: ["university","college","institution","school"] },
    { key: "degree",    any: ["degree","qualification","level of study","education level"] },
    { key: "major",     any: ["major","field of study","specialization","programme"] },
    { key: "gpa",       any: ["gpa","cgpa","cap","grade point"] },
    { key: "gradYear",  any: ["graduation year","year of graduation","grad year","completion year"] },
    { key: "linkedin",  any: ["linkedin","linkedin profile"] },
    { key: "github",    any: ["github","git hub"] },
    { key: "website",   any: ["website","portfolio","personal site","url"] },
    { key: "summary",   any: ["summary","bio","about you","profile summary","about me"] }
];

function scoreLabelAgainstRule(label, placeholder, nameAttr, idAttr, rule) {
    const hay = norm([label, placeholder, nameAttr, idAttr].filter(Boolean).join(" "));
    let s = 0;
    for (const cand of rule.any) {
        const c = norm(cand);
        if (!c) continue;
        if (hay === c) s += 4;
        else if (hay.startsWith(c)) s += 3;
        else if (hay.includes(c)) s += 2;
        const cTokens = c.split(" ");
        const hits = cTokens.filter(t => hay.includes(t)).length;
        s += Math.min(2, hits);
    }
    if (/email/.test(hay)) s += 1;
    if (/\b(tel|phone|mobile)\b/.test(hay)) s += 1;
    if (/zip|postal/.test(hay)) s += 1;
    return s;
}

function guessFieldKey({label, placeholder, name, id}) {
    let best = { key: null, score: -1 };
    for (const rule of FIELD_RULES) {
        const sc = scoreLabelAgainstRule(label, placeholder, name, id, rule);
        if (sc > best.score) best = { key: rule.key, score: sc };
    }
    return best.score >= 3 ? best.key : null;
}

function getLabelTextForInput(input) {
    try {
        const id = input.id;
        let t = "";
        if (id) {
            const lbl = document.querySelector(`label[for="${CSS.escape(id)}"]`);
            if (lbl) t = lbl.innerText || lbl.textContent || "";
        }
        if (!t) {
            const parentLabel = input.closest("label");
            if (parentLabel) t = parentLabel.innerText || parentLabel.textContent || "";
        }
        if (!t) t = input.getAttribute("aria-label") || "";
        return t;
    } catch { return ""; }
}

function isFillable(el) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false;
    if (el.disabled || el.readOnly) return false;
    if (el.type === "hidden" || el.type === "password" || el.type === "file") return false;
    return true;
}

function setValue(el, value) {
    if (value == null || value === "") return false;
    const prev = el.value;
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return el.value !== prev;
}

function decorate(el, ok) {
    el.setAttribute("data-af-filled", ok ? "1" : "0");
    const out = ok ? "2px solid #26a269" : "2px dashed #c01c28";
    el.style.outline = out;
    el.style.outlineOffset = "2px";
}

async function fillNow() {
    const { af_profile } = await chrome.storage.local.get("af_profile");
    if (!af_profile) {
        console.info("[AutoFill] No profile saved yet.");
        return;
    }
    const inputs = Array.from(document.querySelectorAll("input, textarea"));
    let filled = 0;
    for (const input of inputs) {
        if (!isFillable(input)) continue;
        const meta = {
            label: getLabelTextForInput(input),
            placeholder: input.placeholder || "",
            name: input.name || "",
            id: input.id || ""
        };
        let key = guessFieldKey(meta);
        if (!key && input.type === "email") key = "email";
        if (!key && input.type === "tel") key = "phone";
        if (!key && input.type === "url") key = "website";
        let value = null;
        if ((key === "firstName" || key === "lastName") && !af_profile[key] && af_profile.fullName) {
            const parts = af_profile.fullName.trim().split(/\s+/);
            if (parts.length >= 2) {
                if (key === "firstName") value = parts.slice(0, -1).join(" ");
                else value = parts.at(-1);
            }
        }
        if (value == null) value = af_profile[key];
        const ok = setValue(input, value);
        decorate(input, ok);
        if (ok) filled++;
    }
    console.info(`[AutoFill] Filled ${filled} fields.`);
}

// --- TEST FUNCTION ---
function listFillableFields() {
    const inputs = Array.from(document.querySelectorAll("input, textarea"));
    console.group("[AutoFill] Captured fillable fields:");
    inputs.forEach(input => {
        const fillable = isFillable(input);
        const meta = {
            label: getLabelTextForInput(input),
            placeholder: input.placeholder || "",
            name: input.name || "",
            id: input.id || ""
        };
        const key = guessFieldKey(meta);
        console.log({
            tag: input.tagName.toLowerCase(),
            type: input.type || "",
            fillable,
            label: meta.label,
            placeholder: meta.placeholder,
            name: meta.name,
            id: meta.id,
            guessedKey: key
        });
    });
    console.groupEnd();
}

// Auto-fill on load if enabled
chrome.storage.local.get(["af_autoFillEnabled"], ({ af_autoFillEnabled }) => {
    if (af_autoFillEnabled) fillNow();
});

// Manual triggers
chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "AF_FILL_NOW") fillNow();
    if (msg?.type === "AF_LIST_FIELDS") listFillableFields();
});
