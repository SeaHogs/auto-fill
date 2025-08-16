chrome.runtime.onInstalled.addListener(() => {
    // Seed defaults
    chrome.storage.local.get(["af_autoFillEnabled"], ({ af_autoFillEnabled }) => {
        if (af_autoFillEnabled === undefined) {
            chrome.storage.local.set({ af_autoFillEnabled: false });
        }
    });
});