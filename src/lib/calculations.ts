// Standardized calculation functions for profit, sales, and loans
// This ensures consistent math across the entire application

export interface TransactionRecord {
  id: string
  transaction_type: 'sale' | 'payment'
  customer_name: string
  payment_method: 'cash' | 'full_loan' | 'partial_loan'
  payment_value: number
  date: string
}

export interface ProfitRecord {
  id: string
  transaction_id: string
  profit_amount: number
  recognized_at: string
  profit_type: 'initial_sale' | 'loan_payment' | 'excess_payment'
}

export interface LoanRecord {
  id: string
  customer_name: string
  loan_amount: number
  paid_amount: number
}

export interface CalculationInputs {
  sellingPrice: number
  basePrice: number
  quantity: number
}

export interface TransactionData {
  customerName: string
  productId: string
  quantity: number
  sellingPrice: number
  basePrice: number
  paymentMethod: 'cash' | 'full_loan' | 'partial_loan'
  paymentValue?: number
}

export interface PaymentCalculation {
  totalAmount: number
  paymentValue: number
  remainingBalance: number
  excessPayment: number
  profit: number
}

export interface LoanCalculation {
  loanAmount: number
  paidAmount: number
  remainingBalance: number
  isFullyPaid: boolean
  profitToRecognize?: number
}

/**
 * Standard profit calculation
 * Formula: (selling_price - base_price) * quantity
 */
export function calculateProfit(inputs: CalculationInputs): number {
  const { sellingPrice, basePrice, quantity } = inputs
  return (sellingPrice - basePrice) * quantity
}

/**
 * Calculate transaction details based on payment method
 */
export function calculateTransactionDetails(data: TransactionData): PaymentCalculation {
  const { sellingPrice, basePrice, quantity, paymentMethod, paymentValue = 0 } = data
  const totalAmount = sellingPrice * quantity
  let remainingBalance = 0
  let excessPayment = 0
  let finalPaymentValue = paymentValue
  let profit = 0

  switch (paymentMethod) {
    case 'cash':
      finalPaymentValue = totalAmount
      profit = calculateProfit({ sellingPrice, basePrice, quantity })
      break

    case 'partial_loan':
      // Check for overpayment
      if (paymentValue > totalAmount) {
        excessPayment = paymentValue - totalAmount
        finalPaymentValue = totalAmount
        remainingBalance = 0
        profit = calculateProfit({ sellingPrice, basePrice, quantity }) + excessPayment
      } else {
        remainingBalance = totalAmount - paymentValue
        profit = calculateProfit({ sellingPrice, basePrice, quantity })
      }
      break

    case 'full_loan':
      remainingBalance = totalAmount
      finalPaymentValue = 0
      profit = 0 // Profit recognized when loan is paid
      break

    default:
      throw new Error(`Invalid payment method: ${paymentMethod}`)
  }

  return {
    totalAmount,
    paymentValue: finalPaymentValue,
    remainingBalance,
    excessPayment,
    profit
  }
}

/**
 * Calculate loan payment details
 */
export function calculateLoanPayment(
  loanAmount: number,
  paidAmount: number,
  paymentAmount: number
): LoanCalculation {
  const newPaidAmount = paidAmount + paymentAmount
  const remainingBalance = loanAmount - newPaidAmount
  const isFullyPaid = remainingBalance <= 0

  return {
    loanAmount,
    paidAmount: newPaidAmount,
    remainingBalance: Math.max(0, remainingBalance),
    isFullyPaid
  }
}

/**
 * Calculate total sales for a period
 * Only includes actual payments (cash sales + loan payments)
 */
export function calculateTotalSales(transactions: TransactionRecord[]): number {
  return transactions.reduce((sum, transaction) => {
    if (transaction.transaction_type === 'sale' && transaction.payment_method === 'cash') {
      return sum + transaction.payment_value
    }
    if (transaction.transaction_type === 'payment') {
      return sum + transaction.payment_value
    }
    return sum
  }, 0)
}

/**
 * Calculate total profit for a period
 * Uses profit_tracking table for accurate calculations
 */
export function calculateTotalProfit(profitRecords: ProfitRecord[]): number {
  return profitRecords.reduce((sum, record) => sum + record.profit_amount, 0)
}

/**
 * Calculate active loans total
 */
export function calculateActiveLoans(loans: LoanRecord[]): number {
  return loans.reduce((sum, loan) => {
    const remaining = loan.loan_amount - loan.paid_amount
    return sum + Math.max(0, remaining)
  }, 0)
}

/**
 * Validate calculation inputs
 */
export function validateCalculationInputs(inputs: CalculationInputs): string[] {
  const errors: string[] = []

  if (inputs.sellingPrice < 0) {
    errors.push('Selling price cannot be negative')
  }

  if (inputs.basePrice < 0) {
    errors.push('Base price cannot be negative')
  }

  if (inputs.quantity <= 0) {
    errors.push('Quantity must be greater than 0')
  }

  if (inputs.sellingPrice < inputs.basePrice) {
    errors.push('Warning: Selling price is below base price (loss)')
  }

  return errors
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2
  }).format(amount)
}

/**
 * Calculate monthly totals from transactions
 */
export function calculateMonthlyTotals(transactions: TransactionRecord[], targetMonth: Date) {
  const monthStart = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1)
  const monthEnd = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0)

  const monthlyTransactions = transactions.filter(t => {
    const transactionDate = new Date(t.date)
    return transactionDate >= monthStart && transactionDate <= monthEnd
  })

  return {
    totalSales: calculateTotalSales(monthlyTransactions),
    totalTransactions: monthlyTransactions.length,
    uniqueCustomers: new Set(monthlyTransactions.map(t => t.customer_name)).size
  }
}

/**
 * Generate financial summary for dashboard
 */
export function generateFinancialSummary(
  transactions: TransactionRecord[],
  profitRecords: ProfitRecord[],
  loans: LoanRecord[],
  targetMonth?: Date
) {
  const period = targetMonth || new Date()
  const monthlyData = calculateMonthlyTotals(transactions, period)
  
  const monthlyProfit = profitRecords
    .filter(p => {
      const profitDate = new Date(p.recognized_at)
      return profitDate >= new Date(period.getFullYear(), period.getMonth(), 1) &&
             profitDate <= new Date(period.getFullYear(), period.getMonth() + 1, 0)
    })
    .reduce((sum, p) => sum + p.profit_amount, 0)

  return {
    totalSales: monthlyData.totalSales,
    totalProfit: monthlyProfit,
    totalTransactions: monthlyData.totalTransactions,
    uniqueCustomers: monthlyData.uniqueCustomers,
    activeLoans: calculateActiveLoans(loans),
    customersWithLoans: loans.filter(loan => loan.loan_amount > loan.paid_amount).length
  }
}
