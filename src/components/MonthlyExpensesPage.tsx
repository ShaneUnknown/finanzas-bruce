import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { FiArrowLeft, FiPlus, FiSave } from 'react-icons/fi'
import { useMatch, useNavigate } from 'react-router-dom'
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
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()
  const formMatch = useMatch('/expenses/new/:expenseType')
  const requestedType = formMatch?.params.expenseType
  const formType: MonthlyExpenseType = requestedType === 'variable' || requestedType === 'supplier' ? requestedType : 'fixed'
  const loadRecords = useCallback(async () => {
    const found = await db.monthlyExpenses.where('month').equals(month).toArray()
    setRecords(found.sort((a, b) => b.createdAt - a.createdAt))
  }, [month])
  useEffect(() => { void loadRecords() }, [loadRecords])
  const visibleRecords = records.filter(record => record.type === activeTab)
  const openForm = () => {
    setValues({})
    navigate('/expenses/new/' + activeTab)
  }
  const closeForm = () => navigate('/')
  const saveExpenses = async (event: React.FormEvent) => {
    event.preventDefault()
    const now = Date.now()
    const newRecords = FIELDS[formType].flatMap((field, index) => {
      const amount = Number(values[field.id])
      return Number.isFinite(amount) && amount > 0
        ? [{ month, type: formType, fieldId: field.id, label: field.label, amount, createdAt: now + index }]
        : []
    })
    if (!newRecords.length) return
    setSaving(true)
    try { await db.monthlyExpenses.bulkAdd(newRecords); await loadRecords(); closeForm(); onSaved() }
    finally { setSaving(false) }
  }
  return (
    <section className="monthly-expenses-page">
      <div className="monthly-expenses-header"><div><span className="eyebrow">Gastos del mes</span><h2>Control mensual</h2></div>
        <button className="new-expense-btn" type="button" onClick={openForm}><FiPlus /> Nuevo gasto</button></div>
      <div className="expense-tabs" role="tablist" aria-label="Tipos de gastos">
        {TABS.map(tab => <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id}
          className={activeTab === tab.id ? 'active' : ''} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}
      </div>
      <div className="monthly-expense-list">
        {visibleRecords.length ? visibleRecords.map(record => <article className="monthly-expense-row" key={record.id}>
          <div><strong>{record.label}</strong><span>{new Date(record.createdAt).toLocaleDateString('es-PE')}</span></div><b>{money(record.amount)}</b>
        </article>) : <div className="monthly-expense-empty">Aún no hay gastos en esta categoría.</div>}
      </div>
      {formMatch && createPortal(
        <main className="monthly-expense-form-screen">
          <form className="monthly-expense-screen-content" onSubmit={saveExpenses}>
            <header className="monthly-expense-screen-header">
              <button type="button" className="screen-back-btn" onClick={closeForm} aria-label="Volver"><FiArrowLeft /></button>
              <div><span>Nuevo gasto</span><h1>{TABS.find(tab => tab.id === formType)?.label}</h1></div>
            </header>
            <div className="monthly-expense-screen-body">
              <p>Ingresa uno o varios importes para el mes seleccionado.</p>
              <div className={formType === 'fixed' ? 'monthly-expense-fields two-columns' : 'monthly-expense-fields'}>
                {FIELDS[formType].map(field => <label className="monthly-expense-field" key={field.id}><span>{field.label}</span><div><span>S/.</span>
                  <input type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00" value={values[field.id] ?? ''}
                    onChange={event => setValues(previous => ({ ...previous, [field.id]: event.target.value }))} /></div></label>)}
              </div>
              <button className="btn btn-primary btn-block monthly-expense-screen-save" disabled={saving} type="submit">
                <FiSave /> {saving ? 'Guardando…' : 'Guardar gasto'}
              </button>
            </div>
          </form>
        </main>, document.body
      )}
    </section>
  )
}
