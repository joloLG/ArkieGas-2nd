'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { FiDownload, FiTrendingUp, FiDollarSign, FiCreditCard, FiUsers, FiChevronLeft, FiChevronRight, FiFilter, FiX } from 'react-icons/fi'
import { supabase } from '@/lib/supabase'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface Sale {
  id: string
  customer_name: string
  product_id: string
  quantity: number
  selling_price: number
  base_price: number
  payment_method: string
  payment_value: number
  profit: number
  returned_empty: boolean
  empty_quantity_not_returned: number
  date: string
  products?: { 
    name: string
    base_price: number
  }
  loan_info?: {
    loan_amount: number
    paid_amount: number
    remaining_balance: number
    status: 'PAID' | 'Partial Loan'
    last_payment_date?: string
  }
}

interface Product {
  id: string
  name: string
}

interface ProductSalesData {
  product_name: string
  sales: number
}

interface YearlyData {
  year: number
  sales: number
}

export default function SalesTrackingPage() {
  const [sales, setSales] = useState<Sale[]>([])
  const [yearlyData, setYearlyData] = useState<YearlyData[]>([])
  const [productSalesData, setProductSalesData] = useState<ProductSalesData[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [filter, setFilter] = useState<'day' | 'month' | 'year'>('month')
  const [selectedProduct, setSelectedProduct] = useState<string>('all')
  const [selectedDate, setSelectedDate] = useState<{
    day: { year: number; month: number; date: number };
    month: { year: number; month: number };
    year: number;
  }>({
    day: {
      year: new Date().getFullYear(),
      month: new Date().getMonth(),
      date: new Date().getDate()
    },
    month: {
      year: new Date().getFullYear(),
      month: new Date().getMonth()
    },
    year: new Date().getFullYear()
  })
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [quickFilterRange, setQuickFilterRange] = useState<'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'lastYear' | 'custom' | null>(null)

  // Helper functions for date handling
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  const getMonthYearString = () => {
    if (filter === 'month') {
      return `${monthNames[selectedDate.month.month]} ${selectedDate.month.year}`
    } else if (filter === 'day') {
      return `${monthNames[selectedDate.day.month]} ${selectedDate.day.date}, ${selectedDate.day.year}`
    } else {
      return `${selectedDate.year}`
    }
  }

  const handleDateChange = (type: 'day' | 'month' | 'year', values: { year?: number; month?: number; date?: number } | number) => {
    setSelectedDate(prev => ({
      ...prev,
      [type]: values
    }))
    setQuickFilterRange('custom')
  }

  const applyQuickFilter = (range: 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'lastYear') => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    
    switch (range) {
      case 'today':
        setFilter('day')
        setSelectedDate({
          ...selectedDate,
          day: {
            year: today.getFullYear(),
            month: today.getMonth(),
            date: today.getDate()
          }
        })
        break
      case 'yesterday':
        const yesterday = new Date(today)
        yesterday.setDate(yesterday.getDate() - 1)
        setFilter('day')
        setSelectedDate({
          ...selectedDate,
          day: {
            year: yesterday.getFullYear(),
            month: yesterday.getMonth(),
            date: yesterday.getDate()
          }
        })
        break
      case 'thisWeek':
        setFilter('day')
        setSelectedDate({
          ...selectedDate,
          day: {
            year: today.getFullYear(),
            month: today.getMonth(),
            date: today.getDate()
          }
        })
        break
      case 'lastWeek':
        const lastWeek = new Date(today)
        lastWeek.setDate(lastWeek.getDate() - 7)
        setFilter('day')
        setSelectedDate({
          ...selectedDate,
          day: {
            year: lastWeek.getFullYear(),
            month: lastWeek.getMonth(),
            date: lastWeek.getDate()
          }
        })
        break
      case 'thisMonth':
        setFilter('month')
        setSelectedDate({
          ...selectedDate,
          month: {
            year: today.getFullYear(),
            month: today.getMonth()
          }
        })
        break
      case 'lastMonth':
        const lastMonth = new Date(today.getFullYear(), today.getMonth(), 1)
        lastMonth.setMonth(lastMonth.getMonth() - 1)
        setFilter('month')
        setSelectedDate({
          ...selectedDate,
          month: {
            year: lastMonth.getFullYear(),
            month: lastMonth.getMonth()
          }
        })
        break
      case 'thisYear':
        setFilter('year')
        setSelectedDate({
          ...selectedDate,
          year: today.getFullYear()
        })
        break
      case 'lastYear':
        setFilter('year')
        setSelectedDate({
          ...selectedDate,
          year: today.getFullYear() - 1
        })
        break
    }
    setQuickFilterRange(range)
  }

  const navigateDate = (direction: 'prev' | 'next') => {
    if (filter === 'day') {
      const currentDate = new Date(selectedDate.day.year, selectedDate.day.month, selectedDate.day.date)
      if (direction === 'prev') {
        currentDate.setDate(currentDate.getDate() - 1)
      } else {
        currentDate.setDate(currentDate.getDate() + 1)
      }
      handleDateChange('day', {
        year: currentDate.getFullYear(),
        month: currentDate.getMonth(),
        date: currentDate.getDate()
      })
    } else if (filter === 'month') {
      const currentMonth = new Date(selectedDate.month.year, selectedDate.month.month, 1)
      if (direction === 'prev') {
        currentMonth.setMonth(currentMonth.getMonth() - 1)
      } else {
        currentMonth.setMonth(currentMonth.getMonth() + 1)
      }
      handleDateChange('month', {
        year: currentMonth.getFullYear(),
        month: currentMonth.getMonth()
      })
    } else if (filter === 'year') {
      const newYear = direction === 'prev' ? selectedDate.year - 1 : selectedDate.year + 1
      handleDateChange('year', newYear)
    }
    setQuickFilterRange('custom')
  }

  const clearFilters = () => {
    setFilter('month')
    setSelectedProduct('all')
    setSelectedDate({
      day: {
        year: new Date().getFullYear(),
        month: new Date().getMonth(),
        date: new Date().getDate()
      },
      month: {
        year: new Date().getFullYear(),
        month: new Date().getMonth()
      },
      year: new Date().getFullYear()
    })
    setQuickFilterRange(null)
  }

  const getCurrentYear = () => new Date().getFullYear()
  const getYearOptions = () => {
    const years = []
    for (let i = getCurrentYear() - 5; i <= getCurrentYear() + 1; i++) {
      years.push(i)
    }
    return years
  }

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate()
  }

  const [loading, setLoading] = useState(true)
  const [totalSales, setTotalSales] = useState(0)
  const [totalProfit, setTotalProfit] = useState(0)
  const [activeLoans, setActiveLoans] = useState(0)
  const [customersWithLoans, setCustomersWithLoans] = useState(0)

  useEffect(() => {
    fetchSalesData()
    fetchYearlyData()
    fetchProductSalesData()
    fetchLoansData()
    fetchProducts()
  }, [filter, selectedDate, selectedProduct])

  const fetchSalesData = async () => {
    try {
      let query = supabase
        .from('sales')
        .select(`
          *,
          products (name, base_price)
        `)
        .order('date', { ascending: false })

      if (filter === 'day') {
        const startOfDay = new Date(selectedDate.day.year, selectedDate.day.month, selectedDate.day.date)
        const endOfDay = new Date(selectedDate.day.year, selectedDate.day.month, selectedDate.day.date, 23, 59, 59)
        query = query.gte('date', startOfDay.toISOString()).lte('date', endOfDay.toISOString())
      } else if (filter === 'month') {
        const startOfMonth = new Date(selectedDate.month.year, selectedDate.month.month, 1)
        const endOfMonth = new Date(selectedDate.month.year, selectedDate.month.month + 1, 0)
        query = query.gte('date', startOfMonth.toISOString()).lte('date', endOfMonth.toISOString())
      } else if (filter === 'year') {
        const startOfYear = new Date(selectedDate.year, 0, 1)
        const endOfYear = new Date(selectedDate.year, 11, 31, 23, 59, 59)
        query = query.gte('date', startOfYear.toISOString()).lte('date', endOfYear.toISOString())
      }

      // Add product filter if selected
      if (selectedProduct !== 'all') {
        query = query.eq('product_id', selectedProduct)
      }

      const { data } = await query
      const salesData = data || []

      // Fetch loan information for customers with loans
      const { data: loansData } = await supabase
        .from('loans')
        .select('*')
      
      const loansMap = new Map<string, any>()
      loansData?.forEach(loan => {
        const remaining = loan.loan_amount - loan.paid_amount
        const status = remaining <= 0 ? 'PAID' : 'Partial Loan'
        loansMap.set(loan.customer_name, {
          loan_amount: loan.loan_amount,
          paid_amount: loan.paid_amount,
          remaining_balance: remaining > 0 ? remaining : 0,
          status,
          last_payment_date: loan.updated_at || loan.created_at
        })
      })

      // Enrich sales data with base prices and loan information
      const enrichedSales = salesData.map(sale => ({
        ...sale,
        base_price: sale.products?.base_price || 0,
        loan_info: loansMap.get(sale.customer_name)
      }))

      // Calculate totals
      const salesTotal = enrichedSales.reduce((sum, sale) => sum + (sale.payment_value || 0), 0)
      const profitTotal = enrichedSales.reduce((sum, sale) => sum + sale.profit, 0)

      setSales(enrichedSales)
      setTotalSales(salesTotal)
      setTotalProfit(profitTotal)
    } catch (error) {
      console.error('Error fetching sales data:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchProductSalesData = async () => {
    try {
      const { data } = await supabase
        .from('sales')
        .select(`
          selling_price,
          products (name)
        `)

      const productMap = new Map<string, number>()
      data?.forEach(sale => {
        const productName = (sale as any).products?.name || 'Unknown'
        productMap.set(productName, (productMap.get(productName) || 0) + sale.selling_price)
      })

      const productArray = Array.from(productMap.entries()).map(([product_name, sales]) => ({
        product_name,
        sales
      })).sort((a, b) => b.sales - a.sales) // Sort by highest sales first

      setProductSalesData(productArray)
    } catch (error) {
      console.error('Error fetching product sales data:', error)
    }
  }

  const fetchYearlyData = async () => {
    try {
      const { data } = await supabase
        .from('sales')
        .select('selling_price, date')

      const yearlyMap = new Map<number, number>()
      data?.forEach(sale => {
        const year = new Date(sale.date).getFullYear()
        yearlyMap.set(year, (yearlyMap.get(year) || 0) + sale.selling_price)
      })

      const yearlyArray = Array.from(yearlyMap.entries()).map(([year, sales]) => ({
        year,
        sales
      })).sort((a, b) => a.year - b.year)

      setYearlyData(yearlyArray)
    } catch (error) {
      console.error('Error fetching yearly data:', error)
    }
  }

  const fetchProducts = async () => {
    try {
      const { data } = await supabase
        .from('products')
        .select('id, name')
        .order('name')
      setProducts(data || [])
    } catch (error) {
      console.error('Error fetching products:', error)
    }
  }

  const fetchLoansData = async () => {
    try {
      const { data } = await supabase
        .from('loans')
        .select('loan_amount, paid_amount, customer_name')

      const loansTotal = data?.reduce((sum, loan) => sum + (loan.loan_amount - loan.paid_amount), 0) || 0
      const customersSet = new Set(data?.map(loan => loan.customer_name) || [])
      const customersCount = customersSet.size

      setActiveLoans(loansTotal)
      setCustomersWithLoans(customersCount)
    } catch (error) {
      console.error('Error fetching loans data:', error)
    }
  }

  const downloadCSV = () => {
    const headers = [
      'Customer Name', 
      'Payment Type', 
      'Product Name', 
      'Quantity', 
      'Selling Price', 
      'Base Price', 
      'Profit', 
      'Loan Status', 
      'Paid Amount', 
      'Remaining Balance', 
      'Last Payment Date',
      'Returned Empty', 
      'Sale Date'
    ]
    const csvData = sales.map(sale => [
      sale.customer_name,
      sale.payment_method,
      sale.products?.name || 'Unknown',
      sale.quantity,
      sale.selling_price,
      sale.base_price,
      sale.profit,
      sale.loan_info?.status || 'No Loan',
      sale.loan_info?.paid_amount || '-',
      sale.loan_info?.remaining_balance || '-',
      sale.loan_info?.last_payment_date ? new Date(sale.loan_info.last_payment_date).toLocaleDateString() : '-',
      sale.returned_empty ? 'Yes' : `No (${sale.empty_quantity_not_returned})`,
      new Date(sale.date).toLocaleDateString()
    ])

    const csvContent = [headers, ...csvData].map(row => row.join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    // Generate descriptive filename based on filters
    let filename = 'sales'
    if (selectedProduct !== 'all') {
      const productName = products.find(p => p.id === selectedProduct)?.name || 'unknown'
      filename = `sales-${productName.toLowerCase().replace(/\s+/g, '-')}`
    } else if (filter === 'day') {
      filename = `sales-${new Date(selectedDate.day.year, selectedDate.day.month, selectedDate.day.date).toISOString().split('T')[0]}`
    } else if (filter === 'month') {
      filename = `sales-${monthNames[selectedDate.month.month].toLowerCase()}-${selectedDate.month.year}`
    } else if (filter === 'year') {
      filename = `sales-${selectedDate.year}`
    }
    
    a.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`
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
                <p className="text-lg sm:text-xl lg:text-3xl font-bold text-gray-900">{sales.length}</p>
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

      {/* Product Sales Graph */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-3 sm:p-4 lg:p-6">
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900">Sales per Product</h2>
          <div className="flex items-center space-x-2">
            <div className="w-2 sm:w-3 h-2 sm:h-3 bg-blue-600 rounded-full"></div>
            <span className="text-xs sm:text-sm text-gray-600">Product Performance</span>
          </div>
        </div>
        <div className="h-60 sm:h-72 lg:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={productSalesData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="product_name" 
                tick={{ fill: '#6b7280', fontSize: 10 }}
                axisLine={{ stroke: '#e5e7eb' }}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis 
                tick={{ fill: '#6b7280', fontSize: 10 }}
                axisLine={{ stroke: '#e5e7eb' }}
                tickFormatter={(value) => `₱${value.toLocaleString()}`}
              />
              <Tooltip 
                formatter={(value) => [`₱${(value || 0).toLocaleString()}`, 'Sales']} 
                contentStyle={{ 
                  backgroundColor: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  fontSize: '12px'
                }}
              />
              <Bar dataKey="sales" fill="#2563eb" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Sales */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-b border-gray-100 bg-gray-50 relative">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 sm:gap-4">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">Recent Sales</h2>
              <div className="text-xs sm:text-sm text-gray-500">
                Showing {Math.min(sales.length, 50)} of {sales.length} transactions
              </div>
            </div>
            
            {/* Modern Filters */}
            <div className="flex flex-col lg:flex-row items-start lg:items-center gap-3 sm:gap-4">
              {/* Quick Filter Buttons */}
              <div className="flex flex-wrap items-center gap-1 sm:gap-2">
                <button
                  onClick={() => applyQuickFilter('today')}
                  className={`px-2 py-1 text-xs font-medium rounded-lg transition-all duration-200 ${
                    quickFilterRange === 'today'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Today
                </button>
                <button
                  onClick={() => applyQuickFilter('yesterday')}
                  className={`px-2 py-1 text-xs font-medium rounded-lg transition-all duration-200 ${
                    quickFilterRange === 'yesterday'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Yesterday
                </button>
                <button
                  onClick={() => applyQuickFilter('thisWeek')}
                  className={`px-2 py-1 text-xs font-medium rounded-lg transition-all duration-200 ${
                    quickFilterRange === 'thisWeek'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  This Week
                </button>
                <button
                  onClick={() => applyQuickFilter('thisMonth')}
                  className={`px-2 py-1 text-xs font-medium rounded-lg transition-all duration-200 ${
                    quickFilterRange === 'thisMonth'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  This Month
                </button>
                <button
                  onClick={() => applyQuickFilter('lastMonth')}
                  className={`px-2 py-1 text-xs font-medium rounded-lg transition-all duration-200 ${
                    quickFilterRange === 'lastMonth'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Last Month
                </button>
                <button
                  onClick={() => applyQuickFilter('thisYear')}
                  className={`px-2 py-1 text-xs font-medium rounded-lg transition-all duration-200 ${
                    quickFilterRange === 'thisYear'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  This Year
                </button>
              </div>
              
              {/* Date Navigation */}
              <div className="flex items-center gap-1 sm:gap-2 bg-white border border-gray-200 rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 shadow-sm">
                <button
                  onClick={() => navigateDate('prev')}
                  className="p-1 hover:bg-gray-100 rounded transition-colors"
                >
                  <FiChevronLeft className="w-3 h-3 sm:w-4 sm:h-4 text-gray-600" />
                </button>
                
                {/* Filter Type Toggle */}
                <div className="flex items-center gap-1 border-l border-gray-200 pl-1 sm:pl-2">
                  <button
                    onClick={() => setFilter('day')}
                    className={`px-1 sm:px-2 py-1 text-xs font-medium rounded transition-all duration-200 ${
                      filter === 'day'
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    Day
                  </button>
                  <button
                    onClick={() => setFilter('month')}
                    className={`px-1 sm:px-2 py-1 text-xs font-medium rounded transition-all duration-200 ${
                      filter === 'month'
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    Month
                  </button>
                  <button
                    onClick={() => setFilter('year')}
                    className={`px-1 sm:px-2 py-1 text-xs font-medium rounded transition-all duration-200 ${
                      filter === 'year'
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    Year
                  </button>
                </div>
                
                <div className="flex items-center gap-1 border-l border-gray-200 pl-1 sm:pl-2">
                  <span className="text-xs sm:text-sm font-medium text-gray-900 min-w-[80px] sm:min-w-[120px] text-center">
                    {getMonthYearString()}
                  </span>
                </div>
                
                <button
                  onClick={() => navigateDate('next')}
                  className="p-1 hover:bg-gray-100 rounded transition-colors"
                >
                  <FiChevronRight className="w-3 h-3 sm:w-4 sm:h-4 text-gray-600" />
                </button>
              </div>
              
              {/* Advanced Filters Toggle */}
              <button
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <FiFilter className="w-3 h-3 sm:w-4 sm:h-4 text-gray-600" />
                <span className="text-xs sm:text-sm font-medium text-gray-700 hidden sm:inline">Advanced</span>
                <span className="text-xs font-medium text-gray-700 sm:hidden">Filter</span>
              </button>
              
              {/* Clear Filters */}
              {(quickFilterRange !== null || selectedProduct !== 'all') && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors"
                >
                  <FiX className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span className="text-xs sm:text-sm font-medium hidden sm:inline">Clear</span>
                </button>
              )}
            </div>
            
            {/* Product Filter and Export */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
              {/* Product Filter */}
              <div className="flex items-center gap-2 sm:gap-3">
                <span className="text-xs sm:text-sm text-gray-500">Product:</span>
                <select
                  value={selectedProduct}
                  onChange={(e) => setSelectedProduct(e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black bg-white"
                >
                  <option value="all">All Products</option>
                  {products.map(product => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </div>
              
              <button
                onClick={downloadCSV}
                className="bg-green-600 hover:bg-green-700 text-white px-3 sm:px-6 py-1.5 sm:py-2 rounded-lg flex items-center transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl"
              >
                <FiDownload className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                <span className="text-xs sm:text-sm">Export CSV</span>
              </button>
            </div>
          </div>
        </div>
        
        {/* Advanced Filters Panel */}
        {showAdvancedFilters && (
          <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">Advanced Date Filters</h3>
              <button
                onClick={() => setShowAdvancedFilters(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Day Filter */}
              {filter === 'day' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Select Month</label>
                    <select
                      value={selectedDate.day.month}
                      onChange={(e) => handleDateChange('day', { ...selectedDate.day, month: parseInt(e.target.value) })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {monthNames.map((month, index) => (
                        <option key={month} value={index}>{month}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Select Day</label>
                    <select
                      value={selectedDate.day.date}
                      onChange={(e) => handleDateChange('day', { ...selectedDate.day, date: parseInt(e.target.value) })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {Array.from({ length: getDaysInMonth(selectedDate.day.year, selectedDate.day.month) }, (_, i) => i + 1).map(day => (
                        <option key={day} value={day}>{day}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Select Year</label>
                    <select
                      value={selectedDate.day.year}
                      onChange={(e) => handleDateChange('day', { ...selectedDate.day, year: parseInt(e.target.value) })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {getYearOptions().map(year => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              
              {/* Month Filter */}
              {filter === 'month' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Select Month</label>
                    <select
                      value={selectedDate.month.month}
                      onChange={(e) => handleDateChange('month', { ...selectedDate.month, month: parseInt(e.target.value) })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {monthNames.map((month, index) => (
                        <option key={month} value={index}>{month}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Select Year</label>
                    <select
                      value={selectedDate.month.year}
                      onChange={(e) => handleDateChange('month', { ...selectedDate.month, year: parseInt(e.target.value) })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {getYearOptions().map(year => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              
              {/* Year Filter */}
              {filter === 'year' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Select Year</label>
                  <select
                    value={selectedDate.year}
                    onChange={(e) => handleDateChange('year', parseInt(e.target.value))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {getYearOptions().map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
              )}
              
              {/* Current Selection Display */}
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <h4 className="text-xs font-medium text-gray-700 mb-2">Current Selection</h4>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-gray-900">{getMonthYearString()}</p>
                  <p className="text-xs text-gray-500">
                    {filter === 'day' && 'Daily View'}
                    {filter === 'month' && 'Monthly View'}
                    {filter === 'year' && 'Yearly View'}
                  </p>
                  {sales.length > 0 && (
                    <p className="text-xs text-green-600 font-medium">
                      {sales.length} transactions found
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 sm:px-3 lg:px-6 py-2 sm:py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  <span className="hidden sm:inline">Customer</span>
                  <span className="sm:hidden">Cust</span>
                </th>
                <th className="px-2 sm:px-3 lg:px-6 py-2 sm:py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  <span className="hidden sm:inline">Payment</span>
                  <span className="sm:hidden">Pay</span>
                </th>
                <th className="px-2 sm:px-3 lg:px-6 py-2 sm:py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  <span className="hidden sm:inline">Product</span>
                  <span className="sm:hidden">Prod</span>
                </th>
                <th className="px-2 sm:px-3 lg:px-6 py-2 sm:py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Qty
                </th>
                <th className="px-2 sm:px-3 lg:px-6 py-2 sm:py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  <span className="hidden sm:inline">Price</span>
                  <span className="sm:hidden">$</span>
                </th>
                <th className="hidden sm:table-cell px-3 lg:px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Base
                </th>
                <th className="hidden sm:table-cell px-3 lg:px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Profit
                </th>
                <th className="hidden lg:table-cell px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Loan
                </th>
                <th className="hidden lg:table-cell px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Paid
                </th>
                <th className="hidden lg:table-cell px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Balance
                </th>
                <th className="hidden lg:table-cell px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Last Pay
                </th>
                <th className="hidden md:table-cell px-4 lg:px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  <span className="hidden lg:inline">Returned</span>
                  <span className="lg:hidden">Ret</span>
                </th>
                <th className="px-2 sm:px-3 lg:px-6 py-2 sm:py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {sales.slice(0, 50).map((sale) => (
                <tr key={sale.id} className="hover:bg-gray-50 transition-colors duration-150">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {sale.customer_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      sale.payment_method === 'cash' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {sale.payment_method}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {sale.products?.name || 'Unknown'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {sale.quantity}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    ₱{sale.selling_price.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ₱{sale.base_price.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    ₱{sale.profit.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {sale.loan_info ? (
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        sale.loan_info.status === 'PAID' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {sale.loan_info.status}
                      </span>
                    ) : (
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
                        No Loan
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {sale.loan_info ? `₱${sale.loan_info.paid_amount.toLocaleString()}` : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {sale.loan_info ? `₱${sale.loan_info.remaining_balance.toLocaleString()}` : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {sale.loan_info?.last_payment_date ? new Date(sale.loan_info.last_payment_date).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {sale.returned_empty ? (
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                        Yes
                      </span>
                    ) : (
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                        No ({sale.empty_quantity_not_returned})
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(sale.date).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {sales.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center">
                      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                        <FiTrendingUp className="w-8 h-8 text-gray-400" />
                      </div>
                      <p className="text-gray-500 font-medium">No sales found</p>
                      <p className="text-gray-400 text-sm mt-1">Try adjusting your date filters</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}