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

// Initialize AWS service (mock by default) - ONLY if aws-service.js is loaded
let awsService = null;
if (typeof FieldMatchingService !== 'undefined') {
    awsService = new FieldMatchingService({ useMockService: true });
    console.log("[AutoFill] AWS service initialized (mock mode)");
}

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
// ENHANCED FIELD KEY GUESSING WITH DEBUG TRACKING
// ============================================

// Global flag to enable detailed debugging
const DEBUG_MODE = true;  // Set to false in production

// Track statistics for each matching method
const matchingStats = {
    autocomplete: { attempts: 0, successes: 0 },
    nameHints: { attempts: 0, successes: 0 },
    awsService: { attempts: 0, successes: 0 },
    dynamic: { attempts: 0, successes: 0 },
    rules: { attempts: 0, successes: 0 },
    typeHints: { attempts: 0, successes: 0 },
    failed: { count: 0 }
};

async function guessFieldKey(input, meta, profile) {
    const debugInfo = {
        field: `${meta.name || meta.id || 'unknown'}`,
        label: meta.label,
        matchMethod: null,
        confidence: 0,
        attempts: []
    };

    // 1. Check autocomplete attribute first
    matchingStats.autocomplete.attempts++;
    const ac = (input.getAttribute("autocomplete") || "").trim().toLowerCase();
    if (AUTOCOMPLETE_MAP[ac] !== undefined && AUTOCOMPLETE_MAP[ac] !== null) {
        matchingStats.autocomplete.successes++;
        debugInfo.matchMethod = 'autocomplete';
        debugInfo.confidence = 1.0;
        
        if (DEBUG_MODE) {
            console.log(`✅ [AutoFill] AUTOCOMPLETE match for "${debugInfo.field}": ${AUTOCOMPLETE_MAP[ac]}`);
        }
        
        return AUTOCOMPLETE_MAP[ac];
    }
    debugInfo.attempts.push({ method: 'autocomplete', result: 'failed' });
    
    // 2. Check for grouped name hints
    matchingStats.nameHints.attempts++;
    const grouped = nameHintFromAttrs(meta.name, meta.id);
    if (grouped) {
        matchingStats.nameHints.successes++;
        debugInfo.matchMethod = 'nameHints';
        debugInfo.confidence = 0.9;
        
        if (DEBUG_MODE) {
            console.log(`✅ [AutoFill] NAME HINTS match for "${debugInfo.field}": ${grouped}`);
        }
        
        return grouped;
    }
    debugInfo.attempts.push({ method: 'nameHints', result: 'failed' });
    
    // 3. Try AWS service if available
    if (awsService && profile && typeof SERVICE_CONFIG !== 'undefined' && !SERVICE_CONFIG.useMockService) {
        matchingStats.awsService.attempts++;
        try {
            const fieldContext = dynamicMatcher.extractFieldContext(input);
            const awsMatch = await awsService.matchField(fieldContext);
            
            if (awsMatch.confidence > 0.8) {
                matchingStats.awsService.successes++;
                debugInfo.matchMethod = 'awsService';
                debugInfo.confidence = awsMatch.confidence;
                
                if (DEBUG_MODE) {
                    console.log(`✅ [AutoFill] AWS SERVICE match for "${debugInfo.field}": ${awsMatch.fieldType} (confidence: ${awsMatch.confidence})`);
                }
                
                return awsMatch.fieldType;
            }
            debugInfo.attempts.push({ method: 'awsService', result: `low confidence (${awsMatch.confidence})` });
        } catch (error) {
            debugInfo.attempts.push({ method: 'awsService', result: `error: ${error.message}` });
        }
    }
    
    // 4. Try dynamic matching if profile is provided
    if (profile) {
        matchingStats.dynamic.attempts++;
        const fieldContext = dynamicMatcher.extractFieldContext(input);
        const match = dynamicMatcher.matchFieldToProfile(fieldContext, profile);
        
        if (match.confidence >= 0.5) {
            matchingStats.dynamic.successes++;
            debugInfo.matchMethod = 'dynamic';
            debugInfo.confidence = match.confidence;
            
            if (DEBUG_MODE) {
                console.log(`✅ [AutoFill] DYNAMIC match for "${debugInfo.field}": ${match.key} (confidence: ${match.confidence.toFixed(2)})`);
            }
            
            return match.key;
        }
        debugInfo.attempts.push({ method: 'dynamic', result: `low confidence (${match.confidence.toFixed(2)})` });
        
        // Log near-misses for debugging
        if (DEBUG_MODE && match.confidence > 0.3) {
            console.warn(`⚠️ [AutoFill] NEAR MISS - Dynamic match for "${debugInfo.field}": ${match.key} (confidence: ${match.confidence.toFixed(2)}, threshold: 0.5)`);
        }
    }
    
    // 5. Fall back to original rule-based matching
    matchingStats.rules.attempts++;
    let best = { key: null, score: -1 };
    for (const rule of FIELD_RULES) {
        const sc = scoreLabelAgainstRule(meta.label, meta.placeholder, meta.name, meta.id, rule);
        if (sc > best.score) best = { key: rule.key, score: sc };
    }

    if (best.key === "birthday") {
        const s = norm([meta.label, meta.placeholder, meta.name, meta.id].join(" "));
        if (/\b(year|yyyy|yy)\b/.test(s)) best.key = "birthYear";
        else if (/\b(month|mm)\b/.test(s)) best.key = "birthMonth";
        else if (/\b(day|dd)\b/.test(s)) best.key = "birthDay";
    }

    if (best.score >= 3) {
        matchingStats.rules.successes++;
        debugInfo.matchMethod = 'rules';
        debugInfo.confidence = best.score / 10; // Normalize score to 0-1
        
        if (DEBUG_MODE) {
            console.log(`⚠️ [AutoFill] FALLBACK RULES match for "${debugInfo.field}": ${best.key} (score: ${best.score})`);
        }
        
        return best.key;
    }
    debugInfo.attempts.push({ method: 'rules', result: `low score (${best.score})` });

    // 6. Last resort: input type hints
    matchingStats.typeHints.attempts++;
    let typeMatch = null;
    if (input.type === "email") typeMatch = "email";
    else if (input.type === "tel") typeMatch = "phone";
    else if (input.type === "url") typeMatch = "website";
    
    if (typeMatch) {
        matchingStats.typeHints.successes++;
        debugInfo.matchMethod = 'typeHints';
        debugInfo.confidence = 0.3;
        
        if (DEBUG_MODE) {
            console.log(`⚠️ [AutoFill] TYPE HINT match for "${debugInfo.field}": ${typeMatch} (based on input type="${input.type}")`);
        }
        
        return typeMatch;
    }
    
    // No match found
    matchingStats.failed.count++;
    
    if (DEBUG_MODE) {
        console.log(`❌ [AutoFill] NO MATCH for field:`, {
            field: debugInfo.field,
            label: meta.label,
            placeholder: meta.placeholder,
            attempts: debugInfo.attempts
        });
    }
    
    return null;
}

