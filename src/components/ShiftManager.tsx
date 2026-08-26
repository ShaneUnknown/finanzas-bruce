import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  FiChevronLeft,
  FiChevronRight,
  FiCalendar,
  FiCheck,
  FiEdit,
  FiFileText,
  FiLoader,
  FiPlus,
  FiTrash2,
  FiSave,
  FiSunrise,
  FiSunset,
  FiTrendingDown,
  FiTrendingUp,
  FiX,
} from 'react-icons/fi'
import {
  DAILY_EXPENSE_CATEGORIES,
  db,
  getBalance,
  getExpenseTotal,
  getIncomeTotal,
  INCOME_CATEGORIES,
  LONG_TERM_EXPENSE_CATEGORIES,
  normalizeRecord,
  sumEntries,
  type DailyRecord,
  type EntryGroup,
  type RecordEntry,
} from '../db/financeDB'
import { useBackDismiss } from '../hooks/useBackDismiss'
import './ShiftManager.css'

interface ShiftManagerProps {
  activeFinanceTab: FinanceTab
  onFinanceTabChange: (tab: FinanceTab) => void
  selectedDate: string | null
  onRecordSaved: () => void
  onNavigateDate?: (direction: 'prev' | 'next') => void
}

type ShiftType = 'morning' | 'afternoon'
export type FinanceTab = 'income' | 'expense'
type PendingAction =
  | { type: 'shift'; target: ShiftType }
  | { type: 'nav'; target: 'prev' | 'next' }

type AmountMap = Record<string, string>
type Category = { id: string; label: string }

const toAmountMap = (items: RecordEntry[] = []) =>
  Object.fromEntries(items.map(item => [item.categoryId, item.amount ? String(item.amount) : '']))

const parseAmount = (value: string | undefined) => {
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0 ? amount : 0
}

const buildItems = (
  categories: readonly Category[],
  values: AmountMap,
  group: EntryGroup,
  previousItems: RecordEntry[],
) => {
  const configuredIds = new Set(categories.map(category => category.id))
  const configured = categories
    .map(category => ({
      categoryId: category.id,
      label: category.label,
      amount: parseAmount(values[category.id]),
      group,
    }))
    .filter(item => item.amount > 0)
  const preserved = previousItems
    .filter(item => !configuredIds.has(item.categoryId))
    .map(item => ({ ...item, amount: parseAmount(values[item.categoryId]) }))
    .filter(item => item.amount > 0)
  return [...preserved, ...configured]
}

