/** Stable offline identities: UUID for sync; numeric compatibility key for existing links. */
export function newBillIdentity() {
  const bytes = new Uint32Array(2)
  globalThis.crypto.getRandomValues(bytes)
  return {
    syncId: globalThis.crypto.randomUUID(),
    billId: (bytes[0] & 0x1fffff) * 0x100000000 + bytes[1]
  }
}
