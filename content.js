// Mark readiness
window.__AF_CONTENT_READY__ = true;
console.debug("[AutoFill] content script loaded on", location.href);

// ============================================
// DYNAMIC FIELD MATCHER CLASS
// ============================================
class DynamicFieldMatcher {
    constructor() {
        this.fieldKnowledge = new Map();
        this.linguisticPatterns = {
            personalInfo: /\b(name|first|last|surname|given|middle|initial|title|mr|ms|mrs)\b/i,
            contact: /\b(email|mail|phone|tel|mobile|cell|fax|contact|reach)\b/i,
            location: /\b(address|street|city|state|country|zip|postal|region|province)\b/i,
            temporal: /\b(date|year|month|day|time|when|deadline|start|end|from|to)\b/i,
            identification: /\b(id|number|code|ssn|passport|license|registration)\b/i,
            academic: /\b(school|university|college|degree|major|gpa|grade|education|study)\b/i,
            professional: /\b(company|employer|job|position|title|work|experience|salary)\b/i,
            financial: /\b(amount|price|cost|fee|payment|account|bank|card)\b/i,
            web: /\b(url|website|link|profile|portfolio|github|linkedin|twitter)\b/i,
            descriptive: /\b(description|summary|bio|about|details|notes|comments|message)\b/i
        };
        this.ngramCache = new Map();
        this.similarityThreshold = 0.5; // Lowered for better matching
    }

    generateNgrams(text, n = 3) {
        if (!text) return new Set();
        const key = `${text}_${n}`;
        if (this.ngramCache.has(key)) return this.ngramCache.get(key);
        
        const normalized = text.toLowerCase().replace(/[^a-z0-9]/g, '');
        const ngrams = new Set();
        
        for (let i = 0; i <= normalized.length - n; i++) {
            ngrams.add(normalized.substr(i, n));
        }
        
        this.ngramCache.set(key, ngrams);
        return ngrams;
    }

    generateWordFeatures(text) {
        if (!text) return new Set();
        const words = text.toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 1);
        return new Set(words);
    }

    calculateSimilarity(text1, text2) {
        const ngrams1 = this.generateNgrams(text1);
        const ngrams2 = this.generateNgrams(text2);
        const ngramSim = this.jaccardSimilarity(ngrams1, ngrams2);
        
        const words1 = this.generateWordFeatures(text1);
        const words2 = this.generateWordFeatures(text2);
        const wordSim = this.jaccardSimilarity(words1, words2);
        
        return (ngramSim * 0.4 + wordSim * 0.6);
    }

    jaccardSimilarity(set1, set2) {
        if (set1.size === 0 && set2.size === 0) return 1;
        if (set1.size === 0 || set2.size === 0) return 0;
        
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        return intersection.size / union.size;
    }

    matchFieldToProfile(fieldContext, profile) {
        // First check autocomplete
        if (fieldContext.autocomplete && profile[fieldContext.autocomplete]) {
            return { key: fieldContext.autocomplete, confidence: 1.0 };
        }
        
        let bestMatch = { key: null, confidence: 0 };
        
        for (const [profileKey, profileValue] of Object.entries(profile)) {
            if (!profileValue || typeof profileValue === 'object') continue;
            
            const keySimilarity = this.calculateSimilarity(fieldContext.combinedText, profileKey);
            
            const keyVariations = this.generateKeyVariations(profileKey);
            let maxVariationSim = keySimilarity;
            
            for (const variation of keyVariations) {
                const sim = this.calculateSimilarity(fieldContext.combinedText, variation);
                maxVariationSim = Math.max(maxVariationSim, sim);
            }
            
            let patternBoost = 0;
            for (const [patternType, pattern] of Object.entries(this.linguisticPatterns)) {
                if (pattern.test(fieldContext.combinedText) && pattern.test(profileKey)) {
                    patternBoost += 0.1;
                }
            }
            
            const typeBoost = this.getTypeCompatibilityScore(fieldContext.type, profileKey, profileValue);
            const finalScore = maxVariationSim + patternBoost + typeBoost;
            
            if (finalScore > bestMatch.confidence) {
                bestMatch = { key: profileKey, confidence: finalScore };
            }
        }
        
        return bestMatch.confidence >= this.similarityThreshold ? bestMatch : { key: null, confidence: 0 };
    }

    generateKeyVariations(key) {
        const variations = new Set();
        variations.add(key.replace(/([A-Z])/g, ' $1').toLowerCase().trim());
        variations.add(key.replace(/_/g, ' '));
        variations.add(key.replace(/-/g, ' '));
        
        const abbreviations = {
            'firstname': 'first name',
            'lastname': 'last name',
            'fullname': 'full name',
            'phone': 'phone number',
            'email': 'email address',
            'dob': 'date of birth',
            'birthday': 'birth date',
            'address': 'street address',
            'zip': 'postal code',
            'postalcode': 'zip code',
            'website': 'web site',
            'gpa': 'grade point average',
            'university': 'college',
            'degree': 'education level',
            'major': 'field of study'
        };
        
        const lowerKey = key.toLowerCase();
        if (abbreviations[lowerKey]) {
            variations.add(abbreviations[lowerKey]);
        }
        
        return Array.from(variations);
    }

    getTypeCompatibilityScore(inputType, profileKey, profileValue) {
        const compatibilityMap = {
            'email': ['email'],
            'tel': ['phone', 'mobile', 'telephone'],
            'url': ['website', 'linkedin', 'github', 'portfolio'],
            'date': ['birthday', 'date', 'deadline', 'gradyear'],
            'number': ['age', 'year', 'gpa', 'score', 'salary', 'gradyear']
        };
        
        for (const [type, keywords] of Object.entries(compatibilityMap)) {
            if (inputType === type) {
                for (const keyword of keywords) {
                    if (profileKey.toLowerCase().includes(keyword)) {
                        return 0.2;
                    }
                }
            }
        }
        return 0;
    }

    extractFieldContext(element) {
        const context = {
            label: getLabelTextForInput(element),
            placeholder: element.placeholder || '',
            name: element.name || '',
            id: element.id || '',
            className: element.className || '',
            ariaLabel: element.getAttribute('aria-label') || '',
            autocomplete: element.autocomplete || '',
            type: element.type || ''
        };
        
        context.combinedText = [
            context.label,
            context.placeholder,
            context.name,
            context.id,
            context.ariaLabel
        ].filter(Boolean).join(' ').toLowerCase();
        
        return context;
    }
}

