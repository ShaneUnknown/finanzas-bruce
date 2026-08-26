import React from 'react'
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi'
import './DateSelector.css'

interface DateSelectorProps {
  currentMonth: number // 0-11
  currentYear: number
  monthTotal: number
  onChange: (month: number, year: number) => void
}

const MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

export const DateSelector: React.FC<DateSelectorProps> = ({
  currentMonth,
  currentYear,
  monthTotal,
  onChange,
}) => {
  const today = new Date()
  const isLastMonth =
    currentYear > today.getFullYear() ||
    (currentYear === today.getFullYear() && currentMonth >= today.getMonth())

  const handlePrev = () => {
    if (currentMonth === 0) {
      onChange(11, currentYear - 1)
    } else {
      onChange(currentMonth - 1, currentYear)
    }
  }

  const handleNext = () => {
    if (isLastMonth) return
    if (currentMonth === 11) {
      onChange(0, currentYear + 1)
    } else {
      onChange(currentMonth + 1, currentYear)
    }
  }

  return (
    <div className="date-selector">
      <button
        type="button"
        className="nav-btn prev-btn"
        onClick={handlePrev}
        aria-label="Mes anterior"
      >
        <FiChevronLeft className="nav-icon" />
      </button>

      <div className="date-display">
        <div className="month-year-group">
          <span className="month-name">{MONTHS[currentMonth]}</span>
          <span className="year-number">{currentYear}</span>
        </div>
        <span className="month-total-text">
          S/. {monthTotal.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>

      {!isLastMonth ? (
        <button
          type="button"
          className="nav-btn next-btn"
          onClick={handleNext}
          aria-label="Siguiente mes"
        >
          <FiChevronRight className="nav-icon" />
        </button>
      ) : <span className="nav-btn-placeholder" aria-hidden="true" />}
    </div>
  )
}
