// Mark readiness
window.__AF_CONTENT_READY__ = true;
console.debug("[AutoFill] content script loaded on", location.href);

// matching utils
function norm(s) {
    return (s || "").toLowerCase().replace(/[_\-:/()]/g, " ").replace(/\s+/g, " ").trim();
}

const FIELD_RULES = [
    { key: "email", any: ["email","e-mail","mail"] },
    { key: "phone", any: ["phone","mobile","contact number","telephone","tel"] },
    { key: "birthday", any: ["birthday","birth date","date of birth","dob","birthdate"] },
    { key: "firstName", any: ["first name","given name","forename","given"] },
    { key: "lastName",  any: ["last name","surname","family name","family","surname"] },
    { key: "fullName",  any: ["full name","name of applicant","your name","name"] },
    { key: "address1",  any: ["address","street address","address line","unit no"] },
    { key: "city",      any: ["city","town"] },
    { key: "postalCode",any: ["postal code","zip","zip code","postcode"] },
    { key: "country",   any: ["country","nation","country/region"] },
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

const AUTOCOMPLETE_MAP = {
    "email": "email",
    "tel": "phone",
    "url": "website",
    "given-name": "firstName",
    "additional-name": null,
    "family-name": "lastName",
    "name": "fullName",
    "organization": "university",
    "address-line1": "address1",
    "postal-code": "postalCode",
    "country": "country",
    "country-name": "country",
    "bday": "birthday",
    "bday-day": "birthDay",
    "bday-month": "birthMonth",
    "bday-year": "birthYear",
};

function scoreLabelAgainstRule(label, placeholder, nameAttr, idAttr, rule) {
    const hay = norm([label, placeholder, nameAttr, idAttr].filter(Boolean).join(" "));
    let s = 0;
    for (const cand of rule.any) {
        const c = norm(cand); if (!c) continue;
        if (hay === c) s += 4;
        else if (hay.startsWith(c)) s += 3;
        else if (hay.includes(c)) s += 2;
        const hits = c.split(" ").filter(t => hay.includes(t)).length;
        s += Math.min(2, hits);
    }
    if (/email/.test(hay)) s += 1;
    if (/\b(tel|phone|mobile)\b/.test(hay)) s += 1;
    if (/zip|postal/.test(hay)) s += 1;
    return s;
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
    if (el.disabled || el.readOnly) return false;
    if (el instanceof HTMLInputElement) {
        if (["hidden","password","file"].includes(el.type)) return false;
        return true;
    }
    if (el instanceof HTMLTextAreaElement) return true;
    if (el instanceof HTMLSelectElement) return true;
    return false;
}

// Grouped name helpers (first/last detection via attributes)
function nameHintFromAttrs(nameAttr = "", idAttr = "") {
    const s = norm([nameAttr, idAttr].join(" "));
    if (/\bgiven|first|fname|first-?name\b/.test(s)) return "firstName";
    if (/\bfamily|last|lname|last-?name|surname\b/.test(s)) return "lastName";
    return null;
}

// Guess field key with heuristics + autocomplete + grouped names
function guessFieldKey(input, {label, placeholder, name, id}) {
    const ac = (input.getAttribute("autocomplete") || "").trim().toLowerCase();
    if (AUTOCOMPLETE_MAP[ac] !== undefined && AUTOCOMPLETE_MAP[ac] !== null) {
        return AUTOCOMPLETE_MAP[ac];
    }
    const grouped = nameHintFromAttrs(name, id);
    if (grouped) return grouped;

    // base rules
    let best = { key: null, score: -1 };
    for (const rule of FIELD_RULES) {
        const sc = scoreLabelAgainstRule(label, placeholder, name, id, rule);
        if (sc > best.score) best = { key: rule.key, score: sc };
    }

    if (best.key === "birthday") {
        const s = norm([label, placeholder, name, id].join(" "));
        if (/\b(year|yyyy|yy)\b/.test(s)) return "birthYear";
        if (/\b(month|mm)\b/.test(s)) return "birthMonth";
        if (/\b(day|dd)\b/.test(s)) return "birthDay";
    }

    // input-type nudges
    if (best.score < 3) {
        if (input.type === "email") return "email";
        if (input.type === "tel") return "phone";
        if (input.type === "url") return "website";
    }
    return best.score >= 3 ? best.key : null;
}

// ---------- value setters ----------
function fireInputEvents(el) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
}

function setTextLike(el, value) {
    if (value == null || value === "") return false;
    const prev = el.value;
    el.value = value;
    fireInputEvents(el);
    return el.value !== prev;
}

function normalizeCountry(s) {
    const x = norm(s);
    if (["us","usa","u s a","u.s.","u.s.a","united states","united states of america","america"].includes(x)) return "united states";
    if (["uk","u k","u.k.","united kingdom","great britain","britain","england"].includes(x)) return "united kingdom";
    if (["sg","s’pore","spore","singapura","republic of singapore"].includes(x)) return "singapore";
    return x;
}

