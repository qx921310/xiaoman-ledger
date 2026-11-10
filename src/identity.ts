/** New bills use the UUID as their stable local and sync key. */
export function newBillIdentity() {
  const syncId = globalThis.crypto.randomUUID()
  return { syncId, billId: syncId }
}