// ============================================
// STATISTICS REPORTING
// ============================================

function reportMatchingStatistics() {
    console.group('📊 [AutoFill] Matching Statistics');
    
    const total = Object.values(matchingStats).reduce((sum, stat) => 
        sum + (stat.attempts || stat.count || 0), 0);
    
    console.table({
        'Autocomplete': {
            'Attempts': matchingStats.autocomplete.attempts,
            'Successes': matchingStats.autocomplete.successes,
            'Success Rate': matchingStats.autocomplete.attempts > 0 
                ? `${(matchingStats.autocomplete.successes / matchingStats.autocomplete.attempts * 100).toFixed(1)}%`
                : 'N/A'
        },
        'Name Hints': {
            'Attempts': matchingStats.nameHints.attempts,
            'Successes': matchingStats.nameHints.successes,
            'Success Rate': matchingStats.nameHints.attempts > 0
                ? `${(matchingStats.nameHints.successes / matchingStats.nameHints.attempts * 100).toFixed(1)}%`
                : 'N/A'
        },
        'Dynamic Matcher': {
            'Attempts': matchingStats.dynamic.attempts,
            'Successes': matchingStats.dynamic.successes,
            'Success Rate': matchingStats.dynamic.attempts > 0
                ? `${(matchingStats.dynamic.successes / matchingStats.dynamic.attempts * 100).toFixed(1)}%`
                : 'N/A'
        },
        'Rule-Based (Fallback)': {
            'Attempts': matchingStats.rules.attempts,
            'Successes': matchingStats.rules.successes,
            'Success Rate': matchingStats.rules.attempts > 0
                ? `${(matchingStats.rules.successes / matchingStats.rules.attempts * 100).toFixed(1)}%`
                : 'N/A'
        },
        'Type Hints': {
            'Attempts': matchingStats.typeHints.attempts,
            'Successes': matchingStats.typeHints.successes,
            'Success Rate': matchingStats.typeHints.attempts > 0
                ? `${(matchingStats.typeHints.successes / matchingStats.typeHints.attempts * 100).toFixed(1)}%`
                : 'N/A'
        },
        'Failed': {
            'Count': matchingStats.failed.count,
            'Failure Rate': total > 0 ? `${(matchingStats.failed.count / total * 100).toFixed(1)}%` : 'N/A'
        }
    });
    
    // Performance summary
    const dynamicSuccess = matchingStats.dynamic.attempts > 0
        ? (matchingStats.dynamic.successes / matchingStats.dynamic.attempts * 100).toFixed(1)
        : 0;
    
    const rulesSuccess = matchingStats.rules.attempts > 0
        ? (matchingStats.rules.successes / matchingStats.rules.attempts * 100).toFixed(1)
        : 0;
    
    console.log(`🎯 Dynamic Matcher Success Rate: ${dynamicSuccess}%`);
    console.log(`📋 Rules Fallback Success Rate: ${rulesSuccess}%`);
    
    if (matchingStats.rules.successes > 0) {
        console.warn(`⚠️ Rules fallback was used ${matchingStats.rules.successes} times - Dynamic matcher needs improvement for these cases`);
    }
    
    if (matchingStats.dynamic.successes > matchingStats.rules.successes) {
        console.log(`✅ Dynamic matcher is outperforming rules! Consider removing fallback in next version.`);
    }
    
    console.groupEnd();
}

