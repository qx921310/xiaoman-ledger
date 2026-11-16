import { DatabaseSync } from 'node:sqlite'

const backup = new DatabaseSync('/opt/backups/ledger-prod-20261116-095534.db', { readOnly: true })
const live = new DatabaseSync('/opt/ledger-app/server/data/ledger.db')
const targets = [7, 8]
const T = targets.join(',')
const users = backup.prepare(`SELECT * FROM users WHERE id IN (${T})`).all()
const books = backup.prepare(`SELECT * FROM books WHERE owner_id IN (${T})`).all()
const bookIds = books.map((b) => b.book_id)
const clause = bookIds.length ? ` OR book_id IN (${bookIds.map(() => '?').join(',')})` : ''

const ins = (table, row) => {
  const cols = Object.keys(row)
  live.prepare(`INSERT OR IGNORE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...cols.map((c) => row[c]))
}

live.exec('BEGIN IMMEDIATE')
try {
  for (const u of users) ins('users', u)
  for (const b of books) ins('books', b)
  for (const r of backup.prepare(`SELECT * FROM book_members WHERE user_id IN (${T})${clause}`).all(...bookIds)) ins('book_members', r)
  for (const r of backup.prepare(`SELECT * FROM book_member_numbers WHERE user_id IN (${T})${clause}`).all(...bookIds)) ins('book_member_numbers', r)
  for (const r of backup.prepare(`SELECT * FROM records WHERE user_id IN (${T})${clause}`).all(...bookIds)) ins('records', r)
  live.exec('COMMIT')
  console.log('restored users', users.map((u) => u.email).join(','), 'books', books.length)
} catch (e) {
  live.exec('ROLLBACK')
  throw e
}
console.log('users', live.prepare('SELECT COUNT(*) n FROM users').get().n,
  'records', live.prepare('SELECT COUNT(*) n FROM records').get().n,
  'books', live.prepare('SELECT COUNT(*) n FROM books').get().n)
console.log(live.prepare('SELECT id,email FROM users ORDER BY id').all().map((u) => u.id + ':' + u.email).join(', '))
