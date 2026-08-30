import { useCallback, useEffect, useRef, useState } from 'react'
import { FiArrowLeft, FiPlus, FiSave, FiTrash2, FiX } from 'react-icons/fi'
import { useBlocker, useNavigate, useParams } from 'react-router-dom'
import { db, type MonthlyExpense, type MonthlyExpenseType } from '../db/financeDB'
import './MonthlyExpensesPage.css'

interface Props { month: string }
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

export function MonthlyExpensesPage({ month }: Props) {
  const savedTab = sessionStorage.getItem('monthly-expense-tab')
  const initialTab: MonthlyExpenseType = savedTab === 'variable' || savedTab === 'supplier' ? savedTab : 'fixed'
  const [activeTab, setActiveTab] = useState<MonthlyExpenseType>(initialTab)
  const [records, setRecords] = useState<MonthlyExpense[]>([])
  const navigate = useNavigate()
  const loadRecords = useCallback(async () => {
    const found = await db.monthlyExpenses.where('month').equals(month).toArray()
    setRecords(found.sort((a, b) => b.createdAt - a.createdAt))
  }, [month])
  useEffect(() => { void loadRecords() }, [loadRecords])
  const visibleRecords = records.filter(record => record.type === activeTab)
  const selectTab = (tab: MonthlyExpenseType) => {
    sessionStorage.setItem('monthly-expense-tab', tab)
    setActiveTab(tab)
  }
  const openForm = () => {
    sessionStorage.setItem('finance-swiper-slide', '0')
    sessionStorage.setItem('monthly-expense-tab', activeTab)
    navigate('/expenses/new/' + activeTab + '/' + month)
  }
  const openManager = () => {
    sessionStorage.setItem('finance-swiper-slide', '0')
    sessionStorage.setItem('monthly-expense-tab', activeTab)
    navigate('/expenses/manage/' + activeTab + '/' + month)
  }
  return (
    <section className={'monthly-expenses-page expense-theme-' + activeTab}>
      <div className="monthly-expenses-header"><div><span className="eyebrow">Gastos del mes</span><h2>Control mensual</h2></div>
        <button className="new-expense-btn" type="button" onClick={openForm}><FiPlus /> Nuevo gasto</button></div>
      <div className="expense-tabs" role="tablist" aria-label="Tipos de gastos">
        {TABS.map(tab => <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id}
          className={activeTab === tab.id ? 'active' : ''} onClick={() => selectTab(tab.id)}>{tab.label}</button>)}
      </div>
      <div className="monthly-expense-list">
        {visibleRecords.length ? visibleRecords.map(record => <button type="button" className="monthly-expense-row" key={record.id} onClick={openManager}>
          <div><strong>{record.label}</strong><span>{new Intl.DateTimeFormat('es-PE', {
            weekday: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }).format(new Date(record.createdAt))}</span></div><b>{money(record.amount)}</b>
        </button>) : <div className="monthly-expense-empty">Aún no hay gastos en esta categoría.</div>}
      </div>
    </section>
  )
}

type ExpenseDraft = { amount: string }

