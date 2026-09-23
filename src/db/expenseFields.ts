import type { MonthlyExpenseType } from './financeDB.ts'

export interface ExpenseField {
  id: string
  label: string
  type: MonthlyExpenseType
  order: number
  active: boolean
}

const DEFAULT_FIELDS: Record<MonthlyExpenseType, { id: string; label: string }[]> = {
  fixed: [
    { id: 'food', label: 'Gastos comida' }, { id: 'kitchen_rosa', label: 'Gastos cocina (Rosa)' },
    { id: 'kitchen_silvia', label: 'Gastos cocina (Silvia)' }, { id: 'local_rent', label: 'Pago local' },
    { id: 'electricity', label: 'Pago luz' }, { id: 'water', label: 'Pago agua' },
    { id: 'staff_leticia', label: 'Pago personal - Leticia' }, { id: 'staff_silvia', label: 'Pago personal - Silvia' },
    { id: 'staff_rosa', label: 'Pago personal - Rosa' }, { id: 'room', label: 'Pago cuarto' },
    { id: 'internet', label: 'Pago internet' }, { id: 'chiclayo', label: 'Pedido Chiclayo' },
  ],
  variable: [{ id: 'mercado_libre', label: 'Pedidos Mercado Libre' }],
  supplier: [
    { id: 'biocenter', label: 'Pedido Bio Center' }, { id: 'eco_valle', label: 'Pedido Eco Valle' },
    { id: 'nutricost', label: 'Pedido Nutricost' }, { id: 'amagreen', label: 'Pedido Amagreen' },
    { id: 'honey', label: 'Pedido Miel de Abejas' }, { id: 'mero_macho', label: 'Pedido Mero Macho' },
  ],
}

export const defaultExpenseFields = (): ExpenseField[] =>
  Object.entries(DEFAULT_FIELDS).flatMap(([type, fields]) =>
    fields.map((field, order) => ({ ...field, type: type as MonthlyExpenseType, order, active: true })))

export const normalizeFieldLabel = (label: string) => label.trim().replace(/\s+/g, ' ')
