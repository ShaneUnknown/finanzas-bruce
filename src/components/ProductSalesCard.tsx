import React from 'react'
import { FiLoader } from 'react-icons/fi'
import './ProductSalesCard.css'

interface ProductSalesCardProps {
  totalSales: number
  loading?: boolean
}

export const ProductSalesCard: React.FC<ProductSalesCardProps> = ({
  totalSales,
  loading = false,
}) => {
  return (
    <div className="product-sales-card">
      <div className="product-sales-title-group">
        <span className="title-primary">Venta de</span>
        <span className="title-secondary">Productos</span>
      </div>
      <span className="product-sales-total-text">
        {loading ? (
          <FiLoader className="spin-icon" />
        ) : (
          `S/. ${totalSales.toLocaleString('es-PE', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`
        )}
      </span>
    </div>
  )
}
