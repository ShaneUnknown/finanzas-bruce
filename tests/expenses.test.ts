import 'fake-indexeddb/auto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import Dexie from 'dexie'
import { FinanceDB } from '../src/db/financeDB.ts'
import { defaultExpenseFields } from '../src/db/expenseFields.ts'
import { createExpenseField, setExpenseFieldActive, saveMonthlyExpenses } from '../src/db/expenseFieldActions.ts'
import { createBackup, parseBackup, restoreBackup } from '../src/db/backup.ts'

let sequence = 0
async function withDB(run: (db: FinanceDB) => Promise<void>) {
  const db = new FinanceDB('test-' + sequence++)
  try { await db.open(); await run(db) } finally { await db.delete() }
}
const expense = { month: '2026-09', type: 'fixed' as const, fieldId: 'food', label: 'Gastos comida', amount: 25, createdAt: 123 }

test('instalación nueva: incorpora los 19 campos anteriores', () => withDB(async db => {
  assert.equal(await db.expenseFields.count(), 19)
  assert.deepEqual(await db.expenseFields.get('food'), defaultExpenseFields()[0])
}))

test('migración de versión 5 conserva gastos y turnos', async () => {
  const name = 'migration-' + sequence++
  const old = new Dexie(name)
  old.version(5).stores({
    transactions: '++id, description, amount, type, category, date',
    dailyRecords: 'id, date, shift', recordMigrationBackups: 'id, migratedAt',
    monthlyExpenses: '++id, month, type, fieldId, createdAt',
  })
  await old.table('monthlyExpenses').add({ ...expense, id: 4 })
  const record = { id: '2026-09-01_morning', date: '2026-09-01', shift: 'morning', income: 100, expense: 5, productSales: 0, notes: '', createdAt: 1, updatedAt: 1 }
  await old.table('dailyRecords').add(record)
  old.close()
  const db = new FinanceDB(name)
  try {
    await db.open()
    assert.equal(db.verno, 6)
    assert.equal(await db.expenseFields.count(), 19)
    assert.deepEqual(await db.monthlyExpenses.get(4), { ...expense, id: 4 })
    assert.deepEqual(await db.dailyRecords.get(record.id), record)
  } finally { await db.delete() }
})

test('crear, guardar, archivar y reactivar conserva el historial y el total', () => withDB(async db => {
  const field = await createExpenseField(db, 'variable', '  Transporte   local ')
  assert.equal(field.label, 'Transporte local')
  await saveMonthlyExpenses(db, 'variable', '2026-09', { [field.id]: '15.50' })
  await setExpenseFieldActive(db, field.id, false)
  assert.equal((await db.expenseFields.get(field.id))?.active, false)
  await assert.rejects(saveMonthlyExpenses(db, 'variable', '2026-09', { [field.id]: '7' }), /archivado/)
  assert.equal((await db.monthlyExpenses.toArray()).reduce((sum, item) => sum + item.amount, 0), 15.5)
  assert.equal((await db.monthlyExpenses.toArray())[0].label, 'Transporte local')
  await setExpenseFieldActive(db, field.id, true)
  await saveMonthlyExpenses(db, 'variable', '2026-10', { [field.id]: '8' })
  assert.equal(await db.monthlyExpenses.count(), 2)
}))

test('rechaza nombres vacíos, largos y duplicados incluso archivados', () => withDB(async db => {
  await assert.rejects(createExpenseField(db, 'fixed', '   '), /nombre/)
  await assert.rejects(createExpenseField(db, 'fixed', 'a'.repeat(81)), /nombre/)
  await assert.rejects(createExpenseField(db, 'fixed', ' gastos   COMIDA '), /existe/)
  await setExpenseFieldActive(db, 'food', false)
  await assert.rejects(createExpenseField(db, 'fixed', 'Gastos comida'), /archivado/)
  await createExpenseField(db, 'variable', 'Gastos comida')
}))

test('creaciones simultáneas no duplican un concepto', () => withDB(async db => {
  const results = await Promise.allSettled([
    createExpenseField(db, 'supplier', 'Nuevo proveedor'),
    createExpenseField(db, 'supplier', 'Nuevo proveedor'),
  ])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
}))

test('montos inválidos no guardan parcialmente ni crean gastos de cero', () => withDB(async db => {
  for (const value of ['-2', 'NaN', 'Infinity']) {
    await assert.rejects(saveMonthlyExpenses(db, 'fixed', '2026-09', { food: '10', water: value }), /válidos/)
    assert.equal(await db.monthlyExpenses.count(), 0)
  }
  await assert.rejects(saveMonthlyExpenses(db, 'fixed', '2026-09', { food: '0' }), /mayor a cero/)
  await assert.rejects(saveMonthlyExpenses(db, 'fixed', '2026-09', { missing: '2' }), /archivado/)
}))

