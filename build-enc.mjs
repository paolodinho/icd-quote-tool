// build-enc.mjs — Mã hóa dữ liệu đầy đủ (SP có giá vốn + khách hàng) thành data-enc.json (an toàn để lên public repo).
// Dùng: QUOTE_PASS="matkhau" node build-enc.mjs
// Bản mã AES-256-GCM, khóa dẫn xuất PBKDF2-SHA256 250k vòng. Không có mật khẩu = không giải ra được.
import fs from "fs";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PASS = process.env.QUOTE_PASS;
if (!PASS || PASS.length < 4) { console.error("Thiếu QUOTE_PASS (>=4 ký tự)."); process.exit(1); }

const products = JSON.parse(fs.readFileSync(path.join(HERE, "data-private/products-full.json"), "utf8")).products;
const custRaw = JSON.parse(fs.readFileSync(path.join(HERE, "data-private/customers.json"), "utf8"));
const customers = custRaw.customers || custRaw;

const payload = JSON.stringify({ products, customers, updated: new Date().toISOString().slice(0, 10) });

const ITER = 250000;
const salt = crypto.randomBytes(16);
const iv = crypto.randomBytes(12);
const key = crypto.pbkdf2Sync(PASS, salt, ITER, 32, "sha256");
const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
const ct = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
const tag = cipher.getAuthTag();

const out = {
  v: 1, iter: ITER,
  salt: salt.toString("base64"),
  iv: iv.toString("base64"),
  ct: Buffer.concat([ct, tag]).toString("base64"), // GCM: ciphertext + tag
};
fs.writeFileSync(path.join(HERE, "data-enc.json"), JSON.stringify(out));
console.log(`Mã hóa xong: ${products.length} SP + ${customers.length} khách -> data-enc.json (${Math.round(out.ct.length/1024)}KB base64).`);
