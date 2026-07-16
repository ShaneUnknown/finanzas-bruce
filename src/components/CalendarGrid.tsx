import React from 'react'
import { FiLoader } from 'react-icons/fi'
import './CalendarGrid.css'

interface CalendarGridProps {
  currentMonth: number
  currentYear: number
  selectedDay: number | null
  selectedDayMorningTotal: number
  selectedDayAfternoonTotal: number
  selectedDayTotal: number
  onSelectDay: (day: number | null) => void
  loading?: boolean
}

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export const CalendarGrid: React.FC<CalendarGridProps> = ({
  currentMonth,
  currentYear,
  selectedDay,
  selectedDayMorningTotal,
  selectedDayAfternoonTotal,
  selectedDayTotal,
  onSelectDay,
  loading
}) => {
  // Days in month
  const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate()

  // First day offset (0 = Sunday, 1 = Monday, etc.)
  const firstDayRaw = new Date(currentYear, currentMonth, 1).getDay()
  // Align so Monday is 0, Sunday is 6
  const firstDayOffset = firstDayRaw === 0 ? 6 : firstDayRaw - 1

  const daysArray: (number | null)[] = []

  // Padding for starting offset
  for (let i = 0; i < firstDayOffset; i++) {
    daysArray.push(null)
  }

  // Populate days
  for (let d = 1; d <= totalDays; d++) {
    daysArray.push(d)
  }

  return (
    <div className="calendar-card">
      <div className="calendar-weekdays">
        {WEEKDAYS.map(day => (
          <div key={day} className="weekday-header">
            {day}
          </div>
        ))}
      </div>

      <div className="calendar-days-grid">
        {daysArray.map((day, index) => {
          if (day === null) {
            return <div key={`empty-${index}`} className="calendar-day empty"></div>
          }

          const isSelected = selectedDay === day
          const isToday =
            new Date().getDate() === day &&
            new Date().getMonth() === currentMonth &&
            new Date().getFullYear() === currentYear

          return (
            <button
              key={`day-${day}`}
              type="button"
              className={`calendar-day-btn ${isSelected ? 'selected' : ''} ${
                isToday ? 'today' : ''
              }`}
              onClick={() => onSelectDay(isSelected ? null : day)} // Toggle selection
            >
              <span className="day-number">{day}</span>
            </button>
          )
        })}
      </div>

      {selectedDay !== null && (
        <>
          <hr className="calendar-card-divider" />
          <div className="calendar-day-details">
            <div className="shifts-row">
              <div className="detail-column">
                <span className="detail-label">Mañana</span>
                <span className="detail-value">
                  {loading ? <FiLoader className="spin-icon" /> : `S/. ${selectedDayMorningTotal.toFixed(2)}`}
                </span>
              </div>
              <div className="detail-column">
                <span className="detail-label">Tarde</span>
                <span className="detail-value">
                  {loading ? <FiLoader className="spin-icon" /> : `S/. ${selectedDayAfternoonTotal.toFixed(2)}`}
                </span>
              </div>
            </div>
            <div className="day-total-row highlight">
              <span className="detail-label">Total del Día</span>
              <span className={`detail-value ${selectedDayTotal >= 0 ? 'positive' : 'negative'}`}>
                {loading ? <FiLoader className="spin-icon" /> : `S/. ${selectedDayTotal.toFixed(2)}`}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
