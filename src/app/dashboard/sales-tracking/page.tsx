'use client'

import { useState, useEffect, useCallback } from 'react'
import { FiDownload, FiDollarSign, FiTrendingUp, FiUsers, FiCreditCard } from 'react-icons/fi'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { 
  calculateTotalSalesFromTransactions, 
  calculateTotalProfitFromProfitTracking,
  calculateActiveLoansFromDatabase,
  getCustomersWithActiveLoansFromDatabase,
  calculateTransactionProfitFromDatabase,
  DatabaseTransaction,
  ProfitTracking
} from '@/lib/database-calculations'

interface EmptyTank {
  id: string
  customer_name: string
  product_id: string
  quantity: number
  date: string
}

// Extended interface for local use with additional properties
interface ExtendedDatabaseTransaction extends DatabaseTransaction {
  returned_empty?: boolean
  empty_quantity_not_returned?: number
  loan_info?: {
    loan_id: string
    loan_amount: number
    paid_amount: number
    remaining_balance: number
    status: string
    last_payment_date: string
  }
}


export default function SalesTrackingPage() {
  const [loading, setLoading] = useState(true)
  const [sales, setSales] = useState<ExtendedDatabaseTransaction[]>([])
  const [profitTracking, setProfitTracking] = useState<ProfitTracking[]>([])
  const [emptyTanks, setEmptyTanks] = useState<EmptyTank[]>([])
  const [totalSales, setTotalSales] = useState(0)
  const [totalProfit, setTotalProfit] = useState(0)
  const [activeLoans, setActiveLoans] = useState(0)
  const [customersWithLoans, setCustomersWithLoans] = useState(0)
  
  // Filter states
  const [selectedMonth, setSelectedMonth] = useState<string>('')
  const [selectedYear, setSelectedYear] = useState<string>('')
  const [filteredSales, setFilteredSales] = useState<ExtendedDatabaseTransaction[]>([])
  const [filteredProfitTracking, setFilteredProfitTracking] = useState<ProfitTracking[]>([])
  const [filteredEmptyTanks, setFilteredEmptyTanks] = useState<EmptyTank[]>([])
  
  // Generate filter options
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 4 }, (_, i) => currentYear - i)
  const months = [
    { value: '', label: 'All Months' },
    { value: '1', label: 'January' },
    { value: '2', label: 'February' },
    { value: '3', label: 'March' },
    { value: '4', label: 'April' },
    { value: '5', label: 'May' },
    { value: '6', label: 'June' },
    { value: '7', label: 'July' },
    { value: '8', label: 'August' },
    { value: '9', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' }
  ]

  useEffect(() => {
    fetchSalesData()
  }, [])

  const filterData = useCallback(() => {
    let filteredSalesData = sales
    let filteredProfitTrackingData = profitTracking
    let filteredEmptyTanksData = emptyTanks

    // Filter by month
    if (selectedMonth) {
      filteredSalesData = filteredSalesData.filter(sale => {
        const saleDate = new Date(sale.date)
        return (saleDate.getMonth() + 1).toString() === selectedMonth
      })
      
      filteredProfitTrackingData = filteredProfitTrackingData.filter(profit => {
        const profitDate = new Date(profit.created_at)
        return (profitDate.getMonth() + 1).toString() === selectedMonth
      })
      
      filteredEmptyTanksData = filteredEmptyTanksData.filter(tank => {
        const tankDate = new Date(tank.date)
        return (tankDate.getMonth() + 1).toString() === selectedMonth
      })
    }

    // Filter by year
    if (selectedYear) {
      filteredSalesData = filteredSalesData.filter(sale => {
        const saleDate = new Date(sale.date)
        return saleDate.getFullYear().toString() === selectedYear
      })
      
      filteredProfitTrackingData = filteredProfitTrackingData.filter(profit => {
        const profitDate = new Date(profit.created_at)
        return profitDate.getFullYear().toString() === selectedYear
      })
      
      filteredEmptyTanksData = filteredEmptyTanksData.filter(tank => {
        const tankDate = new Date(tank.date)
        return tankDate.getFullYear().toString() === selectedYear
      })
    }

    setFilteredSales(filteredSalesData)
    setFilteredProfitTracking(filteredProfitTrackingData)
    setFilteredEmptyTanks(filteredEmptyTanksData)

    // Update summary cards with filtered data
    const salesTotal = calculateTotalSalesFromTransactions(filteredSalesData as DatabaseTransaction[])
    const profitTotal = calculateTotalProfitFromProfitTracking(filteredProfitTrackingData)
    setTotalSales(salesTotal)
    setTotalProfit(profitTotal)
  }, [selectedMonth, selectedYear, sales, profitTracking, emptyTanks])

  useEffect(() => {
    filterData()
  }, [filterData])

  const fetchSalesData = async () => {
    try {
      // Fetch transactions
      const { data: transactionsData } = await supabase
        .from('transactions')
        .select(`
          *,
          products (name, base_price)
        `)
        .order('date', { ascending: false })

      // Fetch loan information
      const { data: loansData } = await supabase
        .from('loans')
        .select('*')

      // Fetch profit tracking data
      const { data: profitTrackingData } = await supabase
        .from('profit_tracking')
        .select('*')

      // Fetch empty tanks unreturned data
      const { data: emptyTanksData } = await supabase
        .from('empty_tanks_unreturned')
        .select('*')

      // Create loans map
      const loansMap = new Map<string, {
        loan_id: string
        loan_amount: number
        paid_amount: number
        remaining_balance: number
        status: string
        last_payment_date: string
      }>()
      
      loansData?.forEach(loan => {
        const remaining = loan.loan_amount - loan.paid_amount
        const status = remaining <= 0 ? 'PAID' : 'Partial Loan'
        loansMap.set(loan.customer_name, {
          loan_id: loan.id,
          loan_amount: loan.loan_amount,
          paid_amount: loan.paid_amount,
          remaining_balance: remaining > 0 ? remaining : 0,
          status,
          last_payment_date: loan.updated_at || loan.created_at
        })
      })

      // Enrich transactions with loan info
      const enrichedTransactions = (transactionsData || []).map(transaction => ({
        ...transaction,
        base_price: transaction.products?.base_price || 0,
        loan_info: loansMap.get(transaction.customer_name)
      }))

      // Calculate totals
      const salesTotal = calculateTotalSalesFromTransactions(enrichedTransactions)
      const profitTotal = calculateTotalProfitFromProfitTracking(profitTrackingData || [])
      const activeLoansTotal = calculateActiveLoansFromDatabase(loansData || [])
      const customersWithActiveLoansCount = getCustomersWithActiveLoansFromDatabase(loansData || [])

      setSales(enrichedTransactions)
      setProfitTracking(profitTrackingData || [])
      setEmptyTanks(emptyTanksData || [])
      setTotalSales(salesTotal)
      setTotalProfit(profitTotal)
      setActiveLoans(activeLoansTotal)
      setCustomersWithLoans(customersWithActiveLoansCount)

    } catch (error) {
      console.error('Error fetching sales data:', error)
    } finally {
      setLoading(false)
    }
  }

  // PERFECT CSV EXPORT FUNCTION
  const downloadCSV = () => {
    const headers = [
      'Customer Name', 
      'Product Name', 
      'Quantity', 
      'Selling Price', 
      'Profit Amount', 
      'Payment Type',
      'Remaining Balance',
      'Returned Empty Tank',
      'Transaction Date'
    ]
    
    const csvData = filteredSales.map(sale => {
      // Get profit tracking data for this transaction
      const transactionProfit = filteredProfitTracking.find(pt => pt.transaction_id === sale.id)
      const loanInfo = sale.loan_info
      
      // Smart empty tank display logic using empty_tanks_unreturned data
      const unreturnedTank = filteredEmptyTanks.find((tank: EmptyTank) => 
        tank.customer_name === sale.customer_name && 
        tank.product_id === sale.product_id
      )
      
      const returnedEmptyTank = unreturnedTank 
        ? `NO (${unreturnedTank.quantity})` 
        : `YES (${sale.quantity || 0})`
      
      return [
        sale.customer_name,
        sale.products?.name || 'Unknown',
        sale.quantity || 0,
        sale.selling_price || 0,
        transactionProfit?.profit_amount || calculateTransactionProfitFromDatabase(sale), // Use profit_tracking if available
        (sale.payment_method === 'cash' && sale.transaction_type === 'payment') ? 'CASH LOAN PAYMENT' : sale.payment_method,
        loanInfo?.remaining_balance || sale.remaining_balance || 0,
        returnedEmptyTank,
        new Date(sale.date).toLocaleDateString()
      ]
    })

    const csvContent = [headers, ...csvData].map(row => row.join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sales-export-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading sales data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="bg-linear-to-r from-blue-600 to-indigo-600 rounded-2xl p-4 sm:p-6 lg:p-8 text-white shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
          <div className="mb-4 lg:mb-0">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold mb-1 lg:mb-2">Sales Tracking</h1>
            <p className="text-blue-100 text-sm sm:text-base lg:text-lg">Monitor sales performance and trends</p>
          </div>
        </div>
      </div>

      {/* Filter Section */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Month</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {months.map(month => (
                <option key={month.value} value={month.value}>
                  {month.label}
                </option>
              ))}
            </select>
          </div>
          
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Year</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Years</option>
              {years.map(year => (
                <option key={year} value={year.toString()}>
                  {year}
                </option>
              ))}
            </select>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={() => {
                setSelectedMonth('')
                setSelectedYear('')
              }}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors duration-200"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4 lg:gap-6">
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-3 sm:p-4 lg:p-6 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="p-2 sm:p-3 lg:p-4 rounded-xl bg-orange-50 shadow-sm">
                <FiDollarSign className="w-4 h-4 sm:w-5 sm:h-5 lg:w-7 lg:h-7 text-orange-600" />
              </div>
              <div className="ml-2 sm:ml-3 lg:ml-4">
                <p className="text-xs sm:text-sm font-medium text-gray-600 mb-1">Total Sales</p>
                <p className="text-lg sm:text-xl lg:text-3xl font-bold text-gray-900">₱{totalSales.toLocaleString()}</p>
              </div>
            </div>
            <div className="p-1 sm:p-2 rounded-lg bg-orange-50 opacity-50">
              <FiDollarSign className="w-3 h-3 sm:w-4 sm:h-4 text-orange-600" />
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-3 sm:p-4 lg:p-6 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="p-2 sm:p-3 lg:p-4 rounded-xl bg-green-50 shadow-sm">
                <FiTrendingUp className="w-4 h-4 sm:w-5 sm:h-5 lg:w-7 lg:h-7 text-green-600" />
              </div>
              <div className="ml-2 sm:ml-3 lg:ml-4">
                <p className="text-xs sm:text-sm font-medium text-gray-600 mb-1">Total Profit</p>
                <p className="text-lg sm:text-xl lg:text-3xl font-bold text-gray-900">₱{totalProfit.toLocaleString()}</p>
              </div>
            </div>
            <div className="p-1 sm:p-2 rounded-lg bg-green-50 opacity-50">
              <FiTrendingUp className="w-3 h-3 sm:w-4 sm:h-4 text-green-600" />
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-3 sm:p-4 lg:p-6 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="p-2 sm:p-3 lg:p-4 rounded-xl bg-blue-50 shadow-sm">
                <FiTrendingUp className="w-4 h-4 sm:w-5 sm:h-5 lg:w-7 lg:h-7 text-blue-600" />
              </div>
              <div className="ml-2 sm:ml-3 lg:ml-4">
                <p className="text-xs sm:text-sm font-medium text-gray-600 mb-1">Total Transactions</p>
                <p className="text-lg sm:text-xl lg:text-3xl font-bold text-gray-900">{filteredSales.length}</p>
              </div>
            </div>
            <div className="p-1 sm:p-2 rounded-lg bg-blue-50 opacity-50">
              <FiTrendingUp className="w-3 h-3 sm:w-4 sm:h-4 text-blue-600" />
            </div>
          </div>
        </div>
        
        <Link href="/dashboard/customers" className="bg-white rounded-xl shadow-lg border border-gray-100 p-3 sm:p-4 lg:p-6 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 group">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="p-2 sm:p-3 lg:p-4 rounded-xl bg-red-50 shadow-sm group-hover:bg-red-100 transition-colors duration-300">
                <FiCreditCard className="w-4 h-4 sm:w-5 sm:h-5 lg:w-7 lg:h-7 text-red-600" />
              </div>
              <div className="ml-2 sm:ml-3 lg:ml-4">
                <p className="text-xs sm:text-sm font-medium text-gray-600 mb-1">Active Loans</p>
                <p className="text-lg sm:text-xl lg:text-3xl font-bold text-gray-900">₱{activeLoans.toLocaleString()}</p>
              </div>
            </div>
            <div className="p-1 sm:p-2 rounded-lg bg-red-50 opacity-50 group-hover:bg-red-100 transition-colors duration-300">
              <FiCreditCard className="w-3 h-3 sm:w-4 sm:h-4 text-red-600" />
            </div>
          </div>
        </Link>
        
        <Link href="/dashboard/customers" className="bg-white rounded-xl shadow-lg border border-gray-100 p-3 sm:p-4 lg:p-6 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 group">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="p-2 sm:p-3 lg:p-4 rounded-xl bg-purple-50 shadow-sm group-hover:bg-purple-100 transition-colors duration-300">
                <FiUsers className="w-4 h-4 sm:w-5 sm:h-5 lg:w-7 lg:h-7 text-purple-600" />
              </div>
              <div className="ml-2 sm:ml-3 lg:ml-4">
                <p className="text-xs sm:text-sm font-medium text-gray-600 mb-1">Customers with Loans</p>
                <p className="text-lg sm:text-xl lg:text-3xl font-bold text-gray-900">{customersWithLoans}</p>
              </div>
            </div>
            <div className="p-1 sm:p-2 rounded-lg bg-purple-50 opacity-50 group-hover:bg-purple-100 transition-colors duration-300">
              <FiUsers className="w-3 h-3 sm:w-4 sm:h-4 text-purple-600" />
            </div>
          </div>
        </Link>
      </div>

      {/* Recent Sales with Perfect CSV Export */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-b border-gray-100 bg-gray-50 relative">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 sm:gap-4">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">Recent Sales</h2>
              <div className="text-xs sm:text-sm text-gray-500">
                Showing {Math.min(filteredSales.length, 50)} of {filteredSales.length} transactions • 9 key columns
              </div>
            </div>
            
            {/* PERFECT CSV EXPORT BUTTON */}
            <button
              onClick={downloadCSV}
              className="bg-green-600 hover:bg-green-700 text-white px-3 sm:px-6 py-1.5 sm:py-2 rounded-lg flex items-center transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl"
            >
              <FiDownload className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              <span className="text-xs sm:text-sm">Export Perfect CSV</span>
            </button>
          </div>
        </div>

        {/* Sales Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Selling Price</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Profit</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payment</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Remaining Balance</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Returned Empty Tank</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredSales.slice(0, 10).map((sale) => {
                const transactionProfit = filteredProfitTracking.find(pt => pt.transaction_id === sale.id)
                const loanInfo = sale.loan_info
                
                // Smart empty tank display logic using empty_tanks_unreturned data
                const unreturnedTank = filteredEmptyTanks.find((tank: EmptyTank) => 
                  tank.customer_name === sale.customer_name && 
                  tank.product_id === sale.product_id
                )
                
                const returnedEmptyTank = unreturnedTank 
                  ? `NO (${unreturnedTank.quantity})` 
                  : `YES (${sale.quantity || 0})`
                
                return (
                  <tr key={sale.id} className="hover:bg-gray-50">
                    <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">{sale.customer_name}</td>
                    <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">{sale.products?.name || 'Unknown'}</td>
                    <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">{sale.quantity}</td>
                    <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">₱{sale.selling_price?.toLocaleString() || 0}</td>
                    <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                      ₱{(transactionProfit?.profit_amount || calculateTransactionProfitFromDatabase(sale)).toLocaleString()}
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        (sale.payment_method === 'cash' && sale.transaction_type === 'payment') ? 'bg-purple-100 text-purple-800' :
                        sale.payment_method === 'cash' ? 'bg-green-100 text-green-800' :
                        sale.payment_method === 'partial_loan' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {(sale.payment_method === 'cash' && sale.transaction_type === 'payment') ? 'CASH LOAN PAYMENT' : sale.payment_method}
                      </span>
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">₱{(loanInfo?.remaining_balance || sale.remaining_balance || 0).toLocaleString()}</td>
                    <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        sale.returned_empty ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {returnedEmptyTank}
                      </span>
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(sale.date).toLocaleDateString()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}