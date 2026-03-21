// Database-based Sales and Profit Calculations
// Uses actual database tables and columns from the schema

export interface DatabaseTransaction {
  id: string
  transaction_type: 'sale' | 'payment'
  reference_id: string | null
  customer_name: string
  product_id: string
  quantity: number
  selling_price: number
  base_price: number
  payment_method: 'cash' | 'full_loan' | 'partial_loan'
  payment_value: number
  remaining_balance: number
  excess_payment: number
  profit: number
  date: string
  products?: { name: string; base_price: number }
}

export interface DatabaseLoan {
  id: string
  customer_name: string
  product_id: string
  selling_price: number
  base_price: number
  loan_amount: number
  paid_amount: number
  date: string
}

export interface ProfitTracking {
  id: string
  transaction_id: string
  sale_id: string | null
  loan_id: string | null
  customer_name: string
  product_id: string
  quantity: number
  base_price: number
  selling_price: number
  profit_amount: number
  profit_type: 'initial_sale' | 'loan_payment' | 'excess_payment'
  recognized_at: string
  created_at: string
}

export interface DatabaseSale {
  id: string
  customer_name: string
  product_id: string
  quantity: number
  selling_price: number
  payment_method: 'cash' | 'full_loan' | 'partial_loan'
  payment_value: number
  profit: number
  returned_empty: boolean
  empty_quantity_not_returned: number
  date: string
}

/**
 * Calculate Total Sales from transactions table
 * Includes both actual sales transactions and loan payments
 * Loan payments are counted as sales when they occur
 */
export function calculateTotalSalesFromTransactions(transactions: DatabaseTransaction[]): number {
  return transactions
    .filter(t => t.transaction_type === 'sale' || t.transaction_type === 'payment')
    .reduce((sum, transaction) => {
      if (transaction.transaction_type === 'sale') {
        return sum + transaction.payment_value
      } else if (transaction.transaction_type === 'payment') {
        // For loan payments, calculate the sales value proportionally
        // Sales = quantity × selling price proportion of the payment
        return sum + transaction.payment_value
      }
      return sum
    }, 0)
}

/**
 * Calculate Total Profit from profit_tracking table
 * This is the most accurate method as it uses the dedicated profit tracking table
 */
export function calculateTotalProfitFromProfitTracking(profitTracking: ProfitTracking[]): number {
  return profitTracking.reduce((sum, record) => sum + record.profit_amount, 0)
}

/**
 * Calculate Active Loans from loans table
 * Active loans = loan_amount - paid_amount (never negative)
 */
export function calculateActiveLoansFromDatabase(loans: DatabaseLoan[]): number {
  return loans.reduce((sum, loan) => {
    const remaining = Math.max(0, loan.loan_amount - loan.paid_amount)
    return sum + remaining
  }, 0)
}

/**
 * Get Customers with Active Loans
 * Count unique customers with unpaid loans
 */
export function getCustomersWithActiveLoansFromDatabase(loans: DatabaseLoan[]): number {
  const activeLoans = loans.filter(loan => loan.paid_amount < loan.loan_amount)
  return new Set(activeLoans.map(loan => loan.customer_name)).size
}

/**
 * Calculate Total Sales from sales table (legacy support)
 * Only counts cash sales for backward compatibility
 */
export function calculateTotalSalesFromSalesTable(sales: DatabaseSale[]): number {
  return sales
    .filter(s => s.payment_method === 'cash')
    .reduce((sum, sale) => sum + sale.payment_value, 0)
}

/**
 * Calculate Total Profit from sales table (legacy support)
 * Uses profit column directly
 */
export function calculateTotalProfitFromSalesTable(sales: DatabaseSale[]): number {
  return sales.reduce((sum, sale) => sum + sale.profit, 0)
}

/**
 * Get Financial Summary using database data
 * Prioritizes transactions table and profit_tracking table for accuracy
 */