// ============================================
// VISUAL DEBUG OVERLAY (Optional)
// ============================================

function createDebugOverlay() {
    // Create a floating debug panel
    const panel = document.createElement('div');
    panel.id = 'autofill-debug-panel';
    panel.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        width: 300px;
        background: rgba(0, 0, 0, 0.9);
        color: #0f0;
        font-family: monospace;
        font-size: 12px;
        padding: 10px;
        border-radius: 5px;
        z-index: 999999;
        max-height: 400px;
        overflow-y: auto;
    `;
    
    panel.innerHTML = `
        <h3 style="margin: 0 0 10px 0; color: #0f0;">AutoFill Debug</h3>
        <div id="debug-stats"></div>
        <button id="clear-debug" style="margin-top: 10px;">Clear Stats</button>
        <button id="close-debug" style="margin-top: 10px;">Close</button>
    `;
    
    document.body.appendChild(panel);
    
    // Update stats display
    function updateDebugDisplay() {
        const statsDiv = document.getElementById('debug-stats');
        statsDiv.innerHTML = `
            <div>Dynamic: ${matchingStats.dynamic.successes}/${matchingStats.dynamic.attempts}</div>
            <div>Rules: ${matchingStats.rules.successes}/${matchingStats.rules.attempts}</div>
            <div>Failed: ${matchingStats.failed.count}</div>
        `;
    }
    
    updateDebugDisplay();
    
    // Button handlers
    document.getElementById('clear-debug').onclick = () => {
        Object.keys(matchingStats).forEach(key => {
            if (matchingStats[key].attempts !== undefined) {
                matchingStats[key].attempts = 0;
                matchingStats[key].successes = 0;
            } else {
                matchingStats[key].count = 0;
            }
        });
        updateDebugDisplay();
    };
    
    document.getElementById('close-debug').onclick = () => {
        panel.remove();
    };
    
    return updateDebugDisplay;
}

// ============================================
// ENHANCED FILL FUNCTION WITH REPORTING
// ============================================

async function fillNowWithDebug() {
    // Reset stats for this fill operation
    if (DEBUG_MODE) {
        console.group('🔍 [AutoFill] Starting Fill Operation');
    }
    
    // Run normal fill
    await fillNow();
    
    // Report statistics
    if (DEBUG_MODE) {
        reportMatchingStatistics();
        console.groupEnd();
    }
}

// ============================================
// ADD DEBUG COMMANDS
// ============================================

// Make functions available in console for testing
window.autofillDebug = {
    stats: () => reportMatchingStatistics(),
    showPanel: () => createDebugOverlay(),
    setDebugMode: (enabled) => { 
        window.DEBUG_MODE = enabled;
        console.log(`Debug mode ${enabled ? 'enabled' : 'disabled'}`);
    },
    testDynamic: async () => {
        // Force dynamic matcher only
        const tempThreshold = dynamicMatcher.similarityThreshold;
        dynamicMatcher.similarityThreshold = 0; // Accept any match
        await fillNowWithDebug();
        dynamicMatcher.similarityThreshold = tempThreshold;
    },
    testRules: async () => {
        // Force rules only by temporarily disabling dynamic
        const temp = dynamicMatcher.matchFieldToProfile;
        dynamicMatcher.matchFieldToProfile = () => ({ key: null, confidence: 0 });
        await fillNowWithDebug();
        dynamicMatcher.matchFieldToProfile = temp;
    }
};

console.log('💡 [AutoFill] Debug mode enabled. Use window.autofillDebug.stats() to see statistics.');

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
// PROFILE LOADER (CHANGED)
// ============================================
async function getUserIdentifier() {
    const storage = await chrome.storage.local.get(['currentUserId']);
    return storage.currentUserId || 'default-user';
}

async function loadProfile() {
    console.log('[AutoFill] Loading profile...');
    
    // Check if we should sync with AWS
    const settings = await chrome.storage.local.get(['syncWithAWS', 'lastSyncTime']);
    const shouldSync = settings.syncWithAWS !== false; // Default to true
    const lastSync = settings.lastSyncTime || 0;
    const hoursSinceSync = (Date.now() - lastSync) / (1000 * 60 * 60);
    
    // Try to load from AWS if enabled and it's been > 1 hour
    if (shouldSync && hoursSinceSync > 1 && typeof StorageService !== 'undefined') {
        try {
            console.log('[AutoFill] Fetching latest profile from AWS...');
            const storageService = new StorageService(SERVICE_CONFIG);
            const userId = await getUserIdentifier();
            const remoteProfile = await storageService.loadProfile(userId);
            
            if (remoteProfile && remoteProfile.data) {
                console.log('[AutoFill] Successfully fetched profile from AWS');
                
                // Save AWS data locally (user can edit this)
                await chrome.storage.local.set({ 
                    af_profile: remoteProfile.data,
                    lastSyncTime: Date.now(),
                    lastSyncSource: 'aws'
                });
                
                return remoteProfile.data;
            }
        } catch (error) {
            console.warn('[AutoFill] Could not fetch from AWS:', error);
        }
    }
    
    // Load from local storage (either AWS-synced or user-edited)
    const local = await chrome.storage.local.get(["af_profile", "af_profile_enc"]);
    
    if (local.af_profile_enc) {
        // Handle encrypted profile
        let pass = "";
        try { 
            const s = await chrome.storage.session.get("af_passphrase"); 
            pass = s.af_passphrase || ""; 
        } catch {}
        
        if (!pass) { 
            console.warn("[AutoFill] Encrypted profile present but locked"); 
            return null; 
        }
        
        try { 
            return await AF_CRYPTO.decryptJSON(local.af_profile_enc, pass); 
        } catch (e) { 
            console.warn("[AutoFill] Decryption failed:", e?.message); 
            return null; 
        }
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