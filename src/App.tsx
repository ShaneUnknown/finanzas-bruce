import { useState, useEffect } from 'react'
import { FiSun, FiMoon, FiUploadCloud, FiDownloadCloud, FiX, FiLogOut } from 'react-icons/fi'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Pagination } from 'swiper/modules'
import { DateSelector } from './components/DateSelector'
import { ProductSalesCard } from './components/ProductSalesCard'
import { MonthlyExpenseTotalCard } from './components/MonthlyExpenseTotalCard'
import { MonthlyExpenseFormPage, MonthlyExpensesPage } from './components/MonthlyExpensesPage'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { CalendarGrid } from './components/CalendarGrid'
import { ShiftManager } from './components/ShiftManager'
import { db, type DailyRecord, type MonthlyExpense } from './db/financeDB'
import { useAuth } from './auth/useAuth'
import { WelcomePage } from './components/WelcomePage'
import { ref, uploadBytes } from 'firebase/storage'
import { storage } from './firebase'
import 'swiper/css'
import 'swiper/css/pagination'
import './App.css'

function Dashboard() {
  const { logOut, user } = useAuth()
  const location = useLocation()
  const returnedMonth = typeof location.state?.month === 'string' && /^\d{4}-\d{2}$/.test(location.state.month)
    ? location.state.month
    : null
  const initialDate = returnedMonth ? new Date(Number(returnedMonth.slice(0, 4)), Number(returnedMonth.slice(5, 7)) - 1, 1) : new Date()
  const savedSlideValue = sessionStorage.getItem('finance-swiper-slide')
  const savedSlide = savedSlideValue === null ? Number.NaN : Number(savedSlideValue)
  const initialSwiperSlide = Number.isInteger(savedSlide) && savedSlide >= 0 && savedSlide <= 2 ? savedSlide : 1
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
  const [lastBackupTime, setLastBackupTime] = useState<string | null>(() => localStorage.getItem('last_cloud_backup_time'))
  const [hasImported, setHasImported] = useState<boolean>(() => localStorage.getItem('has_imported') === 'true')
  const [showExportModal, setShowExportModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [backupUploading, setBackupUploading] = useState(false)
  const [backupError, setBackupError] = useState<string | null>(null)

  // Visibility constraints
  const isExportVisible = !lastBackupTime || (Date.now() - parseInt(lastBackupTime, 10)) > 7 * 24 * 60 * 60 * 1000
  const isImportVisible = !hasImported

  useEffect(() => { if (isExportVisible) setShowExportModal(true) }, [isExportVisible])

  // Date Navigation State
  const [currentMonth, setCurrentMonth] = useState(initialDate.getMonth())
  const [currentYear, setCurrentYear] = useState(initialDate.getFullYear())
  const [selectedDay, setSelectedDay] = useState<number | null>(() => new Date().getDate())

  // Monthly Records State for display totals
  const [monthlyRecords, setMonthlyRecords] = useState<DailyRecord[]>([])
  const [updateTrigger, setUpdateTrigger] = useState(0)
  const [loadingMonthly, setLoadingMonthly] = useState(false)
  const [monthlyExpenses, setMonthlyExpenses] = useState<MonthlyExpense[]>([])

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

  const monthKey = currentYear + '-' + (currentMonth + 1).toString().padStart(2, '0')

  useEffect(() => {
    const loadMonthlyExpenses = async () => {
      try { setMonthlyExpenses(await db.monthlyExpenses.where('month').equals(monthKey).toArray()) }
      catch (error) { console.error('Error cargando gastos mensuales:', error) }
    }
    void loadMonthlyExpenses()
  }, [monthKey, updateTrigger])

  // Calculate totals
  const monthTotal = monthlyRecords.reduce((acc, curr) => {
    return acc + (curr.income + curr.productSales - curr.expense)
  }, 0)

  const monthProductSalesTotal = monthlyRecords.reduce((acc, curr) => {
    return acc + (curr.productSales || 0)
  }, 0)

  const monthlyExpenseTotal = monthlyExpenses.reduce((total, expense) => total + expense.amount, 0)

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

  const createBackup = async () => {
    const [dailyRecords, storedMonthlyExpenses] = await Promise.all([
      db.dailyRecords.toArray(),
      db.monthlyExpenses.toArray(),
    ])
    const now = new Date()
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
    return {
      fileName: 'respaldo_finanzas_' + timestamp + '.json',
      json: JSON.stringify({
        schemaVersion: 2,
        exportedAt: now.toISOString(),
        dailyRecords,
        monthlyExpenses: storedMonthlyExpenses,
      }, null, 2),
    }
  }

  const handleDownloadBackup = async () => {
    try {
      const backup = await createBackup()
      const url = URL.createObjectURL(new Blob([backup.json], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = backup.fileName
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error al descargar copia de seguridad:', error)
      setBackupError('No se pudo generar la copia de seguridad.')
    }
  }

  const handleCloudBackup = async () => {
    if (!user) return
    setBackupUploading(true)
    setBackupError(null)
    try {
      const backup = await createBackup()
      const backupRef = ref(storage, 'finanzas-backups/' + user.uid + '/' + backup.fileName)
      await uploadBytes(backupRef, new Blob([backup.json], { type: 'application/json' }), {
        contentType: 'application/json',
        customMetadata: { app: 'finanzas-bruce', schemaVersion: '2' },
      })
      const now = Date.now().toString()
      localStorage.setItem('last_cloud_backup_time', now)
      setLastBackupTime(now)
      setShowExportModal(false)
    } catch (error) {
      console.error('Error al subir copia de seguridad:', error)
      setBackupError('No se pudo subir el respaldo. Verifica que Firebase Storage esté habilitado e inténtalo otra vez.')
    } finally {
      setBackupUploading(false)
    }
  }

  const handleImportBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string
        const parsed = JSON.parse(content) as DailyRecord[] | { dailyRecords?: DailyRecord[]; monthlyExpenses?: MonthlyExpense[] }
        const records = Array.isArray(parsed) ? parsed : parsed.dailyRecords
        const restoredMonthlyExpenses = Array.isArray(parsed) ? [] : (parsed.monthlyExpenses ?? [])
        if (!Array.isArray(records)) throw new Error('El archivo de copia de seguridad no es válido.')

        // Validate basic properties
        for (const rec of records) {
          if (!rec.id || !rec.date || !rec.shift || rec.income === undefined || rec.expense === undefined || rec.productSales === undefined) {
            throw new Error('El archivo contiene registros inválidos.')
          }
        }

        // Restore in Dexie
        await db.transaction('rw', db.dailyRecords, db.monthlyExpenses, async () => {
          await db.dailyRecords.bulkPut(records)
          if (restoredMonthlyExpenses.length) await db.monthlyExpenses.bulkPut(restoredMonthlyExpenses)
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
            <button type="button" className="header-action-btn" onClick={() => void logOut()} title="Cerrar sesión" aria-label="Cerrar sesión">
              <FiLogOut />
            </button>
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
          loading={loadingMonthly} 
        />
      </section>
      <section className="product-sales-section monthly-total-section">
        <MonthlyExpenseTotalCard total={monthlyExpenseTotal} loading={loadingMonthly} />
      </section>

      <main className="dashboard-content">
        {isMobile ? (
          <Swiper
            modules={[Pagination]}
            pagination={{ clickable: true }}
            spaceBetween={16}
            slidesPerView={1}
            initialSlide={initialSwiperSlide}
            onSlideChange={swiper => sessionStorage.setItem('finance-swiper-slide', String(swiper.activeIndex))}
            className="mobile-swiper"
          >
            <SwiperSlide>
              <div className="slide-content-wrapper">
                <MonthlyExpensesPage month={monthKey} />
              </div>
            </SwiperSlide>
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
            <MonthlyExpensesPage month={monthKey} />
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
              <h3>Respaldo semanal</h3>
              <button className="modal-close-btn" onClick={() => setShowExportModal(false)}>
                <FiX />
              </button>
            </div>
            <div className="modal-body">
              <p>Guarda en Firebase Storage una copia JSON de los turnos y gastos mensuales de este dispositivo.</p>
              <p className="modal-warning">El recordatorio volverá a mostrarse una semana después de una subida exitosa.</p>
              {backupError && <p className="backup-error" role="alert">{backupError}</p>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => void handleDownloadBackup()} disabled={backupUploading}>Descargar JSON</button>
              <button className="btn btn-primary" onClick={() => void handleCloudBackup()} disabled={backupUploading}>{backupUploading ? 'Subiendo…' : 'Subir respaldo'}</button>
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

function App() {
  const { user, loading } = useAuth()
  if (loading) return <main className="auth-loading"><span className="auth-loading-spinner" /><p>Verificando acceso…</p></main>
  if (!user) return <WelcomePage />
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/expenses/new/:expenseType/:month" element={<MonthlyExpenseFormPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App





