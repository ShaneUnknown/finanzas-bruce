import Dexie, { type Table } from 'dexie'

export interface Transaction {
  id?: number
  description: string
  amount: number
  type: 'income' | 'expense'
  category: string
  date: string
}

export type EntryGroup = 'income' | 'daily' | 'longTerm' | 'legacy'

export interface RecordEntry {
  categoryId: string
  label: string
  amount: number
  group: EntryGroup
}

export interface DailyRecord {
  id: string
  date: string
  shift: 'morning' | 'afternoon'
  // Totales conservados para mantener compatibilidad con respaldos antiguos.
  income: number
  expense: number
  productSales: number
  incomeItems?: RecordEntry[]
  expenseItems?: RecordEntry[]
  notes: string
  createdAt: number
  updatedAt: number
}

export const INCOME_CATEGORIES = [
  { id: 'emollient_sales', label: 'Venta de Emolientes' },
  { id: 'product_sales', label: 'Venta de Productos' },
  { id: 'loan_payment', label: 'Pago de Préstamo' },
] as const

export const DAILY_EXPENSE_CATEGORIES = [
  { id: 'food', label: 'Gastos de Comida' },
  { id: 'kitchen_rosa', label: 'Gastos de Cocina (Rosa)' },
  { id: 'kitchen_silvia', label: 'Gastos de Cocina (Silvia)' },
] as const

export const LONG_TERM_EXPENSE_CATEGORIES = [
  { id: 'local_rent', label: 'Pago de Local' },
  { id: 'electricity', label: 'Pago de Luz' },
  { id: 'water', label: 'Pago de Agua' },
  { id: 'staff', label: 'Pago de Personal' },
  { id: 'room', label: 'Pago de Cuarto' },
  { id: 'internet', label: 'Pago de Internet' },
  { id: 'mercado_libre', label: 'Pedidos de Mercado Libre' },
  { id: 'chiclayo', label: 'Pedido de Chiclayo' },
  { id: 'honey', label: 'Miel de Abejas' },
  { id: 'biocenter', label: 'Pago Biocenter' },
  { id: 'eco_valle', label: 'Pago Eco Valle' },
  { id: 'mero_macho', label: 'Pago Mero Macho' },
  { id: 'nutricost', label: 'Pago Nutricost' },
  { id: 'amagreen', label: 'Pago Amagreen' },
] as const

const safeAmount = (value: unknown) => {
  const amount = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(amount) && amount >= 0 ? amount : 0
}

export const sumEntries = (items?: RecordEntry[]) =>
  (items ?? []).reduce((total, item) => total + safeAmount(item.amount), 0)

export const getIncomeTotal = (record: Partial<DailyRecord>) =>
  Array.isArray(record.incomeItems)
    ? sumEntries(record.incomeItems)
    : safeAmount(record.income) + safeAmount(record.productSales)

export const getExpenseTotal = (record: Partial<DailyRecord>) =>
  Array.isArray(record.expenseItems) ? sumEntries(record.expenseItems) : safeAmount(record.expense)

export const getBalance = (record: Partial<DailyRecord>) =>
  getIncomeTotal(record) - getExpenseTotal(record)

export const getProductSales = (record: Partial<DailyRecord>) =>
  Array.isArray(record.incomeItems)
    ? safeAmount(record.incomeItems.find(item => item.categoryId === 'product_sales')?.amount)
    : safeAmount(record.productSales)

export const normalizeRecord = (
  record: Partial<DailyRecord> & Pick<DailyRecord, 'id' | 'date' | 'shift'>,
): DailyRecord => {
  const oldIncome = safeAmount(record.income)
  const oldExpense = safeAmount(record.expense)
  const oldProductSales = safeAmount(record.productSales)
  const incomeItems = Array.isArray(record.incomeItems)
    ? record.incomeItems
    : [
        ...(oldIncome > 0
          ? [{ categoryId: 'legacy_income', label: 'Ingreso anterior / sin clasificar', amount: oldIncome, group: 'legacy' as const }]
          : []),
        ...(oldProductSales > 0
          ? [{ categoryId: 'product_sales', label: 'Venta de Productos', amount: oldProductSales, group: 'income' as const }]
          : []),
      ]
  const expenseItems = Array.isArray(record.expenseItems)
    ? record.expenseItems
    : oldExpense > 0
      ? [{ categoryId: 'legacy_expense', label: 'Egreso anterior / sin clasificar', amount: oldExpense, group: 'legacy' as const }]
      : []
  const now = Date.now()

  return {
    id: record.id,
    date: record.date,
    shift: record.shift,
    income: sumEntries(incomeItems.filter(item => item.categoryId !== 'product_sales')),
    expense: sumEntries(expenseItems),
    productSales: safeAmount(incomeItems.find(item => item.categoryId === 'product_sales')?.amount),
    incomeItems,
    expenseItems,
    notes: typeof record.notes === 'string' ? record.notes : '',
    createdAt: safeAmount(record.createdAt) || now,
    updatedAt: safeAmount(record.updatedAt) || now,
  }
}

export class FinanceDB extends Dexie {
  transactions!: Table<Transaction>
  dailyRecords!: Table<DailyRecord>

  constructor() {
    super('FinanceDB')
    this.version(2).stores({
      transactions: '++id, description, amount, type, category, date',
      dailyRecords: 'id, date, shift',
    })
    this.version(3).stores({
      transactions: '++id, description, amount, type, category, date',
      dailyRecords: 'id, date, shift',
    }).upgrade(async transaction => {
      await transaction.table<DailyRecord, string>('dailyRecords').toCollection().modify(record => {
        Object.assign(record, normalizeRecord(record))
      })
    })
  }
}

export const db = new FinanceDB()
