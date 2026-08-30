import { FiLoader } from 'react-icons/fi'
import './ProductSalesCard.css'

const formatMoney = (total: number) => 'S/. ' + total.toLocaleString('es-PE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function MonthlyExpenseTotalCard({ total, loading = false }: { total: number; loading?: boolean }) {
  return <div className="product-sales-card monthly-total-card"><div className="product-sales-title-group"><span className="title-primary">Gasto</span><span className="title-secondary">Mensual</span></div><span className="product-sales-total-text monthly-expense-total">{loading ? <FiLoader className="spin-icon" /> : formatMoney(total)}</span></div>
}

export function MonthlyBalanceCard({ total, loading = false }: { total: number; loading?: boolean }) {
  const balanceClass = total < 0 ? 'monthly-balance-negative' : 'monthly-balance-positive'
  return <div className="product-sales-card monthly-balance-card"><div className="product-sales-title-group"><span className="title-primary">Balance</span><span className="title-secondary">Mensual</span></div><span className={'product-sales-total-text ' + balanceClass}>{loading ? <FiLoader className="spin-icon" /> : formatMoney(total)}</span></div>
}
