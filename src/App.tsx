import { useState, useEffect } from 'react'
import { FiSun, FiMoon, FiUploadCloud, FiDownloadCloud, FiX } from 'react-icons/fi'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Pagination } from 'swiper/modules'
import { DateSelector } from './components/DateSelector'
import { CalendarGrid } from './components/CalendarGrid'
import { ShiftManager } from './components/ShiftManager'
import { db, type DailyRecord } from './db/financeDB'
import 'swiper/css'
import 'swiper/css/pagination'
import './App.css'

function App() {
  const [isMobile, setIsMobile] = useState(false)

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

  // Visibility constraints
  const isExportVisible = !lastExportTime || (Date.now() - parseInt(lastExportTime, 10)) > 24 * 60 * 60 * 1000
  const isImportVisible = !hasImported

  // Date Navigation State
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth())
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())
  const [selectedDay, setSelectedDay] = useState<number | null>(() => new Date().getDate())

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
    return acc + (curr.income + curr.productSales - curr.expense)
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
    ? morningRec.income + morningRec.productSales - morningRec.expense
    : 0

  const selectedDayAfternoonTotal = afternoonRec
    ? afternoonRec.income + afternoonRec.productSales - afternoonRec.expense
    : 0

  const selectedDayTotal = selectedDayMorningTotal + selectedDayAfternoonTotal

  const handleNavigateDate = (direction: 'prev' | 'next') => {
    if (!selectedDateStr || selectedDay === null) return
    const currentDate = new Date(currentYear, currentMonth, selectedDay)
    if (direction === 'prev') {
      currentDate.setDate(currentDate.getDate() - 1)
    } else {
      currentDate.setDate(currentDate.getDate() + 1)
    }
    setCurrentYear(currentDate.getFullYear())
    setCurrentMonth(currentDate.getMonth())
    setSelectedDay(currentDate.getDate())
  }

  const handleExportBackup = async () => {
    try {
      const records = await db.dailyRecords.toArray()
      const dataStr = JSON.stringify(records, null, 2)
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
        const records = JSON.parse(content) as DailyRecord[]

        if (!Array.isArray(records)) {
          throw new Error('El archivo de copia de seguridad no es válido.')
        }

        // Validate basic properties
        for (const rec of records) {
          if (!rec.id || !rec.date || !rec.shift || rec.income === undefined || rec.expense === undefined || rec.productSales === undefined) {
            throw new Error('El archivo contiene registros inválidos.')
          }
        }

        // Restore in Dexie
        await db.dailyRecords.bulkPut(records)

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
    <div className="dashboard-container">
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

      <main className="dashboard-content">
        {isMobile ? (
          <Swiper
            modules={[Pagination]}
            pagination={{ clickable: true }}
            spaceBetween={16}
            slidesPerView={1}
            className="mobile-swiper"
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