// Initialize the dynamic matcher
const dynamicMatcher = new DynamicFieldMatcher();

// ============================================
// ORIGINAL MATCHING UTILITIES (KEPT AS FALLBACK)
// ============================================
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

function nameHintFromAttrs(nameAttr = "", idAttr = "") {
    const s = norm([nameAttr, idAttr].join(" "));
    if (/\b(given|first|fname|first-?name)\b/.test(s)) return "firstName";
    if (/\b(family|last|lname|last-?name|surname)\b/.test(s)) return "lastName";
    return null;
}

// ============================================
// ENHANCED FIELD KEY GUESSING (COMBINES BOTH APPROACHES)
// ============================================
async function guessFieldKey(input, meta, profile) {
    // 1. Check autocomplete attribute first
    const ac = (input.getAttribute("autocomplete") || "").trim().toLowerCase();
    if (AUTOCOMPLETE_MAP[ac] !== undefined && AUTOCOMPLETE_MAP[ac] !== null) {
        return AUTOCOMPLETE_MAP[ac];
    }
    
    // 2. Check for grouped name hints
    const grouped = nameHintFromAttrs(meta.name, meta.id);
    if (grouped) return grouped;
    
    // 3. Try dynamic matching if profile is provided
    if (profile) {
        const fieldContext = dynamicMatcher.extractFieldContext(input);
        const match = dynamicMatcher.matchFieldToProfile(fieldContext, profile);
        
        if (match.confidence >= 0.5) {
            console.debug(`[AutoFill] Dynamic match: '${match.key}' (confidence: ${match.confidence.toFixed(2)})`);
            return match.key;
        }
    }
    
    // 4. Fall back to original rule-based matching
    let best = { key: null, score: -1 };
    for (const rule of FIELD_RULES) {
        const sc = scoreLabelAgainstRule(meta.label, meta.placeholder, meta.name, meta.id, rule);
        if (sc > best.score) best = { key: rule.key, score: sc };
    }

    if (best.key === "birthday") {
        const s = norm([meta.label, meta.placeholder, meta.name, meta.id].join(" "));
        if (/\b(year|yyyy|yy)\b/.test(s)) return "birthYear";
        if (/\b(month|mm)\b/.test(s)) return "birthMonth";
        if (/\b(day|dd)\b/.test(s)) return "birthDay";
    }

    if (best.score < 3) {
        if (input.type === "email") return "email";
        if (input.type === "tel") return "phone";
        if (input.type === "url") return "website";
    }
    
    return best.score >= 3 ? best.key : null;
}