export function MonthlyExpenseManagerPage() {
  const { expenseType, month: routeMonth } = useParams()
  const navigate = useNavigate()
  const formType: MonthlyExpenseType = expenseType === 'variable' || expenseType === 'supplier' ? expenseType : 'fixed'
  const currentMonth = new Date().toISOString().slice(0, 7)
  const month = routeMonth && /^\d{4}-\d{2}$/.test(routeMonth) ? routeMonth : currentMonth
  const [records, setRecords] = useState<MonthlyExpense[]>([])
  const [drafts, setDrafts] = useState<Record<number, ExpenseDraft>>({})
  const [savingId, setSavingId] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MonthlyExpense | null>(null)
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)
  const closeDeleteDialog = () => setDeleteTarget(null)
  const allowNavigation = useRef(false)
  const blockedLocation = useRef<{ pathname: string; search: string; hash: string; state: unknown } | null>(null)

  const loadRecords = useCallback(async () => {
    const found = await db.monthlyExpenses.where('month').equals(month).toArray()
    const list = found.filter(record => record.type === formType).sort((a, b) => b.createdAt - a.createdAt)
    setRecords(list)
    setDrafts(Object.fromEntries(list.flatMap(record => record.id === undefined ? [] : [[record.id, {
      amount: String(record.amount),
    }]])))
  }, [formType, month])

  useEffect(() => { void loadRecords() }, [loadRecords])

  const hasUnsavedChanges = records.some(record => record.id !== undefined
    && Number(drafts[record.id]?.amount) !== record.amount)
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    hasUnsavedChanges
    && !allowNavigation.current
    && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search))
  useEffect(() => {
    if (blocker.state === 'blocked') {
      blockedLocation.current = blocker.location
      setShowUnsavedDialog(true)
    }
  }, [blocker])
  const dismissUnsavedDialog = () => {
    setShowUnsavedDialog(false)
    if (blocker.state === 'blocked') blocker.reset()
  }
  const discardAndLeave = () => {
    const target = blockedLocation.current
    allowNavigation.current = true
    setShowUnsavedDialog(false)
    if (blocker.state === 'blocked') blocker.reset()
    if (target) {
      navigate(target.pathname + target.search + target.hash, { state: target.state, replace: true })
    } else {
      navigate('/', { state: { month }, replace: true })
    }
  }

  const closeManager = () => navigate('/', { state: { month } })
  const updateDraft = (id: number, amount: string) => {
    setDrafts(previous => ({ ...previous, [id]: { amount } }))
  }
  const saveRecord = async (record: MonthlyExpense) => {
    if (record.id === undefined) return
    const draft = drafts[record.id]
    const amount = Number(draft?.amount)
    if (!Number.isFinite(amount) || amount <= 0) return
    setSavingId(record.id)
    try {
      await db.monthlyExpenses.update(record.id, { amount })
      await loadRecords()
    } finally {
      setSavingId(null)
    }
  }
  const deleteRecord = async () => {
    if (deleteTarget?.id === undefined) return
    await db.monthlyExpenses.delete(deleteTarget.id)
    setDeleteTarget(null)
    closeDeleteDialog()
    await loadRecords()
  }

  return (
    <main className={'monthly-expense-form-screen expense-theme-' + formType}>
      <div className="monthly-expense-screen-content">
        <header className="monthly-expense-screen-header">
          <button type="button" className="screen-back-btn" onClick={closeManager} aria-label="Volver"><FiArrowLeft /></button>
          <div><span>Editar gastos</span><h1>{TABS.find(tab => tab.id === formType)?.label}</h1></div>
        </header>

        <section className="monthly-expense-manager">
          {records.length ? records.map(record => {
            if (record.id === undefined) return null
            const draft = drafts[record.id] ?? { amount: String(record.amount) }
            const unchanged = Number(draft.amount) === record.amount
            return (
              <article className="expense-manager-row" key={record.id}>
                <div className="expense-manager-info"><strong>{record.label}</strong></div>
                <div className="expense-manager-controls">
                  <div className="monthly-expense-input"><span>S/.</span><input aria-label={'Monto de ' + record.label} type="number" min="0.01" step="0.01" inputMode="decimal" value={draft.amount} onChange={event => updateDraft(record.id!, event.target.value)} /></div>
                  <button type="button" className="expense-delete-btn" onClick={() => setDeleteTarget(record)} aria-label={'Eliminar ' + record.label} title="Eliminar"><FiTrash2 /></button>
                  <button type="button" className="btn btn-primary expense-save-btn" disabled={savingId === record.id || unchanged} onClick={() => void saveRecord(record)} aria-label={'Guardar ' + record.label} title="Guardar"><FiSave /></button>
                </div>
              </article>
            )
          }) : <div className="monthly-expense-empty">No hay gastos para editar en esta categoría.</div>}
        </section>
      </div>

      {showUnsavedDialog && (
        <div className="modal-overlay">
          <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="manager-unsaved-title">
            <div className="modal-header"><h3 id="manager-unsaved-title">¿Descartar cambios?</h3><button type="button" className="modal-close-btn" onClick={dismissUnsavedDialog} aria-label="Cerrar"><FiX /></button></div>
            <div className="modal-body"><p>Tienes montos modificados sin guardar. Si sales ahora, se perderán los cambios.</p></div>
            <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={dismissUnsavedDialog}>Seguir editando</button><button type="button" className="btn btn-danger" onClick={discardAndLeave}>Descartar</button></div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-overlay">
          <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="delete-expense-title">
            <div className="modal-header"><h3 id="delete-expense-title">¿Eliminar gasto?</h3><button type="button" className="modal-close-btn" onClick={closeDeleteDialog} aria-label="Cerrar"><FiX /></button></div>
            <div className="modal-body"><p>Se eliminará “{deleteTarget.label}” de forma permanente.</p></div>
            <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={closeDeleteDialog}>Cancelar</button><button type="button" className="btn btn-danger" onClick={() => void deleteRecord()}>Eliminar</button></div>
          </div>
        </div>
      )}
    </main>
  )
}

