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

export class FinanceDB extends Dexie {
  transactions!: Table<Transaction>
  dailyRecords!: Table<DailyRecord>

  constructor() {
    super('FinanceDB')
    this.version(2).stores({
      transactions: '++id, description, amount, type, category, date',
      dailyRecords: 'id, date, shift'
    })
  }
}

export const db = new FinanceDB()