// ============================================
// VALUE SETTERS (UNCHANGED)
// ============================================
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
    if (["sg","s'pore","spore","singapura","republic of singapore"].includes(x)) return "singapore";
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
    if (key === "gradYear" && profile.gradYear) {
        const y = String(profile.gradYear).padStart(4, "0");
        const v = `${y}-06-01`;
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

// ============================================
// PROFILE LOADER (UNCHANGED)
// ============================================
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

// ============================================
// DATE FIELD DETECTION AND HANDLING
// ============================================
function detectDateFieldType(element, meta) {
    const combinedText = [
        meta.label,
        meta.placeholder,
        meta.name,
        meta.id,
        element.className || ''
    ].filter(Boolean).join(' ').toLowerCase();
    
    // Detect day field
    if (/\b(day|dd|date)\b/.test(combinedText) && 
        !/\b(month|mm|year|yyyy|yy)\b/.test(combinedText)) {
        // Check if it's in a date group
        if (isPartOfDateGroup(element)) return "birthDay";
        if (/\b(birth|dob|born)\b/.test(combinedText)) return "birthDay";
    }
    
    // Detect month field
    if (/\b(month|mm)\b/.test(combinedText) && 
        !/\b(day|dd|year|yyyy|yy)\b/.test(combinedText)) {
        if (isPartOfDateGroup(element)) return "birthMonth";
        if (/\b(birth|dob|born)\b/.test(combinedText)) return "birthMonth";
    }
    
    // Detect year field
    if (/\b(year|yyyy|yy)\b/.test(combinedText) && 
        !/\b(day|dd|month|mm)\b/.test(combinedText)) {
        if (isPartOfDateGroup(element)) return "birthYear";
        if (/\b(birth|dob|born|grad)\b/.test(combinedText)) {
            return /\b(grad|graduation|complete)\b/.test(combinedText) ? "gradYear" : "birthYear";
        }
    }
    
    return null;
}

function isPartOfDateGroup(element) {
    // Check if this element is near other date-related fields
    const parent = element.closest('div, fieldset, section, tr');
    if (!parent) return false;
    
    const siblings = parent.querySelectorAll('input, select');
    let dateFieldCount = 0;
    
    for (const sibling of siblings) {
        const text = [
            sibling.name || '',
            sibling.id || '',
            sibling.className || '',
            getLabelTextForInput(sibling)
        ].join(' ').toLowerCase();
        
        if (/\b(day|month|year|dd|mm|yyyy)\b/.test(text)) {
            dateFieldCount++;
        }
    }
    
    return dateFieldCount >= 2; // At least 2 date-related fields nearby
}

function fillDateSelect(select, value, type) {
    if (!value) return false;
    
    if (type === 'day') {
        // Try different day formats
        const dayNum = parseInt(value, 10);
        const variations = [
            String(dayNum),                    // "5"
            String(dayNum).padStart(2, '0'),   // "05"
            `${dayNum}${getOrdinalSuffix(dayNum)}` // "5th"
        ];
        
        for (const variant of variations) {
            if (setSelectByTextOrValue(select, variant)) return true;
        }
    } else if (type === 'month') {
        const monthNum = parseInt(value, 10);
        if (isNaN(monthNum)) return false;
        
        // Try different month formats
        const MONTHS_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];
        const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        
        const variations = [
            String(monthNum),                      // "3"
            String(monthNum).padStart(2, '0'),     // "03"
            MONTHS_FULL[monthNum - 1],             // "March"
            MONTHS_SHORT[monthNum - 1],            // "Mar"
            `${monthNum} - ${MONTHS_FULL[monthNum - 1]}`, // "3 - March"
            `${String(monthNum).padStart(2, '0')} - ${MONTHS_FULL[monthNum - 1]}` // "03 - March"
        ];
        
        for (const variant of variations) {
            if (setSelectByTextOrValue(select, variant)) return true;
        }
    } else if (type === 'year') {
        // Try different year formats
        const yearStr = String(value);
        const variations = [
            yearStr,                               // "1995"
            yearStr.slice(-2)                      // "95" (last 2 digits)
        ];
        
        for (const variant of variations) {
            if (setSelectByTextOrValue(select, variant)) return true;
        }
    }
    
    return false;
}

function getOrdinalSuffix(day) {
    if (day > 3 && day < 21) return 'th';
    switch (day % 10) {
        case 1: return 'st';
        case 2: return 'nd';
        case 3: return 'rd';
        default: return 'th';
    }
}

