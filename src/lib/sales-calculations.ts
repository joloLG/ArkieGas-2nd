// Advanced sales and profit calculation logic
// Handles complex scenarios with loans, overpayments, and proper profit tracking

export interface SalesTransaction {
  id: string
  customer_name: string
  product_id: string
  quantity: number
  selling_price: number
  base_price: number
  payment_method: 'cash' | 'full_loan' | 'partial_loan'
  payment_value: number
  remaining_balance: number
  excess_payment?: number
  date: string
  transaction_type: 'sale' | 'payment'
  products?: { name: string; base_price: number }
}

export interface LoanPayment {
  id: string
  loan_id: string
  customer_name: string
  payment_amount: number
  excess_amount: number
  date: string
}

/**
 * Calculate total sales - only counts actual sales, not loan payments
 * Loan payments are NOT sales - they're debt repayments
 */
export function calculateTotalSales(transactions: SalesTransaction[]): number {
  return transactions
    .filter(t => t.transaction_type === 'sale')
    .reduce((sum, transaction) => sum + transaction.payment_value, 0)
}

/**
 * Calculate total profit with proper logic
 * - Cash sales: profit = (selling_price - base_price) * quantity
 * - Loan sales: profit recognized only when loan is fully paid
 * - Overpayments: excess_amount added to both sales and profit
 */
export function calculateTotalProfit(
  transactions: SalesTransaction[], 
  loanPayments: LoanPayment[]
): number {
  let totalProfit = 0

  // Profit from cash sales (immediate recognition)
  const cashSales = transactions.filter(t => 
    t.transaction_type === 'sale' && t.payment_method === 'cash'
  )
  totalProfit += cashSales.reduce((sum, sale) => {
    const profit = (sale.selling_price - sale.base_price) * sale.quantity
    return sum + profit
  }, 0)

  // Profit from fully paid loans (recognized at payment completion)
  const fullyPaidLoanPayments = loanPayments.filter(p => p.excess_amount > 0)
  totalProfit += fullyPaidLoanPayments.reduce((sum, payment) => {
    return sum + payment.excess_amount
  }, 0)

  return totalProfit
}

/**
 * Calculate active loans from loan table, not transactions
 * Active loans = loans where paid_amount < loan_amount
 */
export function calculateActiveLoans(loans: Array<{
  loan_amount: number
  paid_amount: number
  customer_name: string
}>): number {
  return loans.reduce((sum, loan) => {
    const remaining = Math.max(0, loan.loan_amount - loan.paid_amount)
    return sum + remaining
  }, 0)
}

/**
 * Get customers with active loans
 */
export function getCustomersWithActiveLoans(loans: Array<{
  loan_amount: number
  paid_amount: number
  customer_name: string
}>): number {
  const activeLoans = loans.filter(loan => loan.paid_amount < loan.loan_amount)
  return new Set(activeLoans.map(loan => loan.customer_name)).size
}

/**
 * Process loan payment with proper overpayment handling
 */
export function processLoanPayment(
  loanAmount: number,
  paidAmount: number,
  paymentAmount: number
): {
  newPaidAmount: number
  remainingBalance: number
  excessAmount: number
  isOverpayment: boolean
} {
  const newPaidAmount = paidAmount + paymentAmount
  const remainingBalance = loanAmount - newPaidAmount
  const excessAmount = Math.max(0, -remainingBalance) // Positive if overpaid
  const isOverpayment = excessAmount > 0

  return {
    newPaidAmount,
    remainingBalance: Math.max(0, remainingBalance), // Never negative
    excessAmount,
    isOverpayment
  }
}

/**
 * Calculate profit for a single transaction
 */
export function calculateTransactionProfit(transaction: SalesTransaction): number {
  if (transaction.payment_method === 'cash') {
    // Cash sales: immediate profit recognition
    return (transaction.selling_price - transaction.base_price) * transaction.quantity
  } else {
    // Loan sales: profit = 0 until fully paid
    return 0
  }
}

/**
 * Check if customer has fully paid loan
 */
export function isLoanFullyPaid(loanAmount: number, paidAmount: number): boolean {
  return paidAmount >= loanAmount
}

/**
 * Get profit recognition timing
 */
export function getProfitRecognitionStatus(
  paymentMethod: string,
  loanAmount: number,
  paidAmount: number
): {
  canRecognizeProfit: boolean
  status: string
  recognizedProfit: number
} {
  if (paymentMethod === 'cash') {
    return {
      canRecognizeProfit: true,
      status: 'Recognized',
      recognizedProfit: 0 // Will be calculated separately
    }
  }

  const isFullyPaid = isLoanFullyPaid(loanAmount, paidAmount)
  
  return {
    canRecognizeProfit: isFullyPaid,
    status: isFullyPaid ? 'Fully Paid - Profit Recognized' : 'Active Loan - Profit Pending',
    recognizedProfit: isFullyPaid ? 0 : 0 // Will be added when fully paid
  }
}
