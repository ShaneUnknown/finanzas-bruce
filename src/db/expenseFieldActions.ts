import type { FinanceDB, MonthlyExpenseType } from './financeDB.ts'
import { normalizeFieldLabel } from './expenseFields.ts'

export async function createExpenseField(database: FinanceDB, type: MonthlyExpenseType, name: string) {
  const label = normalizeFieldLabel(name)
  if (!label || label.length > 80) throw new Error('Escribe un nombre de entre 1 y 80 caracteres.')
  return database.transaction('rw', database.expenseFields, async () => {
    const fields = await database.expenseFields.where('type').equals(type).toArray()
    if (fields.some(field => field.label.toLocaleLowerCase('es') === label.toLocaleLowerCase('es'))) {
      throw new Error('Ya existe un campo con ese nombre en esta categoría. Si está archivado, puedes reactivarlo.')
    }
    const field = {
      id: 'custom_' + crypto.randomUUID(), label, type, active: true,
      order: Math.max(-1, ...fields.map(field => field.order)) + 1,
    }
    await database.expenseFields.add(field)
    return field
  })
}

export async function setExpenseFieldActive(database: FinanceDB, id: string, active: boolean) {
  const updated = await database.expenseFields.update(id, { active })
  if (!updated) throw new Error('Este campo ya no existe. Vuelve a cargar la página.')
}

export async function saveMonthlyExpenses(
  database: FinanceDB, type: MonthlyExpenseType, month: string, values: Record<string, string>,
) {
  return database.transaction('rw', database.expenseFields, database.monthlyExpenses, async () => {
    const fields = await database.expenseFields.where('type').equals(type).toArray()
    const entries = Object.entries(values).filter(([, value]) => value.trim() !== '')
    const now = Date.now()
    const records = entries.flatMap(([id, value], index) => {
      const field = fields.find(field => field.id === id)
      if (!field?.active) throw new Error('Uno de los campos fue archivado. Revisa los campos antes de guardar.')
      const amount = Number(value)
      if (!Number.isFinite(amount) || amount < 0) throw new Error('Ingresa montos válidos, iguales o mayores a cero.')
      return amount > 0 ? [{ month, type, fieldId: id, label: field.label, amount, createdAt: now + index }] : []
    })
    if (!records.length) throw new Error('Ingresa al menos un monto mayor a cero.')
    await database.monthlyExpenses.bulkAdd(records)
  })
}