export function getFinancialSummaryFromDatabase(
  transactions: DatabaseTransaction[],
  loans: DatabaseLoan[],
  profitTracking: ProfitTracking[],
  sales?: DatabaseSale[]
) {
  // Prefer profit_tracking table if available (most accurate)
  if (profitTracking.length > 0) {
    return {
      totalSales: calculateTotalSalesFromTransactions(transactions),
      totalProfit: calculateTotalProfitFromProfitTracking(profitTracking),
      activeLoans: calculateActiveLoansFromDatabase(loans),
      customersWithLoans: getCustomersWithActiveLoansFromDatabase(loans),
      totalTransactions: transactions.filter(t => t.transaction_type === 'sale').length,
      data来源: 'profit_tracking_table'
    }
  }
  
  // Fallback to transactions table if profit_tracking is empty
  if (transactions.length > 0) {
    return {
      totalSales: calculateTotalSalesFromTransactions(transactions),
      totalProfit: 0, // No profit tracking data available
      activeLoans: calculateActiveLoansFromDatabase(loans),
      customersWithLoans: getCustomersWithActiveLoansFromDatabase(loans),
      totalTransactions: transactions.filter(t => t.transaction_type === 'sale').length,
      data来源: 'transactions_table_no_profit'
    }
  }
  
  // Fallback to sales table (legacy)
  if (sales && sales.length > 0) {
    return {
      totalSales: calculateTotalSalesFromSalesTable(sales),
      totalProfit: calculateTotalProfitFromSalesTable(sales),
      activeLoans: calculateActiveLoansFromDatabase(loans),
      customersWithLoans: getCustomersWithActiveLoansFromDatabase(loans),
      totalTransactions: sales.length,
      data来源: 'sales_table'
    }
  }
  
  // Default empty state
  return {
    totalSales: 0,
    totalProfit: 0,
    activeLoans: 0,
    customersWithLoans: 0,
    totalTransactions: 0,
    data来源: 'no_data'
  }
}

/**
 * Calculate profit for a single transaction
 * Uses database logic: (selling_price - base_price) * quantity
 */
export function calculateTransactionProfitFromDatabase(transaction: DatabaseTransaction): number {
  if (transaction.transaction_type === 'sale') {
    if (transaction.payment_method === 'cash') {
      // Immediate profit for cash sales
      return (transaction.selling_price - transaction.base_price) * transaction.quantity
    } else {
      // For loans (partial and full), profit is only recognized when fully paid
      // Check if remaining balance is 0 to determine if fully paid
      if (transaction.remaining_balance === 0) {
        // Loan is fully paid, recognize the full profit
        return (transaction.selling_price - transaction.base_price) * transaction.quantity
      } else {
        // Loan not fully paid yet, no profit recognized
        return 0
      }
    }
  } else if (transaction.transaction_type === 'payment') {
    // Payment transactions don't generate profit directly
    // Profit is recognized when the original loan transaction is fully paid
    return 0
  }
  
  return 0
}

/**
 * Check if loan is fully paid
 */
export function isLoanFullyPaidFromDatabase(loan: DatabaseLoan): boolean {
  return loan.paid_amount >= loan.loan_amount
}

/**
 * Get loan status for display
 */
export function getLoanStatusFromDatabase(loan: DatabaseLoan): {
  status: 'PAID' | 'PARTIAL' | 'OVERPAID'
  remainingBalance: number
  excessAmount: number
} {
  const remainingBalance = loan.loan_amount - loan.paid_amount
  
  if (remainingBalance <= 0) {
    return {
      status: 'PAID',
      remainingBalance: 0,
      excessAmount: Math.abs(remainingBalance)
    }
  }
  
  return {
    status: 'PARTIAL',
    remainingBalance,
    excessAmount: 0
  }
}

/**
 * Calculate monthly totals from transactions
 */
export function calculateMonthlyTotalsFromDatabase(
  transactions: DatabaseTransaction[],
  profitTracking: ProfitTracking[],
  targetYear: number,
  targetMonth: number
) {
  const monthStart = new Date(targetYear, targetMonth, 1)
  const monthEnd = new Date(targetYear, targetMonth + 1, 0)

  const monthlyTransactions = transactions.filter(t => {
    const transactionDate = new Date(t.date)
    return transactionDate >= monthStart && transactionDate <= monthEnd
  })

  const monthlyProfitTracking = profitTracking.filter(p => {
    const profitDate = new Date(p.recognized_at)
    return profitDate >= monthStart && profitDate <= monthEnd
  })

  return {
    totalSales: calculateTotalSalesFromTransactions(monthlyTransactions),
    totalProfit: calculateTotalProfitFromProfitTracking(monthlyProfitTracking),
    totalTransactions: monthlyTransactions.filter(t => t.transaction_type === 'sale').length,
    uniqueCustomers: new Set(monthlyTransactions.map(t => t.customer_name)).size
  }
}

/**
 * Format currency for display
 */
export function formatCurrencyFromDatabase(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2
  }).format(amount)
}

/**
 * Validate database calculation inputs
 */
export function validateDatabaseInputs(transaction: DatabaseTransaction): string[] {
  const errors: string[] = []

  if (transaction.selling_price < 0) {
    errors.push('Selling price cannot be negative')
  }

  if (transaction.base_price < 0) {
    errors.push('Base price cannot be negative')
  }

  if (transaction.quantity <= 0) {
    errors.push('Quantity must be greater than 0')
  }

  if (transaction.payment_value < 0) {
    errors.push('Payment value cannot be negative')
  }

  if (transaction.selling_price < transaction.base_price) {
    errors.push('Warning: Selling price is below base price (loss)')
  }

  return errors
}
