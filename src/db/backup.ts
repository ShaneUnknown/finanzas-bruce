import type { DailyRecord, FinanceDB, MonthlyExpense } from './financeDB.ts'
import { defaultExpenseFields, type ExpenseField } from './expenseFields.ts'

export const BACKUP_SCHEMA_VERSION = 3

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const amount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
const expenseType = (value: unknown) => value === 'fixed' || value === 'variable' || value === 'supplier'

export function parseBackup(content: string) {
  const parsed: unknown = JSON.parse(content)
  if (!Array.isArray(parsed) && !object(parsed)) throw new Error('Respaldo inválido.')
  if (object(parsed) && parsed.schemaVersion !== undefined
    && ![1, 2, BACKUP_SCHEMA_VERSION].includes(parsed.schemaVersion as number)) {
    throw new Error('La versión de este respaldo no es compatible.')
  }
  const dailyRecords = Array.isArray(parsed) ? parsed : parsed.dailyRecords
  const monthlyExpenses = Array.isArray(parsed) ? [] : (parsed.monthlyExpenses ?? [])
  const fields = Array.isArray(parsed) ? undefined : parsed.expenseFields
  if (!Array.isArray(dailyRecords) || !Array.isArray(monthlyExpenses)
    || (fields !== undefined && !Array.isArray(fields))
    || (object(parsed) && parsed.schemaVersion === 3 && !Array.isArray(fields))) {
    throw new Error('Respaldo inválido.')
  }
  for (const record of dailyRecords) {
    if (!object(record) || !text(record.id) || !text(record.date)
      || !['morning', 'afternoon'].includes(record.shift as string)
      || !amount(record.income) || !amount(record.expense) || !amount(record.productSales)) {
      throw new Error('El respaldo contiene turnos inválidos.')
    }
  }
  for (const record of monthlyExpenses) {
    if (!object(record) || !text(record.fieldId) || !text(record.label)
      || typeof record.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(record.month)
      || !expenseType(record.type) || !amount(record.amount) || !amount(record.createdAt)
      || (record.id !== undefined && (!Number.isSafeInteger(record.id) || Number(record.id) <= 0))) {
      throw new Error('El respaldo contiene gastos inválidos.')
    }
  }
  const expenseFields = fields ?? defaultExpenseFields()
  const ids = new Set<string>()
  for (const field of expenseFields) {
    if (!object(field) || !text(field.id) || !text(field.label) || field.label.length > 80
      || !expenseType(field.type) || typeof field.active !== 'boolean'
      || !Number.isSafeInteger(field.order) || Number(field.order) < 0 || ids.has(field.id)) {
      throw new Error('El respaldo contiene campos de gastos inválidos.')
    }
    ids.add(field.id)
  }
  // Recuperar también conceptos que solo existan en los movimientos de un respaldo antiguo.
  for (const record of monthlyExpenses as MonthlyExpense[]) {
    const field = (expenseFields as ExpenseField[]).find(field => field.id === record.fieldId)
    if (field && field.type !== record.type) throw new Error('La categoría del gasto no coincide con su campo.')
    if (!field) expenseFields.push({
      id: record.fieldId, label: record.label, type: record.type, active: true, order: expenseFields.length,
    })
  }
  return { dailyRecords: dailyRecords as DailyRecord[], monthlyExpenses: monthlyExpenses as MonthlyExpense[], expenseFields: expenseFields as ExpenseField[] }
}

export async function createBackup(database: FinanceDB) {
  const data = await database.transaction('r', database.dailyRecords, database.monthlyExpenses, database.expenseFields, async () => ({
    dailyRecords: await database.dailyRecords.toArray(),
    monthlyExpenses: await database.monthlyExpenses.toArray(),
    expenseFields: await database.expenseFields.toArray(),
  }))
  const now = new Date()
  return {
    fileName: 'respaldo_finanzas_' + now.toISOString().replace(/[:.]/g, '-') + '.json',
    json: JSON.stringify({ schemaVersion: BACKUP_SCHEMA_VERSION, exportedAt: now.toISOString(), ...data }, null, 2),
  }
}

export async function restoreBackup(database: FinanceDB, content: string) {
  const data = parseBackup(content)
  await database.transaction('rw', database.dailyRecords, database.monthlyExpenses, database.expenseFields, async () => {
    await database.dailyRecords.bulkPut(data.dailyRecords)
    await database.monthlyExpenses.bulkPut(data.monthlyExpenses)
    await database.expenseFields.bulkPut(data.expenseFields)
  })
}
