interface LowStockAlertData {
  productName: string
  currentStock: number
  minAlert: number
  userEmail?: string
}

export const sendLowStockAlert = async (alertData: LowStockAlertData) => {
  try {
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(alertData),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Failed to send low stock alert')
    }

    const result = await response.json()
    console.log('Low stock alert sent successfully:', result)
    return result
  } catch (error) {
    console.error('Error sending low stock alert:', error)
    throw error
  }
}

export const checkAndSendLowStockAlerts = async (
  products: Array<{
    id: string
    name: string
    stocks: number
    min_alert: number
  }>,
  userEmail?: string
) => {
  const lowStockProducts = products.filter(
    product => product.stocks <= product.min_alert
  )

  const alertPromises = lowStockProducts.map(product =>
    sendLowStockAlert({
      productName: product.name,
      currentStock: product.stocks,
      minAlert: product.min_alert,
      userEmail,
    })
  )

  try {
    const results = await Promise.allSettled(alertPromises)
    const successful = results.filter(result => result.status === 'fulfilled').length
    const failed = results.filter(result => result.status === 'rejected').length

    console.log(`Alert summary: ${successful} sent, ${failed} failed`)
    
    return {
      total: lowStockProducts.length,
      successful,
      failed,
      products: lowStockProducts.map(p => p.name)
    }
  } catch (error) {
    console.error('Error in batch alert sending:', error)
    throw error
  }
}