test('respaldo completo recupera campos activos y archivados, montos y orden', () => withDB(async source => {
  const field = await createExpenseField(source, 'supplier', 'Proveedor nuevo')
  await saveMonthlyExpenses(source, 'supplier', '2026-09', { [field.id]: '42' })
  await setExpenseFieldActive(source, field.id, false)
  const backup = await createBackup(source)
  assert.equal(JSON.parse(backup.json).schemaVersion, 3)
  await withDB(async target => {
    await restoreBackup(target, backup.json)
    assert.deepEqual(await target.expenseFields.toArray(), await source.expenseFields.toArray())
    assert.deepEqual(await target.monthlyExpenses.toArray(), await source.monthlyExpenses.toArray())
  })
}))

test('respaldo de versión 2 y formato antiguo siguen siendo compatibles', () => withDB(async db => {
  await restoreBackup(db, JSON.stringify({ schemaVersion: 2, dailyRecords: [], monthlyExpenses: [expense] }))
  assert.equal(await db.monthlyExpenses.count(), 1)
  assert.equal(await db.expenseFields.count(), 19)
  await restoreBackup(db, '[]')
  assert.equal(await db.monthlyExpenses.count(), 1)
}))

test('recupera un concepto que solo existe en los gastos antiguos', () => withDB(async db => {
  await restoreBackup(db, JSON.stringify({ dailyRecords: [], monthlyExpenses: [{ ...expense, fieldId: 'old_custom', label: 'Anterior' }] }))
  assert.equal((await db.expenseFields.get('old_custom'))?.label, 'Anterior')
}))

test('respaldo inválido no modifica ninguna tabla', () => withDB(async db => {
  await db.monthlyExpenses.add(expense)
  const invalid = { schemaVersion: 3, dailyRecords: [], monthlyExpenses: [{ ...expense, id: 1, amount: 99 }], expenseFields: [{ id: 'bad' }] }
  await assert.rejects(restoreBackup(db, JSON.stringify(invalid)), /campos/)
  assert.equal((await db.monthlyExpenses.get(1))?.amount, 25)
  assert.equal(await db.expenseFields.count(), 19)
  for (const content of ['null', '{}', '{"schemaVersion":99}', '{"schemaVersion":3,"dailyRecords":[]}']) {
    assert.throws(() => parseBackup(content))
  }
}))

test('rechaza identificadores duplicados y categorías inconsistentes en respaldos', () => {
  const field = defaultExpenseFields()[0]
  assert.throws(() => parseBackup(JSON.stringify({ dailyRecords: [], expenseFields: [field, field] })), /campos/)
  assert.throws(() => parseBackup(JSON.stringify({ dailyRecords: [], monthlyExpenses: [expense], expenseFields: [{ ...field, type: 'supplier' }] })), /categoría/)
})

test('fallo de escritura revierte la restauración completa', () => withDB(async db => {
  await db.monthlyExpenses.add(expense)
  const fail = () => { throw new Error('Fallo simulado de almacenamiento') }
  db.expenseFields.hook('creating', fail)
  try {
    await assert.rejects(restoreBackup(db, JSON.stringify({
      schemaVersion: 3, dailyRecords: [],
      monthlyExpenses: [{ ...expense, id: 1, amount: 99 }],
      expenseFields: [{ id: 'custom_test', label: 'Prueba', type: 'fixed', active: true, order: 20 }],
    })), /Fallo simulado/)
    assert.equal((await db.monthlyExpenses.get(1))?.amount, 25)
    assert.equal(await db.expenseFields.get('custom_test'), undefined)
  } finally { db.expenseFields.hook('creating').unsubscribe(fail) }
}))

test('fallo al guardar gastos mantiene intactos los registros anteriores', () => withDB(async db => {
  await db.monthlyExpenses.add(expense)
  const fail = () => { throw new Error('Disco lleno simulado') }
  db.monthlyExpenses.hook('creating', fail)
  try {
    await assert.rejects(saveMonthlyExpenses(db, 'fixed', '2026-09', { food: '10', water: '5' }), /Disco lleno/)
    assert.equal(await db.monthlyExpenses.count(), 1)
  } finally { db.monthlyExpenses.hook('creating').unsubscribe(fail) }
}))
