import Dexie, { type Table } from 'dexie'

export interface Transaction {
  id?: number // Primary key, auto-incremented
  description: string
  amount: number
  type: 'income' | 'expense'
  category: string
  date: string // Format: YYYY-MM-DD
}

export interface DailyRecord {
  id: string // Format: `${date}_${shift}`
  date: string // Format: YYYY-MM-DD
  shift: 'morning' | 'afternoon'
  income: number
  expense: number
  productSales: number
  notes: string
  createdAt: number
  updatedAt: number
}

type EntryGroup = 'income' | 'daily' | 'longTerm' | 'legacy'

interface RecordEntry {
  categoryId: string
  label: string
  amount: number
  group: EntryGroup
}

interface DetailedDailyRecord extends DailyRecord {
  incomeItems?: RecordEntry[]
  expenseItems?: RecordEntry[]
}

export type MonthlyExpenseType = 'fixed' | 'variable' | 'supplier'

export interface MonthlyExpense {
  id?: number
  month: string // YYYY-MM
  type: MonthlyExpenseType
  fieldId: string
  label: string
  amount: number
  createdAt: number
}

export interface RecordMigrationBackup {
  id: string
  migratedAt: number
  record: DetailedDailyRecord
}

const safeAmount = (value: unknown) => {
  const amount = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(amount) && amount >= 0 ? amount : 0
}

const sumEntries = (entries: RecordEntry[]) =>
  entries.reduce((total, entry) => total + safeAmount(entry.amount), 0)

const compactRecord = (record: DetailedDailyRecord): DailyRecord => {
  const hasDetailedIncome = Array.isArray(record.incomeItems)
  const hasDetailedExpenses = Array.isArray(record.expenseItems)
  const productSales = hasDetailedIncome
    ? sumEntries(record.incomeItems!.filter(entry => entry.categoryId === 'product_sales'))
    : safeAmount(record.productSales)
  const income = hasDetailedIncome
    ? sumEntries(record.incomeItems!.filter(entry => entry.categoryId !== 'product_sales'))
    : safeAmount(record.income)
  const expense = hasDetailedExpenses
    ? sumEntries(record.expenseItems!)
    : safeAmount(record.expense)

  return {
    id: record.id,
    date: record.date,
    shift: record.shift,
    income,
    expense,
    productSales,
    notes: typeof record.notes === 'string' ? record.notes : '',
    createdAt: safeAmount(record.createdAt) || Date.now(),
    updatedAt: safeAmount(record.updatedAt) || Date.now()
  }
}

export class FinanceDB extends Dexie {
  transactions!: Table<Transaction>
  dailyRecords!: Table<DailyRecord>
  recordMigrationBackups!: Table<RecordMigrationBackup>
  monthlyExpenses!: Table<MonthlyExpense>

  constructor() {
    super('FinanceDB')
    this.version(2).stores({
      transactions: '++id, description, amount, type, category, date',
      dailyRecords: 'id, date, shift'
    })
    // La versión 3 ya llegó a los navegadores y no se puede retroceder a la 2.
    this.version(3).stores({
      transactions: '++id, description, amount, type, category, date',
      dailyRecords: 'id, date, shift'
    })
    this.version(4).stores({
      transactions: '++id, description, amount, type, category, date',
      dailyRecords: 'id, date, shift',
      recordMigrationBackups: 'id, migratedAt'
    }).upgrade(async transaction => {
      const dailyRecords = transaction.table<DetailedDailyRecord, string>('dailyRecords')
      const backups = transaction.table<RecordMigrationBackup, string>('recordMigrationBackups')
      const records = await dailyRecords.toArray()
      const migratedAt = Date.now()

      if (records.length > 0) {
        await backups.bulkPut(records.map(record => ({ id: record.id, migratedAt, record })))
        await dailyRecords.bulkPut(records.map(compactRecord))
      }
    })
    this.version(5).stores({
      transactions: '++id, description, amount, type, category, date',
      dailyRecords: 'id, date, shift',
      recordMigrationBackups: 'id, migratedAt',
      monthlyExpenses: '++id, month, type, fieldId, createdAt'
    })
  }
}

export const db = new FinanceDB()

