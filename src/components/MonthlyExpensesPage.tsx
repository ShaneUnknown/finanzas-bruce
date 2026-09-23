import { useCallback, useEffect, useRef, useState } from 'react'
import { liveQuery } from 'dexie'
import { FiArrowLeft, FiChevronDown, FiChevronUp, FiPlus, FiSave, FiTrash2, FiX } from 'react-icons/fi'
import { useBlocker, useNavigate, useParams } from 'react-router-dom'
import { db, type MonthlyExpense, type MonthlyExpenseType } from '../db/financeDB'
import type { ExpenseField } from '../db/expenseFields'
import { createExpenseField, setExpenseFieldActive, saveMonthlyExpenses } from '../db/expenseFieldActions'
import './MonthlyExpensesPage.css'

interface Props { month: string }
const TABS: { id: MonthlyExpenseType; label: string }[] = [
  { id: 'fixed', label: 'Fijos' }, { id: 'variable', label: 'Variables' }, { id: 'supplier', label: 'Proveedores' },
]
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
  const [fields, setFields] = useState<ExpenseField[]>([])
  const [fieldsLoading, setFieldsLoading] = useState(true)
  const [fieldName, setFieldName] = useState('')
  const [managingFields, setManagingFields] = useState(false)
  const [fieldBusy, setFieldBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldNotice, setFieldNotice] = useState<string | null>(null)
  const [viewportTop, setViewportTop] = useState(0)
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)
  const allowNavigation = useRef(false)
  const blockedLocation = useRef<{ pathname: string; search: string; hash: string; state: unknown } | null>(null)
  const formType: MonthlyExpenseType = expenseType === 'variable' || expenseType === 'supplier' ? expenseType : 'fixed'
  const currentMonth = new Date().toISOString().slice(0, 7)
  const month = routeMonth && /^\d{4}-\d{2}$/.test(routeMonth) ? routeMonth : currentMonth
  useEffect(() => {
    const visualViewport = window.visualViewport
    if (!visualViewport) return
    const updateViewportTop = () => setViewportTop(Math.max(0, visualViewport.offsetTop))
    updateViewportTop()
    visualViewport.addEventListener('resize', updateViewportTop)
    visualViewport.addEventListener('scroll', updateViewportTop)
    return () => {
      visualViewport.removeEventListener('resize', updateViewportTop)
      visualViewport.removeEventListener('scroll', updateViewportTop)
    }
  }, [])
  useEffect(() => {
    setFieldsLoading(true)
    const subscription = liveQuery(() => db.expenseFields.where('type').equals(formType).sortBy('order')).subscribe({
      next: fields => { setFields(fields); setFieldsLoading(false) },
      error: () => { setError('No se pudieron cargar los campos. Vuelve a abrir esta pantalla.'); setFieldsLoading(false) },
    })
    return () => subscription.unsubscribe()
  }, [formType])
  const activeFields = fields.filter(field => field.active)
  const hasAmounts = Object.values(values).some(value => value.trim() !== '')
  const hasUnsavedChanges = hasAmounts || fieldName.trim() !== ''
  const createField = async (event: React.FormEvent) => {
    event.preventDefault()
    if (fieldBusy) return
    setFieldBusy(true)
    setError(null)
    setFieldNotice(null)
    try {
      const field = await createExpenseField(db, formType, fieldName)
      setFieldName('')
      setFieldNotice('Campo “' + field.label + '” creado. Ya puedes ingresar su monto.')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo crear el campo.')
    } finally { setFieldBusy(false) }
  }
  const toggleField = async (field: ExpenseField) => {
    if (fieldBusy) return
    if (field.active && values[field.id]?.trim()) {
      setError('Borra o guarda el monto de este campo antes de archivarlo.')
      return
    }
    setFieldBusy(true)
    setError(null)
    setFieldNotice(null)
    try {
      await setExpenseFieldActive(db, field.id, !field.active)
      setFieldNotice('Campo “' + field.label + (field.active ? '” archivado.' : '” reactivado.'))
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo actualizar el campo.')
    } finally { setFieldBusy(false) }
  }
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
    if (saving || fieldBusy) return
    setSaving(true)
    setError(null)
    try {
      if (fieldName.trim()) throw new Error('Crea el campo pendiente o borra su nombre antes de guardar los gastos.')
      await saveMonthlyExpenses(db, formType, month, values)
      allowNavigation.current = true
      navigate('/', { state: { month } })
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudieron guardar los gastos. Inténtalo otra vez.')
    } finally { setSaving(false) }
  }

  return (
    <main className={'monthly-expense-form-screen create-expense-screen expense-theme-' + formType}>
      <div className="monthly-expense-screen-content">
        <header className="monthly-expense-screen-header create-expense-header" style={{ top: viewportTop }}>
          <div className="create-expense-title">
            <button type="button" className="screen-back-btn" onClick={closeForm} aria-label="Volver"><FiArrowLeft /></button>
            <div><span>Nuevo gasto</span><h1>{TABS.find(tab => tab.id === formType)?.label}</h1></div>
          </div>
          <button className="btn btn-primary monthly-expense-screen-save" disabled={saving || fieldBusy || fieldsLoading || !hasAmounts} type="submit" form="new-monthly-expense-form">
            <FiSave /> {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </header>
        {error && <p className="backup-error" role="alert">{error}</p>}
        {fieldNotice && <p className="field-notice" role="status">{fieldNotice}</p>}
        <section className="expense-field-settings" aria-label="Personalizar campos">
          <form onSubmit={createField} className="expense-field-create">
            <label htmlFor="expense-field-name">Crear campo en {TABS.find(tab => tab.id === formType)?.label}</label>
            <div>
              <input id="expense-field-name" value={fieldName} maxLength={80} placeholder="Ej. Transporte"
                disabled={fieldBusy || saving || fieldsLoading} onChange={event => setFieldName(event.target.value)} />
              <button className="btn btn-primary" type="submit" disabled={fieldBusy || saving || fieldsLoading || !fieldName.trim()}><FiPlus /> Crear campo</button>
            </div>
          </form>
          <button type="button" className="btn btn-secondary expense-fields-toggle" aria-expanded={managingFields}
            onClick={() => setManagingFields(previous => !previous)}>
            <span>Administrar campos</span>
            {managingFields ? <FiChevronUp aria-hidden="true" /> : <FiChevronDown aria-hidden="true" />}
          </button>
          {managingFields && <div className="expense-field-management">
            <p>Los campos se guardan para todos los meses. Archivarlos conserva los gastos anteriores.</p>
            {fields.map(field => <div className="expense-field-setting-row" key={field.id}>
              <span>{field.label}{!field.active && <small>Archivado</small>}</span>
              <button type="button" className="btn btn-secondary" disabled={fieldBusy || saving}
                aria-label={(field.active ? 'Archivar ' : 'Reactivar ') + field.label}
                onClick={() => void toggleField(field)}>{field.active ? 'Archivar' : 'Reactivar'}</button>
            </div>)}
          </div>}
        </section>
        <form id="new-monthly-expense-form" className="monthly-expense-screen-form" onSubmit={saveExpenses}>
          <div className="monthly-expense-screen-body">
            {fieldsLoading && <p role="status">Cargando campos…</p>}
            {!fieldsLoading && !activeFields.length && <p>No hay campos activos. Crea uno o reactiva un campo archivado.</p>}
            <div className={formType === 'fixed' ? 'monthly-expense-fields two-columns' : 'monthly-expense-fields'}>
              {activeFields.map(field => <label className="monthly-expense-field" key={field.id}><span>{field.label}</span><div className="monthly-expense-input"><span>S/.</span>
                <input disabled={saving || fieldBusy} type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00" value={values[field.id] ?? ''}
                  onChange={event => setValues(previous => ({ ...previous, [field.id]: event.target.value }))} /></div></label>)}
            </div>
          </div>
        </form>
      </div>

      {showUnsavedDialog && (
        <div className="modal-overlay">
          <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="form-unsaved-title">
            <div className="modal-header"><h3 id="form-unsaved-title">¿Descartar cambios?</h3><button type="button" className="modal-close-btn" onClick={dismissUnsavedDialog} aria-label="Cerrar"><FiX /></button></div>
            <div className="modal-body"><p>Tienes montos o un nombre de campo sin guardar. Si sales ahora, se perderán esos cambios.</p></div>
            <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={dismissUnsavedDialog}>Seguir editando</button><button type="button" className="btn btn-danger" onClick={discardAndLeave}>Descartar</button></div>
          </div>
        </div>
      )}
    </main>
  )
}