// ============================================
// MAIN FILL FUNCTION (ENHANCED)
// ============================================
async function fillNow() {
    const profile = await loadProfile();
    if (!profile) { console.info("[AutoFill] No usable profile (missing/locked)."); return; }

    const elements = Array.from(document.querySelectorAll("input, textarea, select"));
    let filled = 0;
    
    // Track filled date components to avoid duplicates
    const filledDateComponents = new Set();

    for (const el of elements) {
        if (!isFillable(el)) continue;

        const meta = {
            label: getLabelTextForInput(el),
            placeholder: el.placeholder || "",
            name: el.name || "",
            id: el.id || ""
        };
        
        // First check for date field components
        let key = detectDateFieldType(el, meta);
        
        // If not a date component, use regular matching
        if (!key) {
            key = await guessFieldKey(el, meta, profile);
        }
        
        // Skip if we've already filled this date component type
        if (key && ['birthDay', 'birthMonth', 'birthYear'].includes(key)) {
            if (filledDateComponents.has(key)) continue;
            filledDateComponents.add(key);
        }

        // Derived values
        let value = profile[key];

        // Handle birthday components
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
            // Special handling for date selects
            if (key === "birthDay" && profile.birthday) {
                const [, , d] = profile.birthday.split("-");
                ok = fillDateSelect(el, d, 'day');
            } else if (key === "birthMonth" && profile.birthday) {
                const [, m] = profile.birthday.split("-");
                ok = fillDateSelect(el, m, 'month');
            } else if (key === "birthYear" && profile.birthday) {
                const [y] = profile.birthday.split("-");
                ok = fillDateSelect(el, y, 'year');
            } else if (key === "gradYear" && profile.gradYear) {
                ok = fillDateSelect(el, profile.gradYear, 'year');
            } else {
                // Regular select handling
                ok = setSelectByTextOrValue(el, value);
            }
        } else if (el instanceof HTMLInputElement) {
            if (el.type === "date") {
                ok = setDateInput(el, key, profile);
                if (!ok && value && /^\d{4}-\d{2}-\d{2}$/.test(value)) ok = setTextLike(el, value);
            } else if (el.type === "number" || el.type === "text") {
                // Handle numeric date inputs
                if (key === "birthDay" && profile.birthday) {
                    const [, , d] = profile.birthday.split("-");
                    ok = setTextLike(el, String(parseInt(d, 10)));
                } else if (key === "birthMonth" && profile.birthday) {
                    const [, m] = profile.birthday.split("-");
                    ok = setTextLike(el, String(parseInt(m, 10)));
                } else if (key === "birthYear" && profile.birthday) {
                    const [y] = profile.birthday.split("-");
                    ok = setTextLike(el, y);
                } else {
                    ok = setTextLike(el, value);
                }
            } else {
                ok = setTextLike(el, value);
            }
        } else {
            ok = setTextLike(el, value);
        }
        
        decorate(el, ok);
        if (ok) filled++;
    }

    console.info(`[AutoFill] Filled ${filled} fields.`);
}

// ============================================
// TEST LOGGER (UNCHANGED)
// ============================================
function listFillableFields() {
    const elements = Array.from(document.querySelectorAll("input, textarea, select"));
    console.group("[AutoFill] Captured fillable fields:");
    elements.forEach(async el => {
        const fillable = isFillable(el);
        const meta = {
            label: getLabelTextForInput(el),
            placeholder: el.placeholder || "",
            name: el.name || "",
            id: el.id || ""
        };
        const profile = await loadProfile();
        const key = await guessFieldKey(el, meta, profile);
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

// ============================================
// INITIALIZATION
// ============================================

// Load learned patterns on startup
chrome.storage.local.get(['af_field_knowledge'], (result) => {
    if (result.af_field_knowledge) {
        try {
            dynamicMatcher.fieldKnowledge = new Map(result.af_field_knowledge);
            console.debug("[AutoFill] Loaded field knowledge");
        } catch (e) {
            console.warn("[AutoFill] Failed to load field knowledge:", e);
        }
    }
});

// Save learned patterns periodically
setInterval(() => {
    const knowledge = Array.from(dynamicMatcher.fieldKnowledge.entries());
    chrome.storage.local.set({ af_field_knowledge: knowledge });
}, 30000); // Every 30 seconds

// Auto-fill on load if enabled
chrome.storage.local.get(["af_autoFillEnabled"], ({ af_autoFillEnabled }) => {
    if (af_autoFillEnabled) fillNow();
});

// Message handlers
chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "AF_FILL_NOW") fillNow();
    if (msg?.type === "AF_LIST_FIELDS") listFillableFields();
});