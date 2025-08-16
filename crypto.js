// WebCrypto helpers
const AF_CRYPTO = (() => {
    const enc = new TextEncoder();
    const dec = new TextDecoder();

    function u8ToB64(u8) {
        let s = "";
        for (let i = 0; i < u8.length; i += 0x8000) {
            s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
        }
        return btoa(s);
    }
    function b64ToU8(b64) {
        const bin = atob(b64);
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        return u8;
    }

    async function deriveKey(passphrase, saltU8, iterations = 200000) {
        const baseKey = await crypto.subtle.importKey(
            "raw", enc.encode(passphrase), { name: "PBKDF2" }, false, ["deriveKey"]
        );
        return crypto.subtle.deriveKey(
            { name: "PBKDF2", salt: saltU8, iterations, hash: "SHA-256" },
            baseKey, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
        );
    }

    async function encryptJSON(obj, passphrase, iterations = 200000) {
        if (!passphrase) throw new Error("Passphrase required");
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const key = await deriveKey(passphrase, salt, iterations);
        const pt = enc.encode(JSON.stringify(obj));
        const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, pt));
        return {
            v: 1,
            algo: "AES-GCM",
            iters: iterations,
            iv: u8ToB64(iv),
            salt: u8ToB64(salt),
            ct: u8ToB64(ct)
        };
    }

    async function decryptJSON(bundle, passphrase) {
        if (!bundle || !passphrase) throw new Error("Missing bundle or passphrase");
        const iv = b64ToU8(bundle.iv);
        const salt = b64ToU8(bundle.salt);
        const key = await deriveKey(passphrase, salt, bundle.iters || 200000);
        const ct = b64ToU8(bundle.ct);
        const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
        return JSON.parse(dec.decode(new Uint8Array(pt)));
    }

    return { encryptJSON, decryptJSON };
})();
