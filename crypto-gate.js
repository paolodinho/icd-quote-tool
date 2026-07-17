/* crypto-gate.js — Cổng mật khẩu: giải mã data-enc.json (AES-256-GCM) rồi khởi động app.
   Không có mật khẩu đúng = không giải ra dữ liệu. Chạy trước app.js. */
(function () {
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  async function decrypt(enc, pass) {
    const salt = b64(enc.salt), iv = b64(enc.iv), blob = b64(enc.ct);
    const baseKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: enc.iter || 250000, hash: "SHA-256" },
      baseKey, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
    );
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, blob);
    return JSON.parse(new TextDecoder().decode(pt));
  }

  async function tryUnlock() {
    const pass = document.getElementById("gate-pass").value;
    const msg = document.getElementById("gate-msg");
    const btn = document.getElementById("gate-btn");
    msg.textContent = "Đang mở khóa...";
    btn.disabled = true;
    try {
      const enc = await (await fetch("data-enc.json?cb=" + Date.now())).json();
      const data = await decrypt(enc, pass);
      window.__DATA = data;
      try { sessionStorage.setItem("icd-quote-pass", pass); } catch (e) {}
      document.getElementById("gate").style.display = "none";
      document.getElementById("app-root").style.display = "";
      if (window.bootApp) window.bootApp();
    } catch (e) {
      msg.textContent = "Sai mật khẩu. Thử lại.";
      msg.style.color = "#B91C1C";
      btn.disabled = false;
    }
  }

  window.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("gate-btn");
    const inp = document.getElementById("gate-pass");
    btn.addEventListener("click", tryUnlock);
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") tryUnlock(); });
    // tự mở lại nếu đã nhập trong phiên
    const saved = (() => { try { return sessionStorage.getItem("icd-quote-pass"); } catch (e) { return null; } })();
    if (saved) { inp.value = saved; tryUnlock(); } else { inp.focus(); }
  });
})();
