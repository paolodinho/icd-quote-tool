/* xlsx-fill.js - Vá giá trị ô trực tiếp vào XML của file .xlsx gốc (JSZip).
   Giữ nguyên 100% logo, ảnh, style, merge của template. Không dùng thư viện xlsx. */

const XlsxFill = (() => {
  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

  // Ghi text vào ô (inline string, bỏ shared string cũ)
  function setCellText(xml, ref, text) {
    const inner = `<is><t xml:space="preserve">${esc(text)}</t></is>`;
    return replaceCell(xml, ref, inner, ' t="inlineStr"');
  }

  // Ghi số vào ô
  function setCellNumber(xml, ref, num) {
    return replaceCell(xml, ref, `<v>${Number(num) || 0}</v>`, "");
  }

  function replaceCell(xml, ref, inner, typeAttr) {
    const re = new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`);
    if (!re.test(xml)) {
      // Ô chưa tồn tại trong XML: chèn vào cuối row tương ứng
      const rowNum = ref.match(/\d+/)[0];
      const rowRe = new RegExp(`(<row r="${rowNum}"[^>]*>)([\\s\\S]*?)(</row>)`);
      if (rowRe.test(xml)) {
        return xml.replace(rowRe, (m, open, cells, close) =>
          `${open}${cells}<c r="${ref}"${typeAttr}>${inner}</c>${close}`);
      }
      return xml; // row không có: bỏ qua
    }
    return xml.replace(re, (m, attrs) => {
      const cleaned = attrs.replace(/\s+t="[^"]*"/, "");
      return `<c r="${ref}"${cleaned}${typeAttr}>${inner}</c>`;
    });
  }

  // Nhân bản dòng sản phẩm: chèn `count` dòng sau baseRow, dịch mọi row/merge phía dưới
  function insertRows(xml, baseRow, count, perRowMergeCols) {
    if (count <= 0) return xml;

    // 1) Lấy XML dòng mẫu
    const tplRe = new RegExp(`<row r="${baseRow}"[^>]*>[\\s\\S]*?</row>`);
    const tplMatch = xml.match(tplRe);
    if (!tplMatch) throw new Error(`Không tìm thấy dòng mẫu ${baseRow}`);
    const tplRow = tplMatch[0];

    // 2) Dịch các dòng phía dưới (row r + cell r) xuống `count`
    xml = xml.replace(/<row r="(\d+)"([^>]*)(\/>|>)/g, (m, r, attrs, end) => {
      const n = Number(r);
      if (n <= baseRow) return m;
      return `<row r="${n + count}"${attrs}${end}`;
    });
    // cell refs: chỉ dịch cell thuộc dòng > baseRow
    xml = xml.replace(/<c r="([A-Z]+)(\d+)"/g, (m, col, r) => {
      const n = Number(r);
      if (n <= baseRow) return m;
      return `<c r="${col}${n + count}"`;
    });

    // 3) Tạo các dòng nhân bản (baseRow+1 .. baseRow+count)
    let clones = "";
    for (let i = 1; i <= count; i++) {
      clones += tplRow
        .replace(new RegExp(`<row r="${baseRow}"`), `<row r="${baseRow + i}"`)
        .replace(new RegExp(`<c r="([A-Z]+)${baseRow}"`, "g"), (m, col) => `<c r="${col}${baseRow + i}"`);
    }
    // chèn ngay sau dòng mẫu
    xml = xml.replace(tplRe, tplRow + clones);

    // 4) Dịch mergeCell phía dưới + thêm merge cho dòng mới
    xml = xml.replace(/<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\s*\/>/g, (m, c1, r1, c2, r2) => {
      const n1 = Number(r1), n2 = Number(r2);
      if (n1 <= baseRow) return m;
      return `<mergeCell ref="${c1}${n1 + count}:${c2}${n2 + count}"/>`;
    });
    let newMerges = "";
    for (let i = 1; i <= count; i++) {
      for (const [c1, c2] of perRowMergeCols) {
        newMerges += `<mergeCell ref="${c1}${baseRow + i}:${c2}${baseRow + i}"/>`;
      }
    }
    xml = xml.replace(/<mergeCells count="(\d+)">/, (m, c) =>
      `<mergeCells count="${Number(c) + count * perRowMergeCols.length}">`);
    xml = xml.replace(/<\/mergeCells>/, newMerges + "</mergeCells>");
    return xml;
  }

  /* Cấu hình 4 template */
  const TEMPLATES = {
    "mau-1": {
      file: "templates/mau-1.xlsx", label: "Mẫu 1 - ICD (có cột hình ảnh)",
      customer: { messrs: "C12", add: "C13", tel: "C14", fax: "C15", attn: "C16", mobile: "C17", email: "C18" },
      meta: { quotNo: "I12", date: "I13", incoterms: "I14", leadtime: "I15", pic: "I16", destination: "I17", payment: "I18", validity: "I19" },
      productRow: 21,
      cols: { stt: "A", desc: "B", unit: "F", qty: "G", price: "I", total: "J", note: "L" },
      rowMerges: [["B", "E"], ["G", "H"]],
      totals: { subtotal: ["J", 22], vat: ["J", 23], grand: ["J", 24], vatLabel: ["A", 23] },
      imgCol: "K",
    },
    "mau-2": {
      file: "templates/mau-2.xlsx", label: "Mẫu 2 - ICD (bản 2)",
      customer: { messrs: "C12", add: "C13", tel: "C14", fax: "C15", attn: "C16", mobile: "C17", email: "C18" },
      meta: { quotNo: "I12", date: "I13", incoterms: "I14", leadtime: "I15", pic: "I16", destination: "I17", payment: "I18", validity: "I19" },
      productRow: 21,
      cols: { stt: "A", desc: "B", unit: "F", qty: "G", price: "I", total: "J", note: "L" },
      rowMerges: [["B", "E"], ["G", "H"]],
      totals: { subtotal: ["J", 22], vat: ["J", 23], grand: ["J", 24], vatLabel: ["A", 23] },
      imgCol: "K",
    },
    "mau-3": {
      file: "templates/mau-3.xlsx", label: "Mẫu 3 - ICD (footer liên hệ)",
      customer: { messrs: "C12", add: "C13", tel: "C14", fax: "C15", attn: "C16", mobile: "C17", email: "C18" },
      meta: { quotNo: "I12", date: "I13", incoterms: "I14", leadtime: "I15", pic: "I16", destination: "I17", payment: "I18", validity: "I19" },
      productRow: 22,
      cols: { stt: "A", desc: "B", unit: "F", qty: "G", price: "I", total: "J", note: "K" },
      rowMerges: [["B", "E"], ["G", "H"]],
      totals: { subtotal: ["J", 23], vat: ["J", 24], grand: ["J", 25], vatLabel: ["A", 24] },
    },
    "mau-4": {
      file: "templates/mau-4.xlsx", label: "Mẫu 4 - Toàn Cầu Việt Nam",
      customer: { messrs: "C9", add: "C10", tel: "C11", fax: "C12", attn: "C13", mobile: "C14", email: "C15" },
      meta: { quotNo: "H9", date: "H10", incoterms: "H11", leadtime: "H12", pic: "H13", destination: "H14", payment: "H15", validity: "H16" },
      productRow: 19,
      cols: { stt: "A", desc: "B", unit: "E", qty: "F", price: "G", total: "H", note: "J" },
      rowMerges: [["B", "D"]],
      totals: { subtotal: ["H", 20], vat: ["H", 21], grand: ["H", 22], vatLabel: ["A", 21] },
      imgCol: "I",
    },
  };

  // Cột chữ -> chỉ số 0-based (A=0, K=10, I=8)
  const colToIdx = (letters) => { let n = 0; for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

  // Đưa mọi nguồn ảnh (data URI / URL) về PNG/JPEG base64. Trả {base64, ext} hoặc null nếu không đọc được (vd URL chặn CORS).
  function loadImageEl(src) {
    return new Promise((res) => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  }
  async function toImgData(src) {
    const dm = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(src || "");
    if (dm) return { base64: dm[2], ext: /png/i.test(dm[1]) ? "png" : "jpeg" };
    // webp/gif/bmp data URI, hoặc URL -> vẽ qua canvas ra PNG (URL chỉ được nếu host cho CORS)
    const img = await loadImageEl(src);
    if (!img) return null;
    try {
      const cv = document.createElement("canvas");
      cv.width = img.naturalWidth || img.width || 1;
      cv.height = img.naturalHeight || img.height || 1;
      cv.getContext("2d").drawImage(img, 0, 0);
      return { base64: cv.toDataURL("image/png").split(",")[1], ext: "png" };
    } catch (e) { return null; } // canvas bị "taint" do ảnh khác miền không cho CORS
  }

  // Nhúng ảnh sản phẩm vào cột hình ảnh của file xlsx (chèn vào drawing có sẵn của template).
  async function embedImages(zip, sheetPath, cfg, withImg) {
    const relsPath = sheetPath.replace(/worksheets\/(sheet\d+)\.xml$/, "worksheets/_rels/$1.xml.rels");
    if (!zip.file(relsPath)) return;
    const sheetRels = await zip.file(relsPath).async("string");
    const drRel = sheetRels.match(/<Relationship[^>]*Type="[^"]*\/drawing"[^>]*\/>/);
    if (!drRel) return; // template không có drawing -> bỏ qua (các mẫu ảnh đều có sẵn)
    const tgt = (drRel[0].match(/Target="([^"]+)"/) || [])[1] || "";
    const drawingPath = "xl/" + tgt.replace(/^(\.\.\/)+/, ""); // ../drawings/drawing1.xml -> xl/drawings/drawing1.xml
    const drRelsPath = drawingPath.replace(/drawings\/(drawing\d+)\.xml$/, "drawings/_rels/$1.xml.rels");
    if (!zip.file(drawingPath)) return;
    let drawingXml = await zip.file(drawingPath).async("string");
    let drawingRels = zip.file(drRelsPath) ? await zip.file(drRelsPath).async("string") : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;

    let maxRid = 0; (drawingRels.match(/Id="rId(\d+)"/g) || []).forEach((m) => { maxRid = Math.max(maxRid, Number(m.match(/\d+/)[0])); });
    const cIdx = colToIdx(cfg.imgCol);
    const usedExt = new Set();
    let newRels = "", newAnchors = "", k = 0;

    for (const { i, image } of withImg) {
      const data = await toImgData(image);
      if (!data) continue; // ảnh URL bị chặn CORS -> vẫn hiện ở preview/PDF, chỉ không vào .xlsx
      k++;
      const rid = "rId" + (maxRid + k);
      const fname = "qimg" + (maxRid + k) + "." + data.ext;
      usedExt.add(data.ext);
      zip.file("xl/media/" + fname, data.base64, { base64: true });
      newRels += `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${fname}"/>`;
      const r = cfg.productRow + i - 1; // 0-based row của ô ảnh
      const id = 5000 + maxRid + k;
      newAnchors += `<xdr:twoCellAnchor editAs="oneCell">`
        + `<xdr:from><xdr:col>${cIdx}</xdr:col><xdr:colOff>9525</xdr:colOff><xdr:row>${r}</xdr:row><xdr:rowOff>9525</xdr:rowOff></xdr:from>`
        + `<xdr:to><xdr:col>${cIdx + 1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r + 1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>`
        + `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${id}" name="qimg${id}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>`
        + `<xdr:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>`
        + `<xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:twoCellAnchor>`;
    }
    if (!k) return;

    drawingRels = drawingRels.replace(/<\/Relationships>/, newRels + "</Relationships>");
    drawingXml = drawingXml.replace(/<\/xdr:wsDr>/, newAnchors + "</xdr:wsDr>");
    zip.file(drawingPath, drawingXml);
    zip.file(drRelsPath, drawingRels);

    // Đảm bảo [Content_Types].xml khai báo phần mở rộng ảnh dùng tới
    let ct = await zip.file("[Content_Types].xml").async("string");
    for (const ext of usedExt) {
      if (!new RegExp(`Extension="${ext}"`, "i").test(ct)) {
        const mime = ext === "png" ? "image/png" : "image/jpeg";
        ct = ct.replace(/<Types([^>]*)>/, `<Types$1><Default Extension="${ext}" ContentType="${mime}"/>`);
      }
    }
    zip.file("[Content_Types].xml", ct);
    return true;
  }

  // Chiều cao từng dòng SP theo nội dung, để mở file KHÔNG bị che chữ (căn sẵn, không cần chỉnh tay).
  function setRowHeightsPerRow(xml, baseRow, heights) {
    heights.forEach((ht, i) => {
      const rn = baseRow + i;
      xml = xml.replace(new RegExp(`<row r="${rn}"([^>]*)>`), (m, attrs) => {
        attrs = attrs.replace(/\s+ht="[^"]*"/, "").replace(/\s+customHeight="[^"]*"/, "");
        return `<row r="${rn}"${attrs} ht="${ht}" customHeight="1">`;
      });
    });
    return xml;
  }

  // Ước lượng số dòng text sẽ wrap trong ô rộng ~`w` ký tự (mỗi \n là 1 dòng, dòng dài tự chia).
  function estLines(txt, w) {
    return String(txt || "").split("\n").reduce((a, l) => a + Math.max(1, Math.ceil((l.trim().length || 1) / w)), 0);
  }
  // Tính chiều cao (pt) cho mỗi dòng SP: đủ cho mô tả nhiều dòng + ghi chú; có ảnh thì tối thiểu 56.
  function productRowHeights(cfg, items) {
    // cột mô tả gộp (B:E / B:D) rộng -> ~44 ký tự; ghi chú hẹp -> ~18
    const descW = cfg.rowMerges.some(([a]) => a === cfg.cols.desc) ? 44 : 30;
    return items.map((it) => {
      const n = Math.max(estLines(it.desc, descW), estLines(it.note, 18), 1);
      let h = Math.max(30, n * 15 + 6);         // ~15pt/dòng + đệm
      if (cfg.imgCol && it.image) h = Math.max(h, 56);
      return Math.min(h, 240);                   // trần an toàn
    });
  }

  /** Sinh 1 file báo giá.
   * quote = { customer:{messrs,add,tel,fax,attn,mobile,email},
   *           meta:{quotNo,date,incoterms,leadtime,pic,destination,payment,validity},
   *           items:[{desc,unit,qty,price,note}], vatPercent }
   * Trả về Blob xlsx. */
  async function generate(tplKey, quote) {
    const cfg = TEMPLATES[tplKey];
    const buf = await (await fetch(cfg.file)).arrayBuffer();
    const zip = await JSZip.loadAsync(buf);
    const sheetPath = Object.keys(zip.files).find((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p));
    let xml = await zip.file(sheetPath).async("string");

    const n = quote.items.length;
    xml = insertRows(xml, cfg.productRow, n - 1, cfg.rowMerges);

    // Dòng sản phẩm
    let subtotal = 0;
    quote.items.forEach((it, i) => {
      const r = cfg.productRow + i;
      const qty = Number(it.qty) || 0, price = Number(it.price) || 0;
      const total = qty * price;
      subtotal += total;
      xml = setCellNumber(xml, cfg.cols.stt + r, i + 1);
      xml = setCellText(xml, cfg.cols.desc + r, it.desc);
      xml = setCellText(xml, cfg.cols.unit + r, it.unit || "Cái");
      xml = setCellNumber(xml, cfg.cols.qty + r, qty);
      xml = setCellNumber(xml, cfg.cols.price + r, price);
      xml = setCellNumber(xml, cfg.cols.total + r, total);
      xml = setCellText(xml, cfg.cols.note + r, it.note || "");
    });

    // Tổng + VAT (các dòng tổng đã bị dịch xuống n-1)
    const shift = n - 1;
    const vatPct = Number(quote.vatPercent) || 0;
    const vatAmt = Math.round(subtotal * vatPct / 100);
    const [sc, sr] = cfg.totals.subtotal; xml = setCellNumber(xml, sc + (sr + shift), subtotal);
    const [vc, vr] = cfg.totals.vat;      xml = setCellNumber(xml, vc + (vr + shift), vatAmt);
    const [gc, gr] = cfg.totals.grand;    xml = setCellNumber(xml, gc + (gr + shift), subtotal + vatAmt);
    const [lc, lr] = cfg.totals.vatLabel;
    xml = setCellText(xml, lc + (lr + shift), `THUẾ GIÁ TRỊ GIA TĂNG VAT (${vatPct}%)`);

    // Khách hàng + meta
    for (const [k, ref] of Object.entries(cfg.customer)) xml = setCellText(xml, ref, quote.customer[k] || "");
    for (const [k, ref] of Object.entries(cfg.meta))     xml = setCellText(xml, ref, quote.meta[k] || "");

    // Căn sẵn chiều cao mọi dòng SP theo nội dung -> mở file không bị che chữ, không phải chỉnh tay
    xml = setRowHeightsPerRow(xml, cfg.productRow, productRowHeights(cfg, quote.items));

    // Nhúng ảnh sản phẩm (mẫu có cột ảnh)
    if (cfg.imgCol) {
      const withImg = quote.items.map((it, i) => ({ i, image: it.image })).filter((x) => x.image);
      if (withImg.length) await embedImages(zip, sheetPath, cfg, withImg);
    }

    zip.file(sheetPath, xml);
    return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  return { TEMPLATES, generate };
})();
