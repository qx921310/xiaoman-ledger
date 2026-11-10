var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/importer.ts
var importer_exports = {};
__export(importer_exports, {
  buildImportPlan: () => buildImportPlan,
  detectFormat: () => detectFormat,
  exportXlsx: () => exportXlsx,
  parseLedgerFile: () => parseLedgerFile
});
module.exports = __toCommonJS(importer_exports);
var XLSX = __toESM(require("xlsx"), 1);
function parseLedgerFile(buf, fileName) {
  const isCsv = /\.csv$/i.test(fileName);
  let wb;
  if (isCsv) {
    const bytes = new Uint8Array(buf);
    const utf8 = hasBom(bytes) || isUtf8(bytes);
    const text = new TextDecoder(utf8 ? "utf-8" : "gbk").decode(bytes);
    wb = XLSX.read(text, { type: "string" });
  } else {
    wb = XLSX.read(buf, { type: "array" });
  }
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("\u6587\u4EF6\u91CC\u6CA1\u6709\u53EF\u8BFB\u7684\u5DE5\u4F5C\u8868");
  const sheet = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  const headerIdx = aoa.findIndex((r) => Array.isArray(r) && r.some((c) => String(c).trim()));
  const rawHeaders = aoa[headerIdx] || [];
  const headers = rawHeaders.map((h) => String(h ?? "").trim());
  const rows = aoa.slice(headerIdx + 1).filter((r) => Array.isArray(r) && r.some((c) => String(c ?? "").trim() !== "")).map((r) => headers.map((_, i) => r[i] ?? ""));
  return { headers, rows, sheetName };
}
function hasBom(b) {
  return b.length >= 3 && b[0] === 239 && b[1] === 187 && b[2] === 191;
}
function isUtf8(b) {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(b);
    return true;
  } catch {
    return false;
  }
}
function detectFormat(headers) {
  const has = (k) => headers.includes(k);
  if (has("\u65E5\u671F") && has("\u6536\u652F\u7C7B\u578B") && has("\u91D1\u989D") && (has("\u7C7B\u522B") || has("\u5206\u7C7B"))) return "yimu";
  if (has("\u8F6C\u51FA\u8D26\u6237") && has("\u8F6C\u5165\u8D26\u6237") && has("\u91D1\u989D")) return "transfer";
  if ((has("\u65F6\u95F4") || has("\u65E5\u671F")) && has("\u91D1\u989D")) return "generic";
  return "unknown";
}
var num = (v) => {
  const n = Number(String(v).replace(/[¥$€,，\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
var str = (v) => String(v ?? "").trim();
function buildIndex(headers) {
  const idx = {};
  headers.forEach((h, i) => {
    if (h && idx[h] === void 0) idx[h] = i;
  });
  return (name) => idx[name] !== void 0 ? idx[name] : -1;
}
function parseTime(v) {
  const s = str(v);
  if (!s) return NaN;
  if (/^\d{10,13}$/.test(s)) return Number(s.length === 10 ? s + "000" : s);
  const m = s.match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})[日]?(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    return new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4] ?? 0),
      Number(m[5] ?? 0),
      Number(m[6] ?? 0)
    ).getTime();
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? NaN : t;
}
function buildImportPlan(args) {
  const { table, existingBills, existingAssets, existingBooks, parentCategories, childCategories, userId, bookId } = args;
  const format = detectFormat(table.headers);
  const col = buildIndex(table.headers);
  const parents = [...parentCategories];
  const children = [...childCategories];
  const assets = [...existingAssets];
  const books = [...existingBooks];
  const newParents = [];
  const newChildren = [];
  const newAssets = [];
  const newBooks = [];
  const reimbursements = [];
  const refunds = [];
  const seen = new Set(existingBills.map((b) => `${b.time}|${b.cost.toFixed(2)}|${b.assetId}|${b.remark}`));
  const bills = [];
  const transfers = [];
  const skipped = [];
  let duplicates = 0;
  let income = 0;
  let expense = 0;
  let seq = 0;
  const idFor = (base) => base + seq++;
  const ensureParent = (name, kind) => {
    const n = str(name) || "\u672A\u5206\u7C7B";
    const hit = parents.find((p) => p.name === n && p.kind === kind);
    if (hit) return hit.id;
    const cat = { id: idFor(9e5), name: n, parentId: 0, kind, color: "#94a3b8", positionWeight: parents.length };
    parents.push(cat);
    newParents.push(cat);
    return cat.id;
  };
  const ensureChild = (name, parentId) => {
    const n = str(name);
    if (!n) return 0;
    const hit = children.find((c) => c.name === n && c.parentId === parentId);
    if (hit) return hit.id;
    const cat = { id: idFor(95e4), name: n, parentId, kind: "expense", color: "#cbd5e1", positionWeight: children.length };
    children.push(cat);
    newChildren.push(cat);
    return cat.id;
  };
  const ensureAsset = (name) => {
    const n = str(name) || "\u9ED8\u8BA4\u8D26\u6237";
    const hit = assets.find((a) => a.assetName === n);
    if (hit) return hit.assetId;
    const isCredit = /信用卡|花呗|白条/.test(n);
    const asset = {
      assetId: idFor(8e5),
      assetName: n,
      assetType: isCredit ? 2 : 1,
      assetNumber: 0,
      groupName: isCredit ? "\u4FE1\u7528\u5361" : "\u5BFC\u5165",
      hide: false,
      intoTotalAsset: true,
      positionWeight: assets.length,
      remark: "",
      userId,
      updateTime: Date.now()
    };
    assets.push(asset);
    newAssets.push(asset);
    return asset.assetId;
  };
  const ensureBook = (name) => {
    const n = str(name) || "\u65E5\u5E38\u8D26\u672C";
    const hit = books.find((b) => b.accountBookName === n);
    if (hit) return hit.accountBookId;
    const book = { accountBookId: idFor(7e5), accountBookName: n, userId, createTime: Date.now() };
    books.push(book);
    newBooks.push(book);
    return book.accountBookId;
  };
  const coverageCols = [
    "\u65E5\u671F",
    "\u6536\u652F\u7C7B\u578B",
    "\u91D1\u989D",
    "\u7C7B\u522B",
    "\u4E8C\u7EA7\u5206\u7C7B",
    "\u8D26\u6237",
    "\u8D26\u672C",
    "\u9000\u6B3E",
    "\u4F18\u60E0",
    "\u5907\u6CE8",
    "\u6807\u7B7E",
    "\u62A5\u9500\u8D26\u6237",
    "\u62A5\u9500\u91D1\u989D",
    "\u62A5\u9500\u660E\u7EC6",
    "\u591A\u5E01\u79CD",
    "\u5730\u5740",
    "\u521B\u5EFA\u7528\u6237",
    "\u5176\u4ED6",
    "\u9644\u4EF61"
  ];
  const columnCoverage = coverageCols.filter((c) => col(c) >= 0).map((c) => ({ column: c, filled: table.rows.filter((r) => str(r[col(c)]) !== "").length })).filter((x) => x.filled > 0);
  if (format === "transfer") {
    table.rows.forEach((r, i) => {
      const time = parseTime(r[col("\u65E5\u671F")] ?? r[col("\u65F6\u95F4")]);
      const cost = num(r[col("\u91D1\u989D")]);
      if (!time || !cost) {
        skipped.push({ row: i + 2, reason: "\u65E5\u671F\u6216\u91D1\u989D\u65E0\u6CD5\u89E3\u6790" });
        return;
      }
      transfers.push({
        transferId: Date.now() + i,
        fromAssetId: ensureAsset(str(r[col("\u8F6C\u51FA\u8D26\u6237")])),
        toAssetId: ensureAsset(str(r[col("\u8F6C\u5165\u8D26\u6237")])),
        cost: Math.abs(cost),
        serviceCharge: Math.abs(num(r[col("\u624B\u7EED\u8D39")])),
        billId: 0,
        time,
        remark: str(r[col("\u5907\u6CE8")]),
        tags: [],
        userId,
        updateTime: Date.now()
      });
    });
    return {
      format,
      headers: table.headers,
      total: table.rows.length,
      bills,
      transfers,
      newParents,
      newChildren,
      newAssets,
      newBooks,
      reimbursements,
      refunds,
      duplicates,
      skipped,
      income,
      expense,
      columnCoverage
    };
  }
  const pendings = [];
  table.rows.forEach((r, i) => {
    const dateRaw = r[col("\u65E5\u671F")] ?? r[col("\u65F6\u95F4")] ?? r[col("\u65E5\u671F\u65F6\u95F4")];
    const time = parseTime(dateRaw);
    if (!time) {
      skipped.push({ row: i + 2, reason: "\u65E5\u671F\u65E0\u6CD5\u89E3\u6790\uFF1A" + str(dateRaw) });
      return;
    }
    const typeText = str(r[col("\u6536\u652F\u7C7B\u578B")] ?? r[col("\u6536/\u652F")] ?? r[col("\u7C7B\u578B")] ?? r[col("\u6536\u652F")]);
    const amountRaw = num(r[col("\u91D1\u989D")]);
    if (!amountRaw) {
      skipped.push({ row: i + 2, reason: "\u91D1\u989D\u4E3A\u7A7A\u6216\u4E3A 0" });
      return;
    }
    const isIncome = /收入/.test(typeText) ? true : /支出/.test(typeText) ? false : amountRaw > 0;
    const cost = Math.abs(amountRaw);
    const parentName = str(r[col("\u7C7B\u522B")] ?? r[col("\u5206\u7C7B")] ?? r[col("\u4E00\u7EA7\u5206\u7C7B")] ?? r[col("\u5927\u7C7B")]) || (isIncome ? "\u5176\u4ED6\u6536\u5165" : "\u5176\u4ED6");
    const childName = str(r[col("\u4E8C\u7EA7\u5206\u7C7B")] ?? r[col("\u5B50\u5206\u7C7B")]);
    const assetId = ensureAsset(str(r[col("\u8D26\u6237")] ?? r[col("\u652F\u4ED8\u8D26\u6237")]));
    const parentCategoryId = ensureParent(parentName, isIncome ? "income" : "expense");
    const childCategoryId = ensureChild(childName, parentCategoryId);
    const remark = str(r[col("\u5907\u6CE8")]);
    const bookIdOfRow = col("\u8D26\u672C") >= 0 ? ensureBook(str(r[col("\u8D26\u672C")])) : bookId;
    const key = `${time}|${cost.toFixed(2)}|${assetId}|${remark}`;
    if (seen.has(key)) {
      duplicates++;
      return;
    }
    seen.add(key);
    if (isIncome) income += cost;
    else expense += cost;
    const otherText = str(r[col("\u5176\u4ED6")]);
    const attachmentUrls = [1, 2, 3, 4, 5].map((n) => str(r[col(`\u9644\u4EF6${n}`)])).filter(Boolean);
    const bill = {
      billId: time,
      time,
      cost,
      parentCategoryId,
      childCategoryId,
      assetId,
      bookId: bookIdOfRow,
      remark,
      billType: 3,
      tags: str(r[col("\u6807\u7B7E")]).split(/[,，;；\s]+/).filter(Boolean),
      files: attachmentUrls.map((u, idx) => ({ name: `\u9644\u4EF6${idx + 1}`, remotePath: u })),
      userId,
      updateTime: Date.now(),
      billShareInfo: { parentCategoryName: parentName, childCategoryName: childName, assetName: assets.find((a) => a.assetId === assetId)?.assetName ?? "" },
      notIntoTotal: /不计入收支/.test(otherText),
      notIntoBudget: /不计入预算/.test(otherText),
      discountNumber: Math.abs(num(r[col("\u4F18\u60E0")])),
      refundNum: Math.abs(num(r[col("\u9000\u6B3E")])),
      currencyInfo: str(r[col("\u591A\u5E01\u79CD")]),
      poiAddress: str(r[col("\u5730\u5740")]),
      fromUserId: num(r[col("\u521B\u5EFA\u7528\u6237")]) || 0
    };
    bills.push(bill);
    const reimbAcc = str(r[col("\u62A5\u9500\u8D26\u6237")]);
    const reimbAmt = Math.abs(num(r[col("\u62A5\u9500\u91D1\u989D")]));
    const reimbDetail = str(r[col("\u62A5\u9500\u660E\u7EC6")]);
    const refundAmt = Math.abs(num(r[col("\u9000\u6B3E")]));
    pendings.push({
      bill,
      reimb: reimbAcc || reimbAmt > 0 ? { assetName: reimbAcc, amount: reimbAmt, detail: reimbDetail } : void 0,
      refund: refundAmt > 0 ? refundAmt : void 0
    });
  });
  const used = new Set(existingBills.map((b) => b.billId));
  bills.sort((a, b) => a.time - b.time);
  bills.forEach((b) => {
    let id = Math.floor(b.time / 1e3);
    while (used.has(id)) id++;
    b.billId = id;
    used.add(id);
  });
  let rseq = 0;
  pendings.forEach((p) => {
    if (p.reimb) {
      reimbursements.push({
        reimbursementId: Date.now() + rseq++,
        billId: p.bill.billId,
        assetId: p.reimb.assetName ? ensureAsset(p.reimb.assetName) : 0,
        number: p.reimb.amount,
        detail: p.reimb.detail,
        // 导入的报销视为「已登记待确认」，用户核对后可点到账
        status: "pending",
        userId,
        updateTime: Date.now()
      });
    }
    if (p.refund) {
      refunds.push({
        refundId: Date.now() + rseq++,
        billId: p.bill.billId,
        number: p.refund,
        userId,
        updateTime: Date.now()
      });
    }
  });
  return {
    format,
    headers: table.headers,
    total: table.rows.length,
    bills,
    transfers,
    newParents,
    newChildren,
    newAssets,
    newBooks,
    reimbursements,
    refunds,
    duplicates,
    skipped,
    income,
    expense,
    columnCoverage
  };
}
function exportXlsx(bills, parents, children, assets, books = [], reimbursements = [], refunds = []) {
  const header = [
    "\u65E5\u671F",
    "\u6536\u652F\u7C7B\u578B",
    "\u91D1\u989D",
    "\u7C7B\u522B",
    "\u4E8C\u7EA7\u5206\u7C7B",
    "\u8D26\u6237",
    "\u8D26\u672C",
    "\u9000\u6B3E",
    "\u4F18\u60E0",
    "\u5907\u6CE8",
    "\u6807\u7B7E",
    "\u62A5\u9500\u8D26\u6237",
    "\u62A5\u9500\u91D1\u989D",
    "\u62A5\u9500\u660E\u7EC6",
    "\u591A\u5E01\u79CD",
    "\u5730\u5740",
    "\u521B\u5EFA\u7528\u6237",
    "\u5176\u4ED6",
    "\u9644\u4EF61",
    "\u9644\u4EF62",
    "\u9644\u4EF63",
    "\u9644\u4EF64",
    "\u9644\u4EF65"
  ];
  const rows = bills.map((b) => {
    const p = parents.find((x) => x.id === b.parentCategoryId);
    const c = children.find((x) => x.id === b.childCategoryId);
    const a = assets.find((x) => x.assetId === b.assetId);
    const bk = books.find((x) => x.accountBookId === b.bookId);
    const reimb = reimbursements.find((x) => x.billId === b.billId);
    const refund = refunds.find((x) => x.billId === b.billId);
    const isIncome = p?.kind === "income";
    const flags = [b.notIntoTotal ? "\u4E0D\u8BA1\u5165\u6536\u652F" : "", b.notIntoBudget ? "\u4E0D\u8BA1\u5165\u9884\u7B97" : ""].filter(Boolean).join("\u3001");
    const files = (b.files || []).slice(0, 5).map((f) => f?.remotePath ?? "");
    while (files.length < 5) files.push("");
    return [
      fmtTime(b.time),
      isIncome ? "\u6536\u5165" : "\u652F\u51FA",
      isIncome ? b.cost : -Math.abs(b.cost),
      p?.name ?? "",
      c?.name ?? "",
      a?.assetName ?? "",
      bk?.accountBookName ?? "\u65E5\u5E38\u8D26\u672C",
      b.refundNum ?? 0,
      b.discountNumber ?? 0,
      b.remark,
      (b.tags || []).join(","),
      reimb ? assets.find((x) => x.assetId === reimb.assetId)?.assetName ?? "" : "",
      reimb ? reimb.number : "",
      reimb ? reimb.detail : "",
      b.currencyInfo ?? "",
      b.poiAddress ?? "",
      b.fromUserId || "",
      flags,
      ...files
    ];
  });
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "\u8D26\u5355");
  XLSX.writeFile(wb, `\u9752\u8D26\u5BFC\u51FA_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.xlsx`);
}
function fmtTime(t) {
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildImportPlan,
  detectFormat,
  exportXlsx,
  parseLedgerFile
});
