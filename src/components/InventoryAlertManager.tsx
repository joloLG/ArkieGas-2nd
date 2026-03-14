'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { checkAndSendLowStockAlerts } from '@/lib/inventory-alerts'

interface Product {
  id: string
  name: string
  stocks: number
  min_alert: number
}

interface AlertResult {
  total: number
  successful: number
  failed: number
  products: string[]
}

export const InventoryAlertManager: React.FC<{
  products: Product[]
  userEmail?: string
}> = ({ products, userEmail }) => {
  const [isProcessing, setIsProcessing] = useState(false)
  const [lastResult, setLastResult] = useState<AlertResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const processLowStockAlerts = useCallback(async () => {
    setIsProcessing(true)
    setError(null)
    
    try {
      const result = await checkAndSendLowStockAlerts(products, userEmail)
      setLastResult(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send alerts')
    } finally {
      setIsProcessing(false)
    }
  }, [products, userEmail])

  // Automatically check for low stock when products change
  useEffect(() => {
    const lowStockProducts = products.filter(p => p.stocks <= p.min_alert)
    if (lowStockProducts.length > 0) {
      processLowStockAlerts()
    }
  }, [products, userEmail, processLowStockAlerts])

  const lowStockCount = products.filter(p => p.stocks <= p.min_alert).length

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">
          📧 Automatic Email Notifications
        </h3>
        <div className="flex items-center gap-2">
          {lowStockCount > 0 && (
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              isProcessing 
                ? 'bg-yellow-100 text-yellow-800' 
                : 'bg-red-100 text-red-800'
            }`}>
              {isProcessing ? 'Sending...' : `${lowStockCount} Low Stock Items`}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md mb-4">
          <p className="font-medium">❌ Email Error:</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {lastResult && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md mb-4">
          <p className="font-medium">✅ Email Notifications Sent:</p>
          <p className="text-sm">
            {lastResult.successful} of {lastResult.total} alerts sent successfully
          </p>
          {lastResult.products.length > 0 && (
            <p className="text-sm mt-1">
              Products: {lastResult.products.join(', ')}
            </p>
          )}
        </div>
      )}

      {lowStockCount === 0 ? (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md">
          <p className="text-sm">✅ All products have sufficient stock levels</p>
        </div>
      ) : isProcessing ? (
        <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-md">
          <p className="text-sm">🔄 Automatically sending email notifications for low stock items...</p>
        </div>
      ) : (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded-md">
          <p className="text-sm">⚠️ Email notifications have been sent for {lowStockCount} low stock items</p>
        </div>
      )}
    </div>
  )
}
