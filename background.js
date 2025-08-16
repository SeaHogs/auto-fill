chrome.runtime.onInstalled.addListener(() => {
    // Seed defaults
    chrome.storage.local.get(["af_autoFillEnabled"], ({ af_autoFillEnabled }) => {
        if (af_autoFillEnabled === undefined) {
            chrome.storage.local.set({ af_autoFillEnabled: false });
        }
    });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === "AF_QUERY_LLM") {
        (async () => {
            try {
                const { af_llmBaseUrl, af_llmApiKey } = await chrome.storage.local.get(["af_llmBaseUrl", "af_llmApiKey"]);
                if (!af_llmBaseUrl) { sendResponse({}); return; }
                const headers = { "Content-Type": "application/json" };
                if (af_llmApiKey) headers["Authorization"] = `Bearer ${af_llmApiKey}`;
                const resp = await fetch(af_llmBaseUrl, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({ prompt: msg.prompt })
                });
                const data = await resp.json();
                sendResponse({ answer: data.answer || data.result || data.choices?.[0]?.text || "" });
            } catch (e) {
                console.warn("[AutoFill] LLM fetch failed:", e?.message);
                sendResponse({});
            }
        })();
        return true;
    }
});