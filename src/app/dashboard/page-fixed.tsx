'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  FiDollarSign,
  FiPackage,
  FiCreditCard,
  FiUsers,
  FiPlus,
  FiTrendingUp,
  FiArchive,
  FiUserCheck
} from 'react-icons/fi'
import { supabase } from '@/lib/supabase'
import { generateFinancialSummary } from '@/lib/calculations'

interface DashboardData {
  totalSales: number
  totalInventory: number
  totalProducts: number
  activeLoans: number
  customersWithLoans: number
  unreturnedTanks: number
  totalProfit: number
  totalTransactions: number
  uniqueCustomers: number
}

export default function DashboardPageFixed() {
  const [data, setData] = useState<DashboardData>({
    totalSales: 0,
    totalInventory: 0,
    totalProducts: 0,
    activeLoans: 0,
    customersWithLoans: 0,
    unreturnedTanks: 0,
    totalProfit: 0,
    totalTransactions: 0,
    uniqueCustomers: 0
  })
  const [, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      // Get current month dates
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)

      // Fetch all necessary data using standardized approach
      const [
        transactionsResult,
        profitResult,
        loansResult,
        productsResult,
        unreturnedResult
      ] = await Promise.all([
        // Get transactions for current month
        supabase
          .from('transactions')
          .select('*')
          .gte('date', startOfMonth.toISOString())
          .lte('date', endOfMonth.toISOString()),
        
        // Get profit records for current month
        supabase
          .from('profit_tracking')
          .select('*')
          .gte('recognized_at', startOfMonth.toISOString())
          .lte('recognized_at', endOfMonth.toISOString()),
        
        // Get all loans for active loan calculation
        supabase
          .from('loans')
          .select('id, loan_amount, paid_amount, customer_name'),
        
        // Get products for inventory
        supabase
          .from('products')
          .select('stocks'),
        
        // Get unreturned tanks
        supabase
          .from('empty_tanks_unreturned')
          .select('quantity')
      ])

      // Use standardized financial summary calculation
      const financialSummary = generateFinancialSummary(
        transactionsResult.data || [],
        profitResult.data || [],
        loansResult.data || [],
        now
      )

      // Calculate inventory totals
      const totalInventory = productsResult.data?.reduce((sum, product) => sum + product.stocks, 0) || 0
      const totalProducts = productsResult.data?.length || 0

      // Calculate unreturned tanks
      const unreturnedTanks = unreturnedResult.data?.reduce((sum, tank) => sum + tank.quantity, 0) || 0

      setData({
        totalSales: financialSummary.totalSales,
        totalProfit: financialSummary.totalProfit,
        totalTransactions: financialSummary.totalTransactions,
        uniqueCustomers: financialSummary.uniqueCustomers,
        activeLoans: financialSummary.activeLoans,
        customersWithLoans: financialSummary.customersWithLoans,
        totalInventory,
        totalProducts,
        unreturnedTanks
      })
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const cards = [
    {
      title: 'Total Sales (This Month)',
      value: `₱${data.totalSales.toLocaleString()}`,
      icon: FiDollarSign,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50'
    },
    {
      title: 'Total Profit (This Month)',
      value: `₱${data.totalProfit.toLocaleString()}`,
      icon: FiTrendingUp,
      color: 'text-green-600',
      bgColor: 'bg-green-50'
    },
    {
      title: 'Total Transactions',
      value: data.totalTransactions,
      icon: FiPackage,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50'
    },
    {
      title: 'Active Loans',
      value: `₱${data.activeLoans.toLocaleString()}`,
      icon: FiCreditCard,
      color: 'text-red-600',
      bgColor: 'bg-red-50'
    },
    {
      title: 'Customers with Loans',
      value: data.customersWithLoans,
      icon: FiUsers,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50'
    },
    {
      title: 'Total Products',
      value: data.totalProducts,
      icon: FiArchive,
      color: 'text-green-600',
      bgColor: 'bg-green-50'
    },
    {
      title: 'Total Inventory',
      value: `${data.totalInventory} units`,
      icon: FiPackage,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50'
    },
    {
      title: 'Unreturned Empty Tanks',
      value: data.unreturnedTanks,
      icon: FiUserCheck,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50'
    }
  ]

  const shortcuts = [
    { name: 'Record Products', href: '/dashboard/products', icon: FiPlus, color: 'text-blue-600' },
    { name: 'Record Sales', href: '/dashboard/record-sales', icon: FiTrendingUp, color: 'text-orange-600' },
    { name: 'Track Inventory', href: '/dashboard/inventory', icon: FiPackage, color: 'text-green-600' },
    { name: 'Customer List', href: '/dashboard/customers', icon: FiUsers, color: 'text-purple-600' }
  ]

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="bg-linear-to-r from-blue-600 to-indigo-600 rounded-2xl p-8 text-white shadow-xl">
        <div className="max-w-4xl">
          <h1 className="text-3xl font-bold mb-2">Main Dashboard (Fixed)</h1>
          <p className="text-blue-100 text-lg">Overview of your gasul inventory and sales performance with standardized calculations</p>
          <div className="mt-6 flex items-center space-x-4">
            <div className="bg-white/20 backdrop-blur-sm rounded-lg px-4 py-2">
              <p className="text-sm text-blue-100">Last Updated</p>
              <p className="text-white font-semibold">{new Date().toLocaleDateString()}</p>
            </div>
            <div className="bg-white/20 backdrop-blur-sm rounded-lg px-4 py-2">
              <p className="text-sm text-blue-100">Calculation Status</p>
              <p className="text-white font-semibold">Standardized ✅</p>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card, index) => (
          <div key={index} className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className={`p-4 rounded-xl ${card.bgColor} shadow-sm`}>
                  <card.icon className={`w-7 h-7 ${card.color}`} />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600 mb-1">{card.title}</p>
                  <p className="text-3xl font-bold text-gray-900">{card.value}</p>
                </div>
              </div>
              <div className={`p-2 rounded-lg ${card.bgColor} opacity-50`}>
                <card.icon className={`w-4 h-4 ${card.color}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions Section */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Quick Actions</h2>
          <p className="text-gray-600">Access frequently used features and tools</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {shortcuts.map((shortcut, index) => (
            <Link
              key={index}
              href={shortcut.href}
              className="group bg-linear-to-br from-gray-50 to-gray-100 rounded-xl p-6 hover:from-blue-50 hover:to-indigo-50 transition-all duration-300 border border-gray-200 hover:border-blue-300 hover:shadow-lg transform hover:-translate-y-1"
            >
              <div className="flex flex-col items-center text-center">
                <div className={`p-3 rounded-xl bg-white shadow-sm mb-4 group-hover:shadow-md transition-shadow duration-300`}>
                  <shortcut.icon className={`w-8 h-8 ${shortcut.color}`} />
                </div>
                <span className="text-sm font-semibold text-gray-900 group-hover:text-blue-700 transition-colors duration-300">
                  {shortcut.name}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Additional Insights Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Business Insights</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
              <div className="flex items-center">
                <div className="p-2 bg-blue-100 rounded-lg mr-3">
                  <FiTrendingUp className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Monthly Performance</p>
                  <p className="text-xs text-gray-600">Track your sales trends</p>
                </div>
              </div>
              <Link href="/dashboard/sales-tracking" className="text-blue-600 hover:text-blue-700 font-medium text-sm">
                View Details →
              </Link>
            </div>
            
            <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
              <div className="flex items-center">
                <div className="p-2 bg-green-100 rounded-lg mr-3">
                  <FiPackage className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Inventory Status</p>
                  <p className="text-xs text-gray-600">Monitor stock levels</p>
                </div>
              </div>
              <Link href="/dashboard/inventory" className="text-green-600 hover:text-green-700 font-medium text-sm">
                Manage →
              </Link>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Customer Management</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-purple-50 rounded-lg">
              <div className="flex items-center">
                <div className="p-2 bg-purple-100 rounded-lg mr-3">
                  <FiUsers className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Active Loans</p>
                  <p className="text-xs text-gray-600">{data.customersWithLoans} customers with active loans</p>
                </div>
              </div>
              <Link href="/dashboard/customers" className="text-purple-600 hover:text-purple-700 font-medium text-sm">
                Manage →
              </Link>
            </div>
            
            <div className="flex items-center justify-between p-4 bg-orange-50 rounded-lg">
              <div className="flex items-center">
                <div className="p-2 bg-orange-100 rounded-lg mr-3">
                  <FiArchive className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Unreturned Tanks</p>
                  <p className="text-xs text-gray-600">{data.unreturnedTanks} tanks to track</p>
                </div>
              </div>
              <Link href="/dashboard/customers" className="text-orange-600 hover:text-orange-700 font-medium text-sm">
                Track →
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Calculation Method Notice */}
      <div className="bg-green-50 border border-green-200 rounded-xl p-6">
        <div className="flex items-center">
          <div className="p-2 bg-green-100 rounded-lg mr-3">
            <FiTrendingUp className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-green-900">Standardized Calculations Active</h4>
            <p className="text-xs text-green-700 mt-1">
              This dashboard now uses standardized calculation functions to ensure consistent profit, sales, and loan tracking across the entire system.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
