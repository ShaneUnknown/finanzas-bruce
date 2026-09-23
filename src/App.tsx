import { useState, useEffect, useRef } from 'react'
import { FiSun, FiMoon, FiUploadCloud, FiX, FiLogOut } from 'react-icons/fi'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Pagination } from 'swiper/modules'
import { DateSelector } from './components/DateSelector'
import { ProductSalesCard } from './components/ProductSalesCard'
import { MonthlyBalanceCard, MonthlyExpenseTotalCard } from './components/MonthlyExpenseTotalCard'
import { MonthlyExpenseFormPage, MonthlyExpenseManagerPage, MonthlyExpensesPage } from './components/MonthlyExpensesPage'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { CalendarGrid } from './components/CalendarGrid'
import { ShiftManager } from './components/ShiftManager'
import { db, type DailyRecord, type MonthlyExpense } from './db/financeDB'
import { useAuth } from './auth/useAuth'
import { WelcomePage } from './components/WelcomePage'
import { getBytes, getMetadata, listAll, ref, uploadBytes } from 'firebase/storage'
import { storage } from './firebase'
import { createBackup, restoreBackup, BACKUP_SCHEMA_VERSION } from './db/backup'
import 'swiper/css'
import 'swiper/css/pagination'
import './App.css'

const CLOUD_BACKUP_CHECK_INTERVAL = 24 * 60 * 60 * 1000

function backupErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
  const messages: Record<string, string> = {
    'backup/offline': 'No tienes conexión. Conéctate a internet e intenta subir el respaldo otra vez.',
    'storage/unauthenticated': 'Tu sesión ha caducado. Vuelve a iniciar sesión e intenta subir el respaldo.',
    'storage/unauthorized': 'Tu cuenta no tiene permiso para subir el respaldo. Revisa los permisos de Firebase Storage.',
    'storage/quota-exceeded': 'Se ha superado la cuota de Firebase Storage. Revisa el almacenamiento del proyecto.',
    'storage/retry-limit-exceeded': 'La subida agotó el tiempo de espera. Revisa tu conexión e inténtalo otra vez.',
    'storage/bucket-not-found': 'No se encontró el almacenamiento del proyecto. Revisa la configuración de Firebase Storage.',
    'storage/canceled': 'La subida del respaldo se canceló. Puedes intentarlo otra vez.',
  }
  return messages[code] ?? ('No se pudo subir el respaldo. Inténtalo otra vez.' + (code ? ' Código: ' + code + '.' : ''))
}

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
  const settledSwiperSlide = useRef(initialSwiperSlide)

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
  const [showExportModal, setShowExportModal] = useState(false)
  const [showLogoutModal, setShowLogoutModal] = useState(false)
  const closeLogoutDialog = () => setShowLogoutModal(false)
  const closeExportDialog = () => setShowExportModal(false)
  const [backupUploading, setBackupUploading] = useState(false)
  const [backupError, setBackupError] = useState<string | null>(null)
  const [backupSuccess, setBackupSuccess] = useState<string | null>(null)
  const backupCheckKey = 'cloud_backup_last_check_' + user?.uid
  const [autoRestoreFinished, setAutoRestoreFinished] = useState(false)
  const autoRestoreStarted = useRef(false)

  // Visibility constraints
  const isExportVisible = !lastBackupTime || (Date.now() - parseInt(lastBackupTime, 10)) > 7 * 24 * 60 * 60 * 1000

  useEffect(() => { if (autoRestoreFinished && isExportVisible && navigator.onLine) setShowExportModal(true) }, [autoRestoreFinished, isExportVisible])

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
  const monthlyBalanceTotal = monthTotal - monthlyExpenseTotal

  // Compute selectedDate formatted as YYYY-MM-DD
  const selectedDateStr = selectedDay !== null
    ? `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${selectedDay.toString().padStart(2, '0')}`
    : null

  const selectedDate = selectedDay !== null ? new Date(currentYear, currentMonth, selectedDay) : null
  const todayAtMidnight = new Date()
  todayAtMidnight.setHours(0, 0, 0, 0)
  const isFutureSelectedDate = selectedDate !== null && selectedDate > todayAtMidnight
  const canNavigateToNextDay = selectedDate !== null && selectedDate < todayAtMidnight

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
    if (direction === 'next' && !canNavigateToNextDay) return
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

  useEffect(() => {
    if (!user) return

    const restoreLatestCloudBackup = async () => {
      if (!navigator.onLine || autoRestoreStarted.current) {
        setAutoRestoreFinished(true)
        return
      }

      autoRestoreStarted.current = true
      try {
        const [dailyRecordCount, monthlyExpenseCount, storedFields] = await Promise.all([
          db.dailyRecords.count(),
          db.monthlyExpenses.count(),
          db.expenseFields.toArray(),
        ])
        const hasLocalData = dailyRecordCount > 0 || monthlyExpenseCount > 0
          || storedFields.some(field => field.id.startsWith('custom_') || !field.active)
        const lastCheck = Number(localStorage.getItem(backupCheckKey) ?? 0)

        // Si ya existen datos locales, Storage solo se consulta una vez al día.
        // Una instalación vacía siempre intenta recuperar su respaldo.
        if (hasLocalData && Date.now() - lastCheck < CLOUD_BACKUP_CHECK_INTERVAL) return

        const backups = await listAll(ref(storage, 'finanzas-backups/' + user.uid))
        const latestBackup = backups.items.sort((a, b) => b.name.localeCompare(a.name))[0]
        localStorage.setItem(backupCheckKey, Date.now().toString())
        if (!latestBackup) return
        const metadata = await getMetadata(latestBackup)
        const cloudBackupTime = new Date(metadata.timeCreated).getTime().toString()
        localStorage.setItem('last_cloud_backup_time', cloudBackupTime)
        setLastBackupTime(cloudBackupTime)
        if (hasLocalData) return
        const bytes = await getBytes(latestBackup, 10 * 1024 * 1024)
        await restoreBackup(db, new TextDecoder().decode(bytes))
        setUpdateTrigger(previous => previous + 1)
      } catch (error) {
        console.error('Error al restaurar el respaldo automático:', error)
      } finally {
        setAutoRestoreFinished(true)
      }
    }
    void restoreLatestCloudBackup()

    const retryWhenOnline = () => {
      autoRestoreStarted.current = false
      void restoreLatestCloudBackup()
    }
    window.addEventListener('online', retryWhenOnline)
    return () => window.removeEventListener('online', retryWhenOnline)
  }, [user, backupCheckKey])

  const handleCloudBackup = async () => {
    if (!user || backupUploading) return
    setBackupUploading(true)
    setBackupError(null)
    setBackupSuccess(null)
    try {
      if (!navigator.onLine) throw { code: 'backup/offline' }
      const backup = await createBackup(db)
      const backupRef = ref(storage, 'finanzas-backups/' + user.uid + '/' + backup.fileName)
      await uploadBytes(backupRef, new Blob([backup.json], { type: 'application/json' }), {
        contentType: 'application/json',
        customMetadata: { app: 'finanzas-bruce', schemaVersion: String(BACKUP_SCHEMA_VERSION) },
      })
      const now = Date.now().toString()
      setLastBackupTime(now)
      // El respaldo ya está en Firebase aunque falle guardar el recordatorio local.
      try { localStorage.setItem('last_cloud_backup_time', now) }
      catch (error) { console.error('No se pudo guardar la fecha del respaldo:', error) }
      setBackupSuccess('Respaldo subido correctamente a Firebase. Tus turnos, gastos mensuales y campos personalizados quedaron respaldados.')
      closeExportDialog()
    } catch (error) {
      console.error('Error al subir copia de seguridad:', error)
      setBackupError(backupErrorMessage(error))
      setShowExportModal(true)
    } finally {
      setBackupUploading(false)
    }
  }


  return (
    <div className="dashboard-container">
      {backupSuccess && (
        <div className="backup-success" role="status">
          <span>{backupSuccess}</span>
          <button type="button" onClick={() => setBackupSuccess(null)} aria-label="Cerrar confirmación del respaldo"><FiX /></button>
        </div>
      )}
      <header className="dashboard-header">
        <div className="header-top">
          <div className="title-area">
            <h1>Gestión de Finanzas</h1>
          </div>
          <div className="header-actions">
              <button
                type="button"
                className="header-action-btn"
                onClick={() => void handleCloudBackup()}
                title="Subir respaldo de hoy a Firebase"
                aria-label="Subir respaldo de hoy a Firebase"
                disabled={backupUploading}
              >
                <FiUploadCloud />
              </button>
            <button type="button" className="header-action-btn" onClick={() => setShowLogoutModal(true)} title="Cerrar sesión" aria-label="Cerrar sesión">
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
      {!isMobile && (
        <section className="product-sales-section monthly-total-section">
          <MonthlyExpenseTotalCard total={monthlyExpenseTotal} loading={loadingMonthly} />
          <MonthlyBalanceCard total={monthlyBalanceTotal} loading={loadingMonthly} />
        </section>
      )}

      <main className="dashboard-content">
        {isMobile ? (
          <Swiper
            modules={[Pagination]}
            pagination={{ clickable: true }}
            spaceBetween={16}
            slidesPerView={1}
            initialSlide={initialSwiperSlide}
            touchStartPreventDefault={false}
            focusableElements="select, option, button, video, label"
            onSlideChangeTransitionEnd={swiper => {
              if (swiper.activeIndex === settledSwiperSlide.current) return
              settledSwiperSlide.current = swiper.activeIndex
              sessionStorage.setItem("finance-swiper-slide", String(swiper.activeIndex))

              const activeElement = document.activeElement
              if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
                activeElement.blur()
              }
            }}
            className="mobile-swiper"
          >
            <SwiperSlide>
              <div className="slide-content-wrapper">
                {isFutureSelectedDate ? (
                  <div className="future-date-card">Aún no se puede mostrar datos de esta fecha.</div>
                ) : (<>
                  <section className="product-sales-section monthly-total-section">
                    <MonthlyExpenseTotalCard total={monthlyExpenseTotal} loading={loadingMonthly} />
                    <MonthlyBalanceCard total={monthlyBalanceTotal} loading={loadingMonthly} />
                  </section>
                  <MonthlyExpensesPage month={monthKey} />
                </>)}
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
                {isFutureSelectedDate ? (
                  <div className="future-date-card">Aún no se puede mostrar datos de esta fecha.</div>
                ) : (
                  <ShiftManager
                    selectedDate={selectedDateStr}
                    onRecordSaved={() => setUpdateTrigger(prev => prev + 1)}
                    onNavigateDate={handleNavigateDate}
                    canNavigateNext={canNavigateToNextDay}
                  />
                )}
              </div>
            </SwiperSlide>
          </Swiper>
        ) : (
          <>
            {isFutureSelectedDate
              ? <div className="future-date-card">Aún no se puede mostrar datos de esta fecha.</div>
              : <MonthlyExpensesPage month={monthKey} />}
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
            {isFutureSelectedDate ? (
              <div className="future-date-card">Aún no se puede mostrar datos de esta fecha.</div>
            ) : (
              <ShiftManager
                selectedDate={selectedDateStr}
                onRecordSaved={() => setUpdateTrigger(prev => prev + 1)}
                onNavigateDate={handleNavigateDate}
                canNavigateNext={canNavigateToNextDay}
              />
            )}
          </>
        )}
      </main>


      {showLogoutModal && (
        <div className="modal-overlay" role="presentation" onMouseDown={event => {
          if (event.target === event.currentTarget) closeLogoutDialog()
        }}>
          <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="logout-dialog-title">
            <div className="modal-header">
              <h3 id="logout-dialog-title">¿Cerrar sesión?</h3>
              <button type="button" className="modal-close-btn" onClick={closeLogoutDialog} aria-label="Cerrar">
                <FiX />
              </button>
            </div>
            <div className="modal-body">
              <p>¿Estás seguro de que deseas cerrar tu sesión?</p>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={closeLogoutDialog}>Cancelar</button>
              <button type="button" className="btn btn-danger" onClick={() => void logOut()}>Cerrar sesión</button>
            </div>
          </div>
        </div>
      )}

      {/* Export / Backup Modal */}
      {showExportModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Respaldo semanal</h3>
              <button className="modal-close-btn" onClick={closeExportDialog}>
                <FiX />
              </button>
            </div>
            <div className="modal-body">
              <p>Guarda en Firebase Storage una copia JSON de los turnos, gastos mensuales y campos personalizados de este dispositivo.</p>
              <p className="modal-warning">El recordatorio volverá a mostrarse una semana después de una subida exitosa.</p>
              {backupUploading && <p role="status">Subiendo respaldo a Firebase…</p>}
              {backupError && <p className="backup-error" role="alert">{backupError}</p>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => void handleCloudBackup()} disabled={backupUploading}>{backupUploading ? 'Subiendo…' : 'Subir respaldo'}</button>
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
      <Route path="/expenses/manage/:expenseType/:month" element={<MonthlyExpenseManagerPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App





