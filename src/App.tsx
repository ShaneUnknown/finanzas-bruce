import { useState, useEffect, useRef } from 'react'
import { FiSun, FiMoon, FiUploadCloud, FiDownloadCloud, FiX } from 'react-icons/fi'
import { Swiper, SwiperSlide } from 'swiper/react'

import { DateSelector } from './components/DateSelector'
import { ProductSalesCard } from './components/ProductSalesCard'
import { CalendarGrid } from './components/CalendarGrid'
import { ShiftManager, type FinanceTab } from './components/ShiftManager'
import { db, getBalance, getExpenseTotal, getProductSales, normalizeRecord, sumEntries, type DailyRecord } from './db/financeDB'
import { useBackDismiss } from './hooks/useBackDismiss'
import 'swiper/css'
import './App.css'

function App() {
  const [isMobile, setIsMobile] = useState(false)
  const pointerStart = useRef<{ x: number; y: number } | null>(null)
  const committedSlideIndex = useRef(0)

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    pointerStart.current = { x: event.clientX, y: event.clientY }
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = pointerStart.current
    pointerStart.current = null
    if (!start) return

    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y)
    if (moved > 8) return

    const target = event.target as HTMLElement
    if (target.closest('input, textarea, select')) return

    const activeElement = document.activeElement
    if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement || activeElement instanceof HTMLSelectElement) {
      activeElement.blur()
    }
  }

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 900)
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Theme Management
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme')
      if (saved === 'light' || saved === 'dark') return saved
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    return 'light'
  })

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
      root.classList.remove('light')
    } else {
      root.classList.add('light')
      root.classList.remove('dark')
    }
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'))
  }

  // Backup / Restore States
  const [lastExportTime, setLastExportTime] = useState<string | null>(() => localStorage.getItem('last_export_time'))
  const [hasImported, setHasImported] = useState<boolean>(() => localStorage.getItem('has_imported') === 'true')
  const [showExportModal, setShowExportModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)

  useBackDismiss(showExportModal, () => setShowExportModal(false))
  useBackDismiss(showImportModal, () => setShowImportModal(false))

  // Visibility constraints
  const isExportVisible = !lastExportTime || (Date.now() - parseInt(lastExportTime, 10)) > 24 * 60 * 60 * 1000
  const isImportVisible = !hasImported

  // Date Navigation State
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth())
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())
  const [selectedDay, setSelectedDay] = useState<number | null>(() => new Date().getDate())
  const [activeFinanceTab, setActiveFinanceTab] = useState<FinanceTab>('income')

  // Monthly Records State for display totals
  const [monthlyRecords, setMonthlyRecords] = useState<DailyRecord[]>([])
  const [updateTrigger, setUpdateTrigger] = useState(0)
  const [loadingMonthly, setLoadingMonthly] = useState(false)

  // Fetch monthly records when month/year changes or when saved
  useEffect(() => {
    const loadMonthlyRecords = async () => {
      setLoadingMonthly(true)
      try {
        const formattedMonth = (currentMonth + 1).toString().padStart(2, '0')
        const prefix = `${currentYear}-${formattedMonth}`
        const records = await db.dailyRecords
          .where('date')
          .startsWith(prefix)
          .toArray()
        setMonthlyRecords(records)
      } catch (e) {
        console.error('Error cargando registros mensuales:', e)
      } finally {
        setLoadingMonthly(false)
      }
    }
    loadMonthlyRecords()
  }, [currentMonth, currentYear, updateTrigger])

  // Calculate totals
  const monthTotal = monthlyRecords.reduce((acc, curr) => {
    return acc + getBalance(curr)
  }, 0)

  const monthProductSalesTotal = monthlyRecords.reduce((acc, curr) => {
    return acc + getProductSales(curr)
  }, 0)

  const monthDailyExpensesTotal = monthlyRecords.reduce((total, record) => {
    const dailyItems = record.expenseItems?.filter(item => item.group === 'daily') ?? []
    return total + sumEntries(dailyItems)
  }, 0)

  const monthExpensesTotal = monthlyRecords.reduce((total, record) => {
    return total + getExpenseTotal(record)
  }, 0)

  // Compute selectedDate formatted as YYYY-MM-DD
  const selectedDateStr = selectedDay !== null
    ? `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${selectedDay.toString().padStart(2, '0')}`
    : null

  // Calculate totals for the selected day (morning shift, afternoon shift, and combined)
  const selectedDateRecords = selectedDateStr
    ? monthlyRecords.filter(rec => rec.date === selectedDateStr)
    : []

  const morningRec = selectedDateRecords.find(rec => rec.shift === 'morning')
  const afternoonRec = selectedDateRecords.find(rec => rec.shift === 'afternoon')

  const selectedDayMorningTotal = morningRec
    ? getBalance(morningRec)
    : 0

  const selectedDayAfternoonTotal = afternoonRec
    ? getBalance(afternoonRec)
    : 0

  const selectedDayTotal = selectedDayMorningTotal + selectedDayAfternoonTotal

  const handleNavigateDate = (direction: 'prev' | 'next') => {
    if (!selectedDateStr || selectedDay === null) return
    const currentDate = new Date(currentYear, currentMonth, selectedDay)
    if (direction === 'prev') {
      currentDate.setDate(currentDate.getDate() - 1)
    } else {
      currentDate.setDate(currentDate.getDate() + 1)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      if (currentDate > today) return
    }
    setCurrentYear(currentDate.getFullYear())
    setCurrentMonth(currentDate.getMonth())
    setSelectedDay(currentDate.getDate())
  }

  const handleExportBackup = async () => {
    try {
      const records = await db.dailyRecords.toArray()
      const dataStr = JSON.stringify({ format: 'finanzas-backup', version: 2, exportedAt: new Date().toISOString(), records }, null, 2)
      const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr)

      const exportFileDefaultName = `respaldo_finanzas_${new Date().toISOString().slice(0, 10)}.json`

      const linkElement = document.createElement('a')
      linkElement.setAttribute('href', dataUri)
      linkElement.setAttribute('download', exportFileDefaultName)
      linkElement.click()

      // Save timestamp in localStorage and state
      const now = Date.now().toString()
      localStorage.setItem('last_export_time', now)
      setLastExportTime(now)
      setShowExportModal(false)
    } catch (error) {
      console.error('Error al exportar copia de seguridad:', error)
      alert('Hubo un error al exportar la copia de seguridad.')
    }
  }

  const handleImportBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string
        const parsed: unknown = JSON.parse(content)
        const rawRecords = Array.isArray(parsed)
          ? parsed
          : parsed && typeof parsed === 'object' && Array.isArray((parsed as { records?: unknown }).records)
            ? (parsed as { records: unknown[] }).records
            : null

        if (!rawRecords) throw new Error('El archivo de copia de seguridad no es válido.')

        const records = rawRecords.map(raw => {
          if (!raw || typeof raw !== 'object') throw new Error('El archivo contiene registros inválidos.')
          const rec = raw as Partial<DailyRecord>
          if (!rec.id || !rec.date || (rec.shift !== 'morning' && rec.shift !== 'afternoon')) {
            throw new Error('El archivo contiene registros inválidos.')
          }
          return normalizeRecord(rec as Partial<DailyRecord> & Pick<DailyRecord, 'id' | 'date' | 'shift'>)
        })

        await db.transaction('rw', db.dailyRecords, async () => {
          await db.dailyRecords.bulkPut(records)
        })

        // Save status in localStorage and state
        localStorage.setItem('has_imported', 'true')
        setHasImported(true)
        setShowImportModal(false)

        // Refresh UI
        setUpdateTrigger(prev => prev + 1)
        alert('¡Copia de seguridad importada con éxito!')
      } catch (err) {
        console.error('Error al importar copia de seguridad:', err)
        alert('Error: El archivo seleccionado no contiene un formato de respaldo válido.')
      }
    }
    reader.readAsText(file)
  }
  return (
    <div className="dashboard-container" onPointerDown={handlePointerDown} onPointerUp={handlePointerUp}>
      <header className="dashboard-header">
        <div className="header-top">
          <div className="title-area">
            <h1>Gestión de Finanzas</h1>
          </div>
          <div className="header-actions">
            {isImportVisible && (
              <button 
                type="button" 
                className="header-action-btn import-btn" 
                onClick={() => setShowImportModal(true)} 
                title="Restaurar Copia de Seguridad"
              >
                <FiUploadCloud />
              </button>
            )}
            {isExportVisible && (
              <button 
                type="button" 
                className="header-action-btn export-btn" 
                onClick={() => setShowExportModal(true)} 
                title="Crear Copia de Seguridad"
              >
                <FiDownloadCloud />
              </button>
            )}
            <button 
              type="button" 
              className="theme-toggle-btn" 
              onClick={toggleTheme} 
              aria-label="Cambiar tema"
            >
              {theme === 'light' ? <FiMoon className="theme-icon" /> : <FiSun className="theme-icon" />}
            </button>
          </div>
        </div>
      </header>

      {/* Sticky Date Navigation Selector */}
      <section className="navigator-section">
        <DateSelector 
          currentMonth={currentMonth}
          currentYear={currentYear}
          monthTotal={monthTotal}
          onChange={(month, year) => {
            setCurrentMonth(month)
            setCurrentYear(year)
            // Default to today's day if navigating to current system month, else default to 1st
            const today = new Date()
            if (today.getMonth() === month && today.getFullYear() === year) {
              setSelectedDay(today.getDate())
            } else {
              setSelectedDay(1)
            }
          }}
        />
      </section>

      {/* Total Product Sales of the Month Card */}
      <section className="product-sales-section">
        <ProductSalesCard 
          totalSales={monthProductSalesTotal} 
          totalDailyExpenses={monthDailyExpensesTotal}
          totalMonthlyExpenses={monthExpensesTotal}
          loading={loadingMonthly} 
        />
      </section>


      <main className="dashboard-content">
        {isMobile ? (
          <Swiper
            spaceBetween={16}
            slidesPerView={1}
            className="mobile-swiper"
            touchStartPreventDefault={false}
            touchStartForcePreventDefault={false}
            noSwiping
            noSwipingSelector="input, textarea, select, [contenteditable='true']"
            focusableElements=".swiper-focus-guard"
            onSlideChangeTransitionEnd={swiper => {
              if (swiper.activeIndex === committedSlideIndex.current) return
              committedSlideIndex.current = swiper.activeIndex

              const activeElement = document.activeElement
              if (
                activeElement instanceof HTMLInputElement ||
                activeElement instanceof HTMLTextAreaElement ||
                activeElement instanceof HTMLSelectElement
              ) {
                activeElement.blur()
              }
            }}
          >
            <SwiperSlide>
              <div className="slide-content-wrapper">
                <CalendarGrid 
                  currentMonth={currentMonth}
                  currentYear={currentYear}
                  selectedDay={selectedDay}
                  selectedDayMorningTotal={selectedDayMorningTotal}
                  selectedDayAfternoonTotal={selectedDayAfternoonTotal}
                  selectedDayTotal={selectedDayTotal}
                  onSelectDay={(day) => setSelectedDay(day)}
                  loading={loadingMonthly}
                />
              </div>
            </SwiperSlide>
            <SwiperSlide>
              <div className="slide-content-wrapper">
                <ShiftManager 
                  activeFinanceTab={activeFinanceTab}
                  onFinanceTabChange={setActiveFinanceTab}
                  selectedDate={selectedDateStr} 
                  onRecordSaved={() => setUpdateTrigger(prev => prev + 1)}
                  onNavigateDate={handleNavigateDate}
                />
              </div>
            </SwiperSlide>
          </Swiper>
        ) : (
          <>
            <CalendarGrid 
              currentMonth={currentMonth}
              currentYear={currentYear}
              selectedDay={selectedDay}
              selectedDayMorningTotal={selectedDayMorningTotal}
              selectedDayAfternoonTotal={selectedDayAfternoonTotal}
              selectedDayTotal={selectedDayTotal}
              onSelectDay={(day) => setSelectedDay(day)}
              loading={loadingMonthly}
            />

            {/* Shift Manager for morning/afternoon entries */}
            <ShiftManager 
              activeFinanceTab={activeFinanceTab}
              onFinanceTabChange={setActiveFinanceTab}
              selectedDate={selectedDateStr} 
              onRecordSaved={() => setUpdateTrigger(prev => prev + 1)}
              onNavigateDate={handleNavigateDate}
            />
          </>
        )}
      </main>

      {/* Export / Backup Modal */}
      {showExportModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Crear Copia de Seguridad</h3>
              <button className="modal-close-btn" onClick={() => setShowExportModal(false)}>
                <FiX />
              </button>
            </div>
            <div className="modal-body">
              <p>Recomendamos respaldar tu información para evitar pérdidas si borras el historial o si desinstalas el navegador.</p>
              <p className="modal-warning">
                Descargarás un archivo en formato <strong>.json</strong> que contiene todos tus registros financieros.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowExportModal(false)}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={handleExportBackup}>
                Descargar Respaldo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import / Restore Modal */}
      {showImportModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Restaurar Copia de Seguridad</h3>
              <button className="modal-close-btn" onClick={() => setShowImportModal(false)}>
                <FiX />
              </button>
            </div>
            <div className="modal-body">
              <p>Selecciona tu archivo de respaldo <strong>.json</strong> guardado anteriormente para restaurar tu historial financiero completo.</p>
              <div className="import-file-area">
                <input 
                  type="file" 
                  id="import-file-input" 
                  accept=".json" 
                  onChange={handleImportBackup} 
                  style={{ display: 'none' }}
                />
                <button 
                  className="btn btn-primary btn-block" 
                  onClick={() => document.getElementById('import-file-input')?.click()}
                >
                  Seleccionar Archivo .json
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App