const currency = (amount: number) =>
  `S/. ${amount.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const ShiftManager: React.FC<ShiftManagerProps> = ({
  activeFinanceTab,
  onFinanceTabChange,
  selectedDate,
  onRecordSaved,
  onNavigateDate,
}) => {
  const [activeShift, setActiveShift] = useState<ShiftType>(() =>
    new Date().getHours() < 12 ? 'morning' : 'afternoon',
  )
  const [record, setRecord] = useState<DailyRecord | null>(null)
  const [loading, setLoading] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [incomeValues, setIncomeValues] = useState<AmountMap>({})
  const [expenseValues, setExpenseValues] = useState<AmountMap>({})
  const [addedMonthlyIds, setAddedMonthlyIds] = useState<string[]>([])
  const [showMonthlyPicker, setShowMonthlyPicker] = useState(false)
  const [selectedMonthlyIds, setSelectedMonthlyIds] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)

  useBackDismiss(showMonthlyPicker, () => setShowMonthlyPicker(false))
  useBackDismiss(showConfirmModal, () => setShowConfirmModal(false))

  const formSnapshot = (income: AmountMap, expense: AmountMap, text: string) => {
    const normalizeAmounts = (values: AmountMap) =>
      Object.entries(values)
        .map(([categoryId, value]) => [categoryId, parseAmount(value)] as const)
        .filter(([, amount]) => amount > 0)
        .sort(([firstId], [secondId]) => firstId.localeCompare(secondId))

    return JSON.stringify({
      income: normalizeAmounts(income),
      expense: normalizeAmounts(expense),
      notes: text.trim(),
    })
  }

  useEffect(() => {
    if (!selectedDate) {
      setRecord(null)
      return
    }

    const loadRecord = async () => {
      setLoading(true)
      try {
        const found = await db.dailyRecords.get(`${selectedDate}_${activeShift}`)
        if (found) {
          const normalized = normalizeRecord(found)
          const nextIncome = toAmountMap(normalized.incomeItems)
          const nextExpense = toAmountMap(normalized.expenseItems)
          setRecord(normalized)
          setIncomeValues(nextIncome)
          setExpenseValues(nextExpense)
          setAddedMonthlyIds(
            LONG_TERM_EXPENSE_CATEGORIES
              .filter(category => parseAmount(nextExpense[category.id]) > 0)
              .map(category => category.id),
          )
          setShowMonthlyPicker(false)
          setNotes(normalized.notes)
          setSavedSnapshot(formSnapshot(nextIncome, nextExpense, normalized.notes))
          setIsEditing(false)
        } else {
          setRecord(null)
          setIncomeValues({})
          setExpenseValues({})
          setAddedMonthlyIds([])
          setShowMonthlyPicker(false)
          setNotes('')
          setSavedSnapshot(formSnapshot({}, {}, ''))
          setIsEditing(true)
        }
      } catch (error) {
        console.error('Error cargando registro de Dexie:', error)
      } finally {
        setLoading(false)
      }
    }

    void loadRecord()
  }, [selectedDate, activeShift])

  const draftIncomeItems = useMemo(
    () => buildItems(INCOME_CATEGORIES, incomeValues, 'income', record?.incomeItems ?? []),
    [incomeValues, record],
  )
  const dailyExpenseItems = useMemo(
    () => buildItems(DAILY_EXPENSE_CATEGORIES, expenseValues, 'daily', []),
    [expenseValues],
  )
  const longTermExpenseItems = useMemo(
    () => buildItems(LONG_TERM_EXPENSE_CATEGORIES.filter(category => addedMonthlyIds.includes(category.id)), expenseValues, 'longTerm', []),
    [expenseValues, addedMonthlyIds],
  )
  const configuredExpenseIds = useMemo(
    () => new Set<string>([...DAILY_EXPENSE_CATEGORIES, ...LONG_TERM_EXPENSE_CATEGORIES].map(item => item.id)),
    [],
  )
  const legacyExpenseItems = (record?.expenseItems ?? [])
    .filter(item => !configuredExpenseIds.has(item.categoryId))
    .map(item => ({ ...item, amount: parseAmount(expenseValues[item.categoryId]) }))
    .filter(item => item.amount > 0)
  const draftExpenseItems = [...legacyExpenseItems, ...dailyExpenseItems, ...longTermExpenseItems]
  const draftBalance = sumEntries(draftIncomeItems) - sumEntries(draftExpenseItems)
  const hasUnsavedChanges = isEditing && formSnapshot(incomeValues, expenseValues, notes) !== savedSnapshot

  const setValue = (
    setter: React.Dispatch<React.SetStateAction<AmountMap>>,
    categoryId: string,
    value: string,
  ) => setter(previous => ({ ...previous, [categoryId]: value }))

  const availableMonthlyCategories = LONG_TERM_EXPENSE_CATEGORIES.filter(
    category => !addedMonthlyIds.includes(category.id),
  )

  const toggleMonthlyExpense = (categoryId: string) => {
    setSelectedMonthlyIds(previous =>
      previous.includes(categoryId)
        ? previous.filter(id => id !== categoryId)
        : [...previous, categoryId],
    )
  }

  const addSelectedMonthlyExpenses = () => {
    if (selectedMonthlyIds.length === 0) return
    setAddedMonthlyIds(previous => [...new Set([...previous, ...selectedMonthlyIds])])
    setSelectedMonthlyIds([])
    setShowMonthlyPicker(false)
  }

  const removeMonthlyExpense = (categoryId: string) => {
    setAddedMonthlyIds(previous => previous.filter(id => id !== categoryId))
    setExpenseValues(previous => ({ ...previous, [categoryId]: '' }))
  }

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedDate) return

    const now = Date.now()
    const productSales = draftIncomeItems.find(item => item.categoryId === 'product_sales')?.amount ?? 0
    const recordData: DailyRecord = {
      id: `${selectedDate}_${activeShift}`,
      date: selectedDate,
      shift: activeShift,
      income: sumEntries(draftIncomeItems.filter(item => item.categoryId !== 'product_sales')),
      expense: sumEntries(draftExpenseItems),
      productSales,
      incomeItems: draftIncomeItems,
      expenseItems: draftExpenseItems,
      notes: notes.trim(),
      createdAt: record?.createdAt ?? now,
      updatedAt: now,
    }

    try {
      await db.dailyRecords.put(recordData)
      setRecord(recordData)
      setSavedSnapshot(formSnapshot(incomeValues, expenseValues, notes))
      setIsEditing(false)
      onRecordSaved()
    } catch (error) {
      console.error('Error guardando en Dexie:', error)
      alert('Hubo un error al guardar los datos.')
    }
  }

  const handleCancel = () => {
    if (!record) return
    const nextIncome = toAmountMap(record.incomeItems)
    const nextExpense = toAmountMap(record.expenseItems)
    setIncomeValues(nextIncome)
    setExpenseValues(nextExpense)
    setAddedMonthlyIds(
      LONG_TERM_EXPENSE_CATEGORIES
        .filter(category => parseAmount(nextExpense[category.id]) > 0)
        .map(category => category.id),
    )
    setShowMonthlyPicker(false)
    setNotes(record.notes)
    setSavedSnapshot(formSnapshot(nextIncome, nextExpense, record.notes))
    setIsEditing(false)
  }

  const requestAction = (action: PendingAction) => {
    if (hasUnsavedChanges) {
      setPendingAction(action)
      setShowConfirmModal(true)
      return
    }
    if (action.type === 'shift') setActiveShift(action.target)
    else onNavigateDate?.(action.target)
  }

  const confirmDiscard = () => {
    if (pendingAction?.type === 'shift') setActiveShift(pendingAction.target)
    if (pendingAction?.type === 'nav') onNavigateDate?.(pendingAction.target)
    setPendingAction(null)
    setShowConfirmModal(false)
  }

  const todayDateString = (() => {
    const today = new Date()
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  })()
  const canNavigateToNextDay = Boolean(selectedDate && selectedDate < todayDateString)

  const formattedDay = (() => {
    if (!selectedDate) return ''
    const [year, month, day] = selectedDate.split('-').map(Number)
    const result = new Date(year, month - 1, day).toLocaleDateString('es-PE', {
      weekday: 'long',
      day: 'numeric',
    })
    return result.charAt(0).toUpperCase() + result.slice(1)
  })()

  const renderAmountInput = (
    category: Category,
    values: AmountMap,
    setter: React.Dispatch<React.SetStateAction<AmountMap>>,
  ) => (
    <div className="form-group category-field" key={category.id}>
      <label htmlFor={`${activeShift}-${category.id}`}>{category.label}</label>
      <div className="input-with-symbol">
        <span className="currency-prefix">S/.</span>
        <input
          id={`${activeShift}-${category.id}`}
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          placeholder="0.00"
          value={values[category.id] ?? ''}
          onChange={event => setValue(setter, category.id, event.target.value)}
        />
      </div>
    </div>
  )

  if (!selectedDate) {
    return <div className="shift-manager-empty"><p>Selecciona un día para registrar tus movimientos.</p></div>
  }

  if (selectedDate > todayDateString) {
    return (
      <div className="future-date-card" role="status">
        <FiCalendar className="future-date-icon" aria-hidden="true" />
        <p>No hay datos que mostrar</p>
      </div>
    )
  }

  const visibleItems = activeFinanceTab === 'income' ? record?.incomeItems ?? [] : record?.expenseItems ?? []
  const visibleTotal = activeFinanceTab === 'income' ? getIncomeTotal(record ?? {}) : getExpenseTotal(record ?? {})

  return (
    <div className="shift-manager-card">
      <div className="shift-tabs">
        <button type="button" className={`shift-tab-btn ${activeShift === 'morning' ? 'active' : ''}`} onClick={() => requestAction({ type: 'shift', target: 'morning' })}>
          <FiSunrise className="tab-icon" /> <span>Mañana</span>
        </button>
        <button type="button" className={`shift-tab-btn ${activeShift === 'afternoon' ? 'active' : ''}`} onClick={() => requestAction({ type: 'shift', target: 'afternoon' })}>
          <FiSunset className="tab-icon" /> <span>Tarde</span>
        </button>
      </div>

      <div className="shift-content">
        <div className="shift-total-header-group">
          <button type="button" className="day-nav-btn" onClick={() => requestAction({ type: 'nav', target: 'prev' })} aria-label="Día anterior"><FiChevronLeft /></button>
          <div className="shift-day-display">
            <span className="shift-day-title">{formattedDay}</span>
            <div className={`shift-total-summary ${isEditing ? 'edit-preview' : ''}`}>
              <div className="total-info">
                <span className="total-label">Balance del turno</span>
                <span className={`total-value ${(isEditing ? draftBalance : getBalance(record ?? {})) >= 0 ? 'positive' : 'negative'}`}>
                  {loading ? <FiLoader className="spin-icon" /> : currency(isEditing ? draftBalance : getBalance(record ?? {}))}
                </span>
              </div>
            </div>
          </div>
          {canNavigateToNextDay ? (
            <button type="button" className="day-nav-btn" onClick={() => requestAction({ type: 'nav', target: 'next' })} aria-label="Día siguiente"><FiChevronRight /></button>
          ) : <span className="day-nav-placeholder" aria-hidden="true" />}
        </div>

        <div className="finance-tabs compact" role="tablist" aria-label="Tipo de movimiento">
          <button
            type="button"
            role="tab"
            aria-selected={activeFinanceTab === 'income'}
            className={`finance-tab income ${activeFinanceTab === 'income' ? 'active' : ''}`}
            onClick={() => onFinanceTabChange('income')}
          >
            <FiTrendingUp /> <span>Ingresos</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeFinanceTab === 'expense'}
            className={`finance-tab expense ${activeFinanceTab === 'expense' ? 'active' : ''}`}
            onClick={() => onFinanceTabChange('expense')}
          >
            <FiTrendingDown /> <span>Egresos</span>
          </button>
        </div>

        {isEditing ? (
          <form onSubmit={handleSave} className="shift-form">
            {activeFinanceTab === 'income' ? (
              <section className="category-section compact-section finance-form-panel">
                <h3 className="expense-section-title income-form-title">Ingresos</h3>
                <div className="category-grid compact-grid">
                  {INCOME_CATEGORIES.map(category => renderAmountInput(category, incomeValues, setIncomeValues))}
                  {(record?.incomeItems ?? [])
                    .filter(item => item.group === 'legacy')
                    .map(item => renderAmountInput({ id: item.categoryId, label: item.label }, incomeValues, setIncomeValues))}
                </div>
              </section>
            ) : (
              <>
                <section className="category-section compact-section finance-form-panel">
                  <h3 className="expense-section-title daily-title">Gastos Diarios</h3>
                  <div className="category-grid compact-grid">{DAILY_EXPENSE_CATEGORIES.map(category => renderAmountInput(category, expenseValues, setExpenseValues))}</div>
                </section>
                <section className="category-section compact-section monthly-section finance-form-panel">
                  <h3 className="expense-section-title monthly-title">Gastos Mensuales</h3>
                  <button
                    type="button"
                    className="open-monthly-picker-btn"
                    onClick={() => { setSelectedMonthlyIds([]); setShowMonthlyPicker(true) }}
                    disabled={availableMonthlyCategories.length === 0}
                  >
                    <FiPlus />
                    <span>{availableMonthlyCategories.length ? 'Agregar gasto mensual' : 'Todos los gastos agregados'}</span>
                  </button>
                  {addedMonthlyIds.length > 0 ? (
                    <div className="monthly-fields">
                      {addedMonthlyIds.map(categoryId => {
                        const category = LONG_TERM_EXPENSE_CATEGORIES.find(item => item.id === categoryId)
                        if (!category) return null
                        return (
                          <div className="monthly-field-row" key={category.id}>
                            {renderAmountInput(category, expenseValues, setExpenseValues)}
                            <button type="button" className="remove-monthly-btn" onClick={() => removeMonthlyExpense(category.id)} aria-label={`Quitar ${category.label}`} title="Quitar campo">
                              <FiTrash2 />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  ) : <p className="monthly-empty">Agrega solo los gastos que necesites registrar.</p>}
                </section>
                {legacyExpenseItems.length > 0 && (
                  <section className="category-section legacy-section">
                    <h3>Datos anteriores</h3>
                    {legacyExpenseItems.map(item => renderAmountInput({ id: item.categoryId, label: item.label }, expenseValues, setExpenseValues))}
                  </section>
                )}
              </>
            )}

            <div className="form-group notes-field">
              <label htmlFor="shift-notes"><FiFileText className="label-icon grey" /> Notas del turno</label>
              <textarea id="shift-notes" value={notes} onChange={event => setNotes(event.target.value)} rows={3} placeholder="Escribe alguna nota o comentario..." />
            </div>
            <div className="form-actions">
              {record && <button type="button" className="btn btn-secondary" onClick={handleCancel}><FiX /> Cancelar</button>}
              <button type="submit" className="btn btn-primary btn-grow"><FiSave /> Guardar turno</button>
            </div>
          </form>
        ) : record ? (
          <div className="shift-view-mode">
            <div className="category-summary">
              {visibleItems.length > 0 ? visibleItems.map(item => (
                <div className="summary-row" key={item.categoryId}>
                  <span>{item.label}</span><strong>{currency(item.amount)}</strong>
                </div>
              )) : <p className="empty-category">No hay movimientos en esta pestaña.</p>}
              <div className="summary-row category-total"><span>Total de {activeFinanceTab === 'income' ? 'ingresos' : 'egresos'}</span><strong>{currency(visibleTotal)}</strong></div>
            </div>
            {record.notes && <div className="record-notes"><FiFileText /> <span>{record.notes}</span></div>}
            <div className="record-metadata">
              <span>Creado: {new Date(record.createdAt).toLocaleString('es-PE')}</span>
              {record.updatedAt > record.createdAt && (
                <span>Actualizado: {new Date(record.updatedAt).toLocaleString('es-PE')}</span>
              )}
            </div>
            <button type="button" className="btn btn-primary btn-block btn-edit" onClick={() => setIsEditing(true)}><FiEdit /> Editar turno</button>
          </div>
        ) : null}
      </div>

      {showMonthlyPicker && createPortal(
        <div className="modal-overlay" onClick={() => setShowMonthlyPicker(false)}>
          <div
            className="modal-card monthly-picker-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="monthly-picker-title"
            onClick={event => event.stopPropagation()}
          >
            <div className="modal-header">
              <h3 id="monthly-picker-title">Agregar Gasto Mensual</h3>
              <button className="modal-close-btn" onClick={() => setShowMonthlyPicker(false)} aria-label="Cerrar">
                <FiX />
              </button>
            </div>
            <div className="modal-body monthly-picker-body">
              <p className="monthly-picker-help">Selecciona uno o varios gastos para agregarlos al formulario.</p>
              <div className="monthly-options-grid">
                {availableMonthlyCategories.map(category => (
                  <button
                    type="button"
                    className={`monthly-option-card ${selectedMonthlyIds.includes(category.id) ? 'selected' : ''}`}
                    key={category.id}
                    onClick={() => toggleMonthlyExpense(category.id)}
                    aria-pressed={selectedMonthlyIds.includes(category.id)}
                  >
                    {selectedMonthlyIds.includes(category.id) ? <FiCheck className="monthly-option-icon" /> : <FiPlus className="monthly-option-icon" />}
                    <span>{category.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="modal-footer monthly-picker-footer">
              <button type="button" className="btn btn-primary" onClick={addSelectedMonthlyExpenses} disabled={selectedMonthlyIds.length === 0}>
                Seleccionar{selectedMonthlyIds.length > 0 ? ` (${selectedMonthlyIds.length})` : ""}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {showConfirmModal && createPortal(
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header"><h3>¿Descartar cambios?</h3><button className="modal-close-btn" onClick={() => setShowConfirmModal(false)} aria-label="Cerrar"><FiX /></button></div>
            <div className="modal-body"><p>Tienes cambios sin guardar en este turno.</p></div>
            <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setShowConfirmModal(false)}>Seguir editando</button><button type="button" className="btn btn-danger" onClick={confirmDiscard}>Descartar</button></div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
