import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { FiPlus, FiSave, FiX } from 'react-icons/fi'
import { db, type MonthlyExpense, type MonthlyExpenseType } from '../db/financeDB'
import './MonthlyExpensesPage.css'

interface Props { month: string; onSaved: () => void }
type ExpenseField = { id: string; label: string }
const TABS: { id: MonthlyExpenseType; label: string }[] = [
  { id: 'fixed', label: 'Fijos' }, { id: 'variable', label: 'Variables' }, { id: 'supplier', label: 'Proveedores' },
]
const FIELDS: Record<MonthlyExpenseType, ExpenseField[]> = {
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
const money = (amount: number) => 'S/. ' + amount.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function MonthlyExpensesPage({ month, onSaved }: Props) {
  const [activeTab, setActiveTab] = useState<MonthlyExpenseType>('fixed')
  const [records, setRecords] = useState<MonthlyExpense[]>([])
  const [showDialog, setShowDialog] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const loadRecords = useCallback(async () => {
    const found = await db.monthlyExpenses.where('month').equals(month).toArray()
    setRecords(found.sort((a, b) => b.createdAt - a.createdAt))
  }, [month])
  useEffect(() => { void loadRecords() }, [loadRecords])
  const visibleRecords = records.filter(record => record.type === activeTab)
  const openDialog = () => { setValues({}); setShowDialog(true) }
  const saveExpenses = async (event: React.FormEvent) => {
    event.preventDefault()
    const now = Date.now()
    const newRecords = FIELDS[activeTab].flatMap((field, index) => {
      const amount = Number(values[field.id])
      return Number.isFinite(amount) && amount > 0
        ? [{ month, type: activeTab, fieldId: field.id, label: field.label, amount, createdAt: now + index }]
        : []
    })
    if (!newRecords.length) return
    setSaving(true)
    try { await db.monthlyExpenses.bulkAdd(newRecords); await loadRecords(); setShowDialog(false); onSaved() }
    finally { setSaving(false) }
  }
  return (
    <section className="monthly-expenses-page">
      <div className="monthly-expenses-header"><div><span className="eyebrow">Gastos del mes</span><h2>Control mensual</h2></div>
        <button className="new-expense-btn" type="button" onClick={openDialog}><FiPlus /> Nuevo gasto</button></div>
      <div className="expense-tabs" role="tablist" aria-label="Tipos de gastos">
        {TABS.map(tab => <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id}
          className={activeTab === tab.id ? 'active' : ''} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}
      </div>
      <div className="monthly-expense-list">
        {visibleRecords.length ? visibleRecords.map(record => <article className="monthly-expense-row" key={record.id}>
          <div><strong>{record.label}</strong><span>{new Date(record.createdAt).toLocaleDateString('es-PE')}</span></div><b>{money(record.amount)}</b>
        </article>) : <div className="monthly-expense-empty">Aún no hay gastos en esta categoría.</div>}
      </div>
      {showDialog && createPortal(<div className="modal-overlay monthly-expense-overlay" onClick={() => setShowDialog(false)}>
        <form className="modal-card monthly-expense-dialog" onSubmit={saveExpenses} onClick={event => event.stopPropagation()}>
          <div className="modal-header"><h3>Nuevo gasto · {TABS.find(tab => tab.id === activeTab)?.label}</h3>
            <button type="button" className="modal-close-btn" onClick={() => setShowDialog(false)} aria-label="Cerrar"><FiX /></button></div>
          <div className="monthly-expense-form-scroll"><div className={activeTab === 'fixed' ? 'monthly-expense-fields two-columns' : 'monthly-expense-fields'}>
            {FIELDS[activeTab].map(field => <label className="monthly-expense-field" key={field.id}><span>{field.label}</span><div><span>S/.</span>
              <input type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00" value={values[field.id] ?? ''}
                onChange={event => setValues(previous => ({ ...previous, [field.id]: event.target.value }))} /></div></label>)}
          </div></div>
          <div className="modal-footer monthly-expense-footer"><button className="btn btn-primary btn-block" disabled={saving} type="submit"><FiSave /> {saving ? 'Guardando…' : 'Guardar gasto'}</button></div>
        </form></div>, document.body)}
    </section>
  )
}
