var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/balances.ts
var balances_exports = {};
__export(balances_exports, {
  deriveAssets: () => deriveAssets,
  movements: () => movements
});
module.exports = __toCommonJS(balances_exports);
var round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
function movements(data) {
  const result = /* @__PURE__ */ new Map();
  const add = (id, amount) => {
    if (id) result.set(id, round((result.get(id) || 0) + amount));
  };
  const bills = data.bills || [];
  for (const bill of bills) {
    const income = (data.parentCategories || []).find((c) => c.id === bill.parentCategoryId)?.kind === "income";
    add(bill.assetId, (income ? 1 : -1) * bill.cost);
  }
  for (const transfer of data.transfers || []) {
    const feeIsBill = transfer.billId && bills.some((b) => b.billId === transfer.billId);
    add(transfer.fromAssetId, -transfer.cost - (feeIsBill ? 0 : transfer.serviceCharge || 0));
    add(transfer.toAssetId, transfer.toCost ?? transfer.cost);
  }
  for (const lend of data.lends || []) {
    const id = (lend.type === 2 || lend.type === 4) && lend.repaymentAssetId ? lend.repaymentAssetId : lend.assetId;
    add(id, (lend.type === 1 || lend.type === 4 ? -1 : 1) * lend.number);
  }
  for (const refund of data.refunds || []) {
    const bill = bills.find((b) => b.billId === refund.billId);
    if (bill) add(bill.assetId, refund.number);
  }
  for (const reimbursement of data.reimbursements || []) {
    if (reimbursement.status === "done") add(reimbursement.assetId, reimbursement.number);
  }
  return result;
}
function deriveAssets(data) {
  const delta = movements(data);
  return (data.assets || []).map((asset) => {
    const movement = delta.get(asset.assetId) || 0;
    const openingBalance = Number.isFinite(asset.openingBalance) ? asset.openingBalance : round((Number(asset.assetNumber) || 0) - movement);
    return { ...asset, openingBalance, assetNumber: round(openingBalance + movement) };
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  deriveAssets,
  movements
});