export function MonthlyExpenseFormPage() {
  const { expenseType, month: routeMonth } = useParams()
  const navigate = useNavigate()
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)
  const allowNavigation = useRef(false)
  const blockedLocation = useRef<{ pathname: string; search: string; hash: string; state: unknown } | null>(null)
  const formType: MonthlyExpenseType = expenseType === 'variable' || expenseType === 'supplier' ? expenseType : 'fixed'
  const currentMonth = new Date().toISOString().slice(0, 7)
  const month = routeMonth && /^\d{4}-\d{2}$/.test(routeMonth) ? routeMonth : currentMonth
  const hasUnsavedChanges = Object.values(values).some(value => value.trim() !== '')
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    hasUnsavedChanges
    && !allowNavigation.current
    && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search))
  useEffect(() => {
    if (blocker.state === 'blocked') {
      blockedLocation.current = blocker.location
      setShowUnsavedDialog(true)
    }
  }, [blocker])
  const dismissUnsavedDialog = () => {
    setShowUnsavedDialog(false)
    if (blocker.state === 'blocked') blocker.reset()
  }
  const discardAndLeave = () => {
    const target = blockedLocation.current
    allowNavigation.current = true
    setShowUnsavedDialog(false)
    if (blocker.state === 'blocked') blocker.reset()
    if (target) {
      navigate(target.pathname + target.search + target.hash, { state: target.state, replace: true })
    } else {
      navigate('/', { state: { month }, replace: true })
    }
  }
  const closeForm = () => navigate('/', { state: { month } })
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
    allowNavigation.current = true
    try { await db.monthlyExpenses.bulkAdd(newRecords); navigate('/', { state: { month } }) }
    finally { setSaving(false) }
  }
  return (
    <main className={'monthly-expense-form-screen expense-theme-' + formType}>
      <div className="monthly-expense-screen-content">
        <header className="monthly-expense-screen-header create-expense-header">
          <div className="create-expense-title">
            <button type="button" className="screen-back-btn" onClick={closeForm} aria-label="Volver"><FiArrowLeft /></button>
            <div><span>Nuevo gasto</span><h1>{TABS.find(tab => tab.id === formType)?.label}</h1></div>
          </div>
          <button className="btn btn-primary monthly-expense-screen-save" disabled={saving || !hasUnsavedChanges} type="submit" form="new-monthly-expense-form">
            <FiSave /> {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </header>
        <form id="new-monthly-expense-form" className="monthly-expense-screen-form" onSubmit={saveExpenses}>
          <div className="monthly-expense-screen-body">
            <div className={formType === 'fixed' ? 'monthly-expense-fields two-columns' : 'monthly-expense-fields'}>
              {FIELDS[formType].map(field => <label className="monthly-expense-field" key={field.id}><span>{field.label}</span><div className="monthly-expense-input"><span>S/.</span>
                <input type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00" value={values[field.id] ?? ''}
                  onChange={event => setValues(previous => ({ ...previous, [field.id]: event.target.value }))} /></div></label>)}
            </div>
          </div>
        </form>
      </div>

      {showUnsavedDialog && (
        <div className="modal-overlay">
          <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="form-unsaved-title">
            <div className="modal-header"><h3 id="form-unsaved-title">¿Descartar cambios?</h3><button type="button" className="modal-close-btn" onClick={dismissUnsavedDialog} aria-label="Cerrar"><FiX /></button></div>
            <div className="modal-body"><p>Tienes montos ingresados sin guardar. Si sales ahora, se perderán los cambios.</p></div>
            <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={dismissUnsavedDialog}>Seguir editando</button><button type="button" className="btn btn-danger" onClick={discardAndLeave}>Descartar</button></div>
          </div>
        </div>
      )}
    </main>
  )
}
