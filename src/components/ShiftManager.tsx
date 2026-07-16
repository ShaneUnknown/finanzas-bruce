import React, { useState, useEffect } from 'react'
import { 
  FiSunrise,
  FiSunset, 
  FiTrendingUp, 
  FiTrendingDown, 
  FiShoppingBag, 
  FiFileText, 
  FiEdit, 
  FiSave,
  FiX,
  FiChevronLeft,
  FiChevronRight,
  FiLoader
} from 'react-icons/fi'
import { db, type DailyRecord } from '../db/financeDB'
import './ShiftManager.css'

interface ShiftManagerProps {
  selectedDate: string | null // format: YYYY-MM-DD
  onRecordSaved: () => void
  onNavigateDate?: (direction: 'prev' | 'next') => void
}

type ShiftType = 'morning' | 'afternoon'

export const ShiftManager: React.FC<ShiftManagerProps> = ({ 
  selectedDate, 
  onRecordSaved,
  onNavigateDate 
}) => {
  const getFormattedDay = (dateStr: string | null) => {
    if (!dateStr) return ''
    const [year, month, day] = dateStr.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    const formatted = date.toLocaleDateString('es-PE', {
      weekday: 'long',
      day: 'numeric'
    })
    return formatted.charAt(0).toUpperCase() + formatted.slice(1)
  }
  const [activeShift, setActiveShift] = useState<ShiftType>('morning')
  const [record, setRecord] = useState<DailyRecord | null>(null)
  const [loading, setLoading] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  // Form inputs state
  const [income, setIncome] = useState('')
  const [expense, setExpense] = useState('')
  const [productSales, setProductSales] = useState('')
  const [notes, setNotes] = useState('')

  // Load record from database when selectedDate or activeShift changes
  useEffect(() => {
    if (!selectedDate) {
      setRecord(null)
      return
    }

    const loadRecord = async () => {
      setLoading(true)
      try {
        const id = `${selectedDate}_${activeShift}`
        const found = await db.dailyRecords.get(id)
        if (found) {
          setRecord(found)
          setIncome(found.income.toString())
          setExpense(found.expense.toString())
          setProductSales(found.productSales.toString())
          setNotes(found.notes)
          setIsEditing(false)
        } else {
          setRecord(null)
          // Reset form to blank inputs
          setIncome('')
          setExpense('')
          setProductSales('')
          setNotes('')
          setIsEditing(true) // Automatically show inputs if no record exists
        }
      } catch (error) {
        console.error('Error cargando registro de Dexie:', error)
      } finally {
        setLoading(false)
      }
    }

    loadRecord()
  }, [selectedDate, activeShift])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedDate) return

    const id = `${selectedDate}_${activeShift}`
    const now = Date.now()

    const recordData: DailyRecord = {
      id,
      date: selectedDate,
      shift: activeShift,
      income: parseFloat(income) || 0,
      expense: parseFloat(expense) || 0,
      productSales: parseFloat(productSales) || 0,
      notes: notes.trim(),
      createdAt: record ? record.createdAt : now,
      updatedAt: now
    }

    try {
      await db.dailyRecords.put(recordData)
      setRecord(recordData)
      setIsEditing(false)
      onRecordSaved()
    } catch (error) {
      console.error('Error guardando en Dexie:', error)
      alert('Hubo un error al guardar los datos.')
    }
  }

  const handleCancel = () => {
    if (record) {
      // Revert inputs to current record values
      setIncome(record.income.toString())
      setExpense(record.expense.toString())
      setProductSales(record.productSales.toString())
      setNotes(record.notes)
      setIsEditing(false)
    }
  }

  if (!selectedDate) {
    return (
      <div className="shift-manager-empty">
        <p>Selecciona un día en el calendario para registrar tus ingresos y egresos.</p>
      </div>
    )
  }

  return (
    <div className="shift-manager-card">
      {/* Shift Tabs */}
      <div className="shift-tabs">
        <button
          type="button"
          className={`shift-tab-btn ${activeShift === 'morning' ? 'active' : ''}`}
          onClick={() => setActiveShift('morning')}
        >
          <FiSunrise className="tab-icon" />
          <span>Mañana</span>
        </button>
        <button
          type="button"
          className={`shift-tab-btn ${activeShift === 'afternoon' ? 'active' : ''}`}
          onClick={() => setActiveShift('afternoon')}
        >
          <FiSunset className="tab-icon" />
          <span>Tarde</span>
        </button>
      </div>

      <div className="shift-content">
        {!isEditing && record ? (
          /* View Mode */
          (() => {
            const total = record.income + record.productSales - record.expense
            return (
              <div className="shift-view-mode">
                <div className="shift-total-header-group">
                  <button
                    type="button"
                    className="day-nav-btn"
                    onClick={() => onNavigateDate?.('prev')}
                    aria-label="Día anterior"
                  >
                    <FiChevronLeft />
                  </button>

                  <div className="shift-day-display">
                    <div className="shift-day-header">
                      <span className="shift-day-title">{getFormattedDay(selectedDate)}</span>
                    </div>

                    <div className="shift-total-summary">
                      <div className="total-info">
                        <span className="total-label">Total</span>
                        <span className={`total-value ${total >= 0 ? 'positive' : 'negative'}`}>
                          {loading ? (
                            <FiLoader className="spin-icon" />
                          ) : (
                            `S/. ${total.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="day-nav-btn"
                    onClick={() => onNavigateDate?.('next')}
                    aria-label="Siguiente día"
                  >
                    <FiChevronRight />
                  </button>
                </div>

                <div className="data-list">
                  <div className="data-item income-item">
                    <div className="item-header">
                      <FiTrendingUp className="item-icon green" />
                      <span className="item-label">Ingresos</span>
                    </div>
                    <span className="item-value">
                      {loading ? <FiLoader className="spin-icon" /> : `S/. ${record.income.toFixed(2)}`}
                    </span>
                  </div>

                  <div className="data-item expense-item">
                    <div className="item-header">
                      <FiTrendingDown className="item-icon red" />
                      <span className="item-label">Egresos</span>
                    </div>
                    <span className="item-value">
                      {loading ? <FiLoader className="spin-icon" /> : `S/. ${record.expense.toFixed(2)}`}
                    </span>
                  </div>

                  <div className="data-item sales-item">
                    <div className="item-header">
                      <FiShoppingBag className="item-icon blue" />
                      <span className="item-label">Venta de Productos</span>
                    </div>
                    <span className="item-value">
                      {loading ? <FiLoader className="spin-icon" /> : `S/. ${record.productSales.toFixed(2)}`}
                    </span>
                  </div>

                  <div className="data-item notes-item">
                    <div className="item-header">
                      <FiFileText className="item-icon grey" />
                      <span className="item-label">Notas</span>
                    </div>
                    <p className="item-text-notes">
                      {loading ? <FiLoader className="spin-icon grey" /> : (record.notes || 'Sin notas registradas')}
                    </p>
                  </div>
                </div>

                <div className="record-metadata">
                  <span>Creado: {new Date(record.createdAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })} ({new Date(record.createdAt).toLocaleDateString('es-PE')})</span>
                  {record.updatedAt !== record.createdAt && (
                    <span> | Act.: {new Date(record.updatedAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</span>
                  )}
                </div>

                <button
                  type="button"
                  className="btn btn-primary btn-block btn-edit"
                  onClick={() => setIsEditing(true)}
                >
                  <FiEdit className="btn-icon-inline" /> Editar Turno
                </button>
              </div>
            )
          })()
        ) : (
          /* Edit Mode */
          (() => {
            const currentTotal = (parseFloat(income) || 0) + (parseFloat(productSales) || 0) - (parseFloat(expense) || 0)
            return (
              <form onSubmit={handleSave} className="shift-form">
                <div className="shift-total-header-group">
                  <button
                    type="button"
                    className="day-nav-btn"
                    onClick={() => onNavigateDate?.('prev')}
                    aria-label="Día anterior"
                  >
                    <FiChevronLeft />
                  </button>

                  <div className="shift-day-display">
                    <div className="shift-day-header">
                      <span className="shift-day-title">{getFormattedDay(selectedDate)}</span>
                    </div>

                    <div className="shift-total-summary edit-preview">
                      <div className="total-info">
                        <span className="total-label">Total</span>
                        <span className={`total-value ${currentTotal >= 0 ? 'positive' : 'negative'}`}>
                          {loading ? (
                            <FiLoader className="spin-icon" />
                          ) : (
                            `S/. ${currentTotal.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="day-nav-btn"
                    onClick={() => onNavigateDate?.('next')}
                    aria-label="Siguiente día"
                  >
                    <FiChevronRight />
                  </button>
                </div>

                <div className="shift-form-grid">
                  <div className="form-group grid-income">
                    <label htmlFor="shift-income">
                      <FiTrendingUp className="label-icon green" /> Ingresos
                    </label>
                    <div className="input-with-symbol">
                      <span className="currency-prefix">S/.</span>
                      <input
                        id="shift-income"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={income}
                        onChange={e => setIncome(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group grid-expense">
                    <label htmlFor="shift-expense">
                      <FiTrendingDown className="label-icon red" /> Egresos
                    </label>
                    <div className="input-with-symbol">
                      <span className="currency-prefix">S/.</span>
                      <input
                        id="shift-expense"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={expense}
                        onChange={e => setExpense(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="form-group grid-sales">
                    <label htmlFor="shift-sales">
                      <FiShoppingBag className="label-icon blue" /> Venta de Productos
                    </label>
                    <div className="input-with-symbol">
                      <span className="currency-prefix">S/.</span>
                      <input
                        id="shift-sales"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={productSales}
                        onChange={e => setProductSales(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="shift-notes">
                    <FiFileText className="label-icon grey" /> Notas
                  </label>
                  <textarea
                    id="shift-notes"
                    placeholder="Escribe alguna nota o comentario..."
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="form-actions">
                  {record && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleCancel}
                    >
                      <FiX className="btn-icon-inline" /> Cancelar
                    </button>
                  )}
                  <button type="submit" className="btn btn-primary btn-grow">
                    <FiSave className="btn-icon-inline" /> Guardar
                  </button>
                </div>
              </form>
            )
          })()
        )}
      </div>
    </div>
  )
}