function setSelectByTextOrValue(select, desiredRaw) {
    if (!desiredRaw) return false;
    const desired = norm(desiredRaw);
    const desiredCountry = normalizeCountry(desiredRaw);

    let best = null, bestScore = -1;
    for (const opt of Array.from(select.options)) {
        const val = norm(opt.value);
        const txt = norm(opt.textContent || "");
        const candidates = [val, txt];

        const scores = candidates.map(h => {
            if (!h) return -1;
            if (h === desired || h === desiredCountry) return 5;
            if (h.startsWith(desired)) return 4;
            if (h.includes(desired)) return 3;
            if (desired && h.includes(desired.split(" ")[0])) return 2;
            // country loose match
            if (normalizeCountry(h) === desiredCountry) return 4;
            return -1;
        });
        const s = Math.max(...scores);
        if (s > bestScore) { bestScore = s; best = opt; }
    }
    if (best && bestScore >= 3) {
        select.value = best.value;
        fireInputEvents(select);
        return true;
    }
    return false;
}

function setDateInput(input, key, profile) {
    // Fill common cases we actually store
    if (key === "gradYear" && profile.gradYear) {
        const y = String(profile.gradYear).padStart(4, "0");
        const v = `${y}-06-01`; // neutral mid-year
        input.value = v;
        fireInputEvents(input);
        return true;
    }
    if (key === "birthday" && profile.birthday) {
        input.value = profile.birthday;
        fireInputEvents(input);
        return true;
    }
    return false;
}

function decorate(el, ok) {
    el.setAttribute("data-af-filled", ok ? "1" : "0");
    el.style.outline = ok ? "2px solid #26a269" : "2px dashed #c01c28";
    el.style.outlineOffset = "2px";
}

// ---------- profile loader (supports encryption) ----------
async function loadProfile() {
    const local = await chrome.storage.local.get(["af_profile", "af_profile_enc"]);
    if (local.af_profile_enc) {
        let pass = "";
        try { const s = await chrome.storage.session.get("af_passphrase"); pass = s.af_passphrase || ""; } catch {}
        if (!pass) { console.warn("[AutoFill] Encrypted profile present but locked. Use popup to Unlock."); return null; }
        try { return await AF_CRYPTO.decryptJSON(local.af_profile_enc, pass); }
        catch (e) { console.warn("[AutoFill] Decryption failed:", e?.message); return null; }
    }
    return local.af_profile || null;
}

// ---------- main actions ----------
async function fillNow() {
    const profile = await loadProfile();
    if (!profile) { console.info("[AutoFill] No usable profile (missing/locked)."); return; }

    const elements = Array.from(document.querySelectorAll("input, textarea, select"));
    let filled = 0;

    for (const el of elements) {
        if (!isFillable(el)) continue;

        const meta = {
            label: getLabelTextForInput(el),
            placeholder: el.placeholder || "",
            name: el.name || "",
            id: el.id || ""
        };
        let key = guessFieldKey(el, meta);

        // Derived values
        let value = profile[key];

        if ((key === "birthYear" || key === "birthMonth" || key === "birthDay") && profile.birthday) {
            const [y, m, d] = profile.birthday.split("-");
            if (key === "birthYear") value = y;
            if (key === "birthMonth") value = String(parseInt(m, 10));
            if (key === "birthDay") value = String(parseInt(d, 10));
        }

        // FullName → split if specific fields exist
        if ((key === "firstName" || key === "lastName") && !value && profile.fullName) {
            const parts = profile.fullName.trim().split(/\s+/);
            if (parts.length >= 2) {
                value = key === "firstName" ? parts.slice(0, -1).join(" ") : parts.at(-1);
            }
        }

        let ok = false;
        if (el instanceof HTMLSelectElement) {
            ok = setSelectByTextOrValue(el, value);
            if (!ok && key === "birthMonth") {
                const monthNum = parseInt(value, 10);
                if (!isNaN(monthNum)) {
                    const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
                    ok = setSelectByTextOrValue(el, MONTHS[monthNum - 1]);
                }
            }
        } else if (el instanceof HTMLInputElement && el.type === "date") {
            ok = setDateInput(el, key, profile);
            if (!ok && value && /^\d{4}-\d{2}-\d{2}$/.test(value)) ok = setTextLike(el, value);
        } else {
            ok = setTextLike(el, value);
        }
        decorate(el, ok);
        if (ok) filled++;
    }

    console.info(`[AutoFill] Filled ${filled} fields.`);
}

// Test logger from Sprint 1
function listFillableFields() {
    const elements = Array.from(document.querySelectorAll("input, textarea, select"));
    console.group("[AutoFill] Captured fillable fields:");
    elements.forEach(el => {
        const fillable = isFillable(el);
        const meta = {
            label: getLabelTextForInput(el),
            placeholder: el.placeholder || "",
            name: el.name || "",
            id: el.id || ""
        };
        const key = guessFieldKey(el, meta);
        console.log({
            tag: el.tagName.toLowerCase(),
            type: el instanceof HTMLInputElement ? el.type : (el instanceof HTMLSelectElement ? "select" : "textarea"),
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

// Message handlers
chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "AF_FILL_NOW") fillNow();
    if (msg?.type === "AF_LIST_FIELDS") listFillableFields();
});
