import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FiLoader, FiX } from 'react-icons/fi'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Autoplay } from 'swiper/modules'
import type { Swiper as SwiperInstance } from 'swiper'
import { useBackDismiss } from '../hooks/useBackDismiss'
import './ProductSalesCard.css'

interface ProductSalesCardProps {
  totalSales: number
  totalDailyExpenses: number
  totalMonthlyExpenses: number
  loading?: boolean
}

const currency = (amount: number) =>
  `S/. ${amount.toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

export const ProductSalesCard: React.FC<ProductSalesCardProps> = ({
  totalSales,
  totalDailyExpenses,
  totalMonthlyExpenses,
  loading = false,
}) => {
  const [showSummary, setShowSummary] = useState(false)
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const swiperRef = useRef<SwiperInstance | null>(null)
  const didManualSwipeRef = useRef(false)

  useBackDismiss(showSummary, () => setShowSummary(false))

  const items = [
    { label: 'Venta de Productos', value: totalSales, tone: 'sales' },
    { label: 'Gastos Diarios', value: totalDailyExpenses, tone: 'expense' },
    { label: 'Egresos del Mes', value: totalMonthlyExpenses, tone: 'expense' },
  ]

  const stopForManualSwipe = () => {
    didManualSwipeRef.current = true
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current)
    swiperRef.current?.autoplay.stop()
  }

  const resumeAfterManualSwipe = () => {
    if (!didManualSwipeRef.current) return
    didManualSwipeRef.current = false
    resumeTimerRef.current = setTimeout(() => swiperRef.current?.autoplay.start(), 6000)
  }

  useEffect(() => () => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current)
  }, [])

  return (
    <>
      <Swiper
        modules={[Autoplay]}
        className="finance-summary-carousel"
        slidesPerView={1}
        spaceBetween={10}
        loop
        speed={500}
        autoplay={{ delay: 3000, disableOnInteraction: false }}
        onSwiper={swiper => { swiperRef.current = swiper }}
        onSliderFirstMove={stopForManualSwipe}
        onTouchEnd={resumeAfterManualSwipe}
      >
        {items.map(item => (
          <SwiperSlide key={item.label}>
            <button type="button" className="product-sales-card" onClick={() => setShowSummary(true)}>
              <span className="product-sales-title-group">{item.label}</span>
              <span className={`product-sales-total-text ${item.tone}`}>
                {loading ? <FiLoader className="spin-icon" /> : currency(item.value)}
              </span>
            </button>
          </SwiperSlide>
        ))}
      </Swiper>

      {showSummary && createPortal(
        <div className="modal-overlay" onClick={() => setShowSummary(false)}>
          <div className="modal-card finance-summary-dialog" role="dialog" aria-modal="true" aria-labelledby="finance-summary-title" onClick={event => event.stopPropagation()}>
            <div className="modal-header">
              <h3 id="finance-summary-title">Resumen del Mes</h3>
              <button type="button" className="modal-close-btn" onClick={() => setShowSummary(false)} aria-label="Cerrar"><FiX /></button>
            </div>
            <div className="modal-body finance-summary-list">
              {items.map(item => (
                <div className="finance-summary-row" key={item.label}>
                  <span>{item.label}</span>
                  <strong className={item.tone}>{loading ? 'Cargando…' : currency(item.value)}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
