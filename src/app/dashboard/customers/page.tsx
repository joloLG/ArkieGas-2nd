'use client'

import { useState, useEffect } from 'react'
import {
  FiUser,
  FiCreditCard,
  FiPackage,
  FiSearch,
  FiX
} from 'react-icons/fi'
import { supabase } from '@/lib/supabase'

interface Loan {
  id: string
  customer_name: string
  product_id: string
  selling_price: number
  base_price: number
  loan_amount: number
  paid_amount: number
  date: string
  products?: { name: string }
}

interface UnreturnedTank {
  id: string
  customer_name: string
  product_id: string
  quantity: number
  date: string
  products?: { name: string }
}

interface CustomerData {
  name: string
  loans: Loan[]
  unreturnedTanks: UnreturnedTank[]
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerData[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [paymentModal, setPaymentModal] = useState<{ loan: Loan | null; amount: number }>({ loan: null, amount: 0 })
  const [returnModal, setReturnModal] = useState<{ tank: UnreturnedTank | null; quantity: number }>({ tank: null, quantity: 0 })
  const [searchQuery, setSearchQuery] = useState('')

  // Filter customers based on search query
  const filteredCustomers = customers.filter(customer => 
    customer.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  useEffect(() => {
    fetchCustomers()
  }, [])

  const fetchCustomers = async () => {
    try {
      // Get customers with loans (show all loans, not just active ones)
      const { data: loansData } = await supabase
        .from('loans')
        .select(`
          *,
          products (name)
        `)
        .order('customer_name')

      // Get customers with unreturned tanks
      const { data: tanksData } = await supabase
        .from('empty_tanks_unreturned')
        .select(`
          *,
          products (name)
        `)
        .order('customer_name')

      // Combine unique customers
      const customerMap = new Map<string, CustomerData>()

      loansData?.forEach(loan => {
        if (!customerMap.has(loan.customer_name)) {
          customerMap.set(loan.customer_name, { name: loan.customer_name, loans: [], unreturnedTanks: [] })
        }
        customerMap.get(loan.customer_name)!.loans.push(loan)
      })

      tanksData?.forEach(tank => {
        if (!customerMap.has(tank.customer_name)) {
          customerMap.set(tank.customer_name, { name: tank.customer_name, loans: [], unreturnedTanks: [] })
        }
        customerMap.get(tank.customer_name)!.unreturnedTanks.push(tank)
      })

      setCustomers(Array.from(customerMap.values()))
    } catch (error) {
      console.error('Error fetching customers:', error)
    } finally {
      setLoading(false)
    }
  }

  const handlePayment = async () => {
    if (!paymentModal.loan) return

    setSaving(true)
    try {
      const newPaidAmount = paymentModal.loan.paid_amount + paymentModal.amount
      const remainingLoan = paymentModal.loan.loan_amount - newPaidAmount

      // Update loan
      const { error: loanError } = await supabase
        .from('loans')
        .update({ paid_amount: newPaidAmount })
        .eq('id', paymentModal.loan.id)

      if (loanError) throw loanError

      // If fully paid, add profit to sales tracking
      if (remainingLoan <= 0) {
        // Find the corresponding sale
        const { data: saleData } = await supabase
          .from('sales')
          .select('*')
          .eq('customer_name', paymentModal.loan.customer_name)
          .eq('product_id', paymentModal.loan.product_id)
          .eq('payment_method', 'full_loan')
          .order('date', { ascending: false })
          .limit(1)

        if (saleData && saleData.length > 0) {
          const profit = (paymentModal.loan.selling_price - paymentModal.loan.base_price) * saleData[0].quantity
          await supabase
            .from('sales')
            .update({ profit })
            .eq('id', saleData[0].id)
        }
      }

      // Add payment to sales tracking as revenue
      await supabase
        .from('sales')
        .insert({
          customer_name: paymentModal.loan.customer_name,
          product_id: paymentModal.loan.product_id,
          quantity: 0, // payment, not new sale
          selling_price: 0,
          payment_method: 'cash', // payment
          payment_value: paymentModal.amount,
          profit: remainingLoan <= 0 ? (paymentModal.loan.selling_price - paymentModal.loan.base_price) : 0,
          returned_empty: false,
          empty_quantity_not_returned: 0
        })

      setPaymentModal({ loan: null, amount: 0 })
      fetchCustomers()
    } catch (error) {
      console.error('Error recording payment:', error)
      alert('Error recording payment')
    } finally {
      setSaving(false)
    }
  }

  const handleReturn = async () => {
    if (!returnModal.tank) return

    setSaving(true)
    try {
      const newQuantity = returnModal.tank.quantity - returnModal.quantity

      if (newQuantity <= 0) {
        // Remove entry
        await supabase
          .from('empty_tanks_unreturned')
          .delete()
          .eq('id', returnModal.tank.id)
      } else {
        // Update quantity
        await supabase
          .from('empty_tanks_unreturned')
          .update({ quantity: newQuantity })
          .eq('id', returnModal.tank.id)
      }

      // Add returned tanks to shop_empty_tanks
      const { data: existingShopTanks } = await supabase
        .from('shop_empty_tanks')
        .select('*')
        .eq('product_id', returnModal.tank.product_id)

      if (existingShopTanks && existingShopTanks.length > 0) {
        // Update existing quantity
        await supabase
          .from('shop_empty_tanks')
          .update({ quantity: existingShopTanks[0].quantity + returnModal.quantity })
          .eq('product_id', returnModal.tank.product_id)
      } else {
        // Insert new entry
        await supabase
          .from('shop_empty_tanks')
          .insert({
            product_id: returnModal.tank.product_id,
            quantity: returnModal.quantity
          })
      }

      setReturnModal({ tank: null, quantity: 0 })
      fetchCustomers()
    } catch (error) {
      console.error('Error recording return:', error)
      alert('Error recording return')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading customers...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-8 text-white shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
          <div className="mb-6 lg:mb-0">
            <h1 className="text-3xl font-bold mb-2">Customer Management</h1>
            <p className="text-purple-100 text-lg">Manage customers with active loans and unreturned tanks</p>
          </div>
          
          {/* Search Bar */}
          <div className="w-full lg:w-96">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <FiSearch className="h-5 w-5 text-purple-300" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search customers by name..."
                className="block w-full pl-10 pr-3 py-3 border border-purple-300/50 bg-white/10 backdrop-blur-sm text-white placeholder-purple-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-transparent transition-all duration-200"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-purple-300 hover:text-white transition-colors duration-200"
                >
                  <FiX className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        </div>
        
        <div className="mt-6 flex items-center space-x-6">
          <div className="bg-white/20 backdrop-blur-sm rounded-lg px-4 py-2">
            <p className="text-sm text-purple-100">Total Customers</p>
            <p className="text-white font-semibold">{filteredCustomers.length}</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-lg px-4 py-2">
            <p className="text-sm text-purple-100">Active Loans</p>
            <p className="text-white font-semibold">
              {filteredCustomers.reduce((sum: number, c: CustomerData) => sum + c.loans.filter((loan: Loan) => loan.loan_amount > loan.paid_amount).length, 0)}
            </p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-lg px-4 py-2">
            <p className="text-sm text-purple-100">Unreturned Tanks</p>
            <p className="text-white font-semibold">
              {filteredCustomers.reduce((sum: number, c: CustomerData) => sum + c.unreturnedTanks.reduce((sum: number, t: UnreturnedTank) => sum + t.quantity, 0), 0)}
            </p>
          </div>
        </div>
      </div>

      {filteredCustomers.length === 0 ? (
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-12">
          <div className="text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FiSearch className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {searchQuery ? 'No customers found' : 'No customers found'}
            </h3>
            <p className="text-gray-600">
              {searchQuery 
                ? `No customers found matching "${searchQuery}". Try a different search term.`
                : 'There are currently no customers with active loans or unreturned tanks.'
              }
            </p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors duration-200"
              >
                Clear Search
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredCustomers.map((customer) => (
            <div key={customer.name} className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden hover:shadow-xl transition-all duration-300">
              {/* Customer Header */}
              <div className="bg-gradient-to-r from-purple-50 to-indigo-50 px-6 py-4 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                      <FiUser className="w-6 h-6 text-white" />
                    </div>
                    <div className="ml-4">
                      <h2 className="text-xl font-bold text-gray-900">{customer.name}</h2>
                      <p className="text-sm text-gray-600">
                        {customer.loans.filter((loan: Loan) => loan.loan_amount > loan.paid_amount).length} active loans • 
                        {customer.unreturnedTanks.reduce((sum: number, t: UnreturnedTank) => sum + t.quantity, 0)} unreturned tanks
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {customer.loans.filter((loan: Loan) => loan.loan_amount > loan.paid_amount).length > 0 && (
                      <span className="px-3 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full">
                        Active Loans
                      </span>
                    )}
                    {customer.unreturnedTanks.length > 0 && (
                      <span className="px-3 py-1 bg-orange-100 text-orange-800 text-xs font-medium rounded-full">
                        Tanks Pending
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-6">
                {/* Loans Section */}
                {customer.loans.length > 0 && (
                  <div className="mb-8">
                    <div className="flex items-center mb-4">
                      <div className="p-2 bg-blue-100 rounded-lg mr-3">
                        <FiCreditCard className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">Loan History</h3>
                        <p className="text-sm text-gray-600">
                          {customer.loans.filter(loan => loan.loan_amount > loan.paid_amount).length} active, 
                          {customer.loans.filter(loan => loan.loan_amount <= loan.paid_amount).length} paid
                        </p>
                      </div>
                    </div>
                    
                    <div className="grid gap-4">
                      {customer.loans.map((loan) => {
                        const remainingAmount = loan.loan_amount - loan.paid_amount
                        const isPaidOff = remainingAmount <= 0
                        const progressPercentage = (loan.paid_amount / loan.loan_amount) * 100
                        
                        return (
                          <div key={loan.id} className={`border rounded-xl p-5 transition-all duration-200 ${
                            isPaidOff 
                              ? 'border-green-200 bg-gradient-to-r from-green-50 to-emerald-50' 
                              : 'border-gray-200 bg-white hover:shadow-md'
                          }`}>
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className="flex items-center mb-3">
                                  <p className="font-semibold text-gray-900 text-lg">{loan.products?.name || 'Unknown Product'}</p>
                                  {isPaidOff && (
                                    <span className="ml-3 px-3 py-1 text-xs font-semibold text-green-700 bg-green-100 rounded-full">
                                      ✓ PAID
                                    </span>
                                  )}
                                </div>
                                
                                {/* Progress Bar */}
                                <div className="mb-4">
                                  <div className="flex justify-between items-center mb-2">
                                    <span className="text-sm text-gray-600">Payment Progress</span>
                                    <span className="text-sm font-medium text-gray-900">{progressPercentage.toFixed(1)}%</span>
                                  </div>
                                  <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div 
                                      className={`h-2 rounded-full transition-all duration-500 ${
                                        isPaidOff ? 'bg-green-500' : 'bg-blue-500'
                                      }`}
                                      style={{ width: `${Math.min(progressPercentage, 100)}%` }}
                                    ></div>
                                  </div>
                                </div>
                                
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                  <div>
                                    <p className="text-xs text-gray-500 mb-1">Selling Price</p>
                                    <p className="text-sm font-semibold text-gray-900">₱{loan.selling_price.toLocaleString()}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-500 mb-1">Loan Amount</p>
                                    <p className="text-sm font-semibold text-gray-900">₱{loan.loan_amount.toLocaleString()}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-500 mb-1">Paid Amount</p>
                                    <p className="text-sm font-semibold text-green-600">₱{loan.paid_amount.toLocaleString()}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-500 mb-1">Remaining</p>
                                    <p className={`text-sm font-bold ${isPaidOff ? 'text-green-600' : 'text-red-600'}`}>
                                      ₱{remainingAmount.toLocaleString()}
                                    </p>
                                  </div>
                                </div>
                                
                                <p className="text-xs text-gray-500 mt-3">
                                  Loan Date: {new Date(loan.date).toLocaleDateString()}
                                </p>
                              </div>
                              
                              {!isPaidOff && (
                                <button
                                  onClick={() => setPaymentModal({ loan, amount: 0 })}
                                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 transform hover:scale-105 shadow-md hover:shadow-lg ml-4"
                                >
                                  Record Payment
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Unreturned Tanks Section */}
                {customer.unreturnedTanks.length > 0 && (
                  <div>
                    <div className="flex items-center mb-4">
                      <div className="p-2 bg-orange-100 rounded-lg mr-3">
                        <FiPackage className="w-5 h-5 text-orange-600" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">Unreturned Empty Tanks</h3>
                        <p className="text-sm text-gray-600">
                          {customer.unreturnedTanks.reduce((sum: number, t: UnreturnedTank) => sum + t.quantity, 0)} tanks to be returned
                        </p>
                      </div>
                    </div>
                    
                    <div className="grid gap-4">
                      {customer.unreturnedTanks.map((tank: UnreturnedTank) => (
                        <div key={tank.id} className="border border-gray-200 rounded-xl p-5 bg-white hover:shadow-md transition-all duration-200">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center mb-3">
                                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center mr-3">
                                  <FiPackage className="w-5 h-5 text-orange-600" />
                                </div>
                                <div>
                                  <p className="font-semibold text-gray-900 text-lg">{tank.products?.name || 'Unknown Product'}</p>
                                  <p className="text-sm text-gray-600">Quantity: {tank.quantity}</p>
                                </div>
                              </div>
                              
                              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-3">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium text-orange-800">Pending Return</span>
                                  <span className="text-lg font-bold text-orange-900">{tank.quantity} tanks</span>
                                </div>
                              </div>
                              
                              <p className="text-xs text-gray-500">
                                Transaction Date: {new Date(tank.date).toLocaleDateString()}
                              </p>
                            </div>
                            
                            <button
                              onClick={() => setReturnModal({ tank, quantity: 0 })}
                              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 transform hover:scale-105 shadow-md hover:shadow-lg ml-4"
                            >
                              Record Return
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Payment Modal */}
      {paymentModal.loan && (
        <div className="fixed inset-0 bg-black/10 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full transform transition-all duration-300 scale-100">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 rounded-t-2xl">
              <h3 className="text-xl font-bold text-white">Record Payment</h3>
              <p className="text-blue-100 text-sm mt-1">{paymentModal.loan.customer_name}</p>
            </div>
            
            <div className="p-6">
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Product</p>
                  <p className="font-semibold text-gray-900">{paymentModal.loan.products?.name}</p>
                </div>
                
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-sm text-blue-600 mb-1">Remaining Loan</p>
                  <p className="text-xl font-bold text-blue-900">
                    ₱{(paymentModal.loan.loan_amount - paymentModal.loan.paid_amount).toLocaleString()}
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Payment Amount</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">₱</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={paymentModal.loan.loan_amount - paymentModal.loan.paid_amount}
                      value={paymentModal.amount}
                      onChange={(e) => setPaymentModal({ ...paymentModal, amount: parseFloat(e.target.value) || 0 })}
                      className="block w-full border border-gray-300 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 text-black placeholder-gray-500"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setPaymentModal({ loan: null, amount: 0 })}
                  className="px-6 py-3 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 transition-colors duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePayment}
                  disabled={saving || paymentModal.amount <= 0}
                  className="px-6 py-3 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2 inline-block"></div>
                      Recording...
                    </>
                  ) : (
                    'Record Payment'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Return Modal */}
      {returnModal.tank && (
        <div className="fixed inset-0 bg-black/10 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full transform transition-all duration-300 scale-100">
            <div className="bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-4 rounded-t-2xl">
              <h3 className="text-xl font-bold text-white">Record Tank Return</h3>
              <p className="text-green-100 text-sm mt-1">{returnModal.tank.customer_name}</p>
            </div>
            
            <div className="p-6">
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Product</p>
                  <p className="font-semibold text-gray-900">{returnModal.tank.products?.name}</p>
                </div>
                
                <div className="bg-orange-50 rounded-lg p-4">
                  <p className="text-sm text-orange-600 mb-1">Unreturned Quantity</p>
                  <p className="text-xl font-bold text-orange-900">{returnModal.tank.quantity} tanks</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Return Quantity</label>
                  <input
                    type="number"
                    min="1"
                    max={returnModal.tank.quantity}
                    value={returnModal.quantity}
                    onChange={(e) => setReturnModal({ ...returnModal, quantity: parseInt(e.target.value) || 0 })}
                    className="block w-full border border-gray-300 rounded-lg shadow-sm py-3 px-3 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 text-lg text-black placeholder-gray-500"
                    placeholder="Enter quantity"
                  />
                  {returnModal.quantity > 0 && (
                    <p className="text-sm text-green-600 mt-2">
                      {returnModal.quantity} of {returnModal.tank.quantity} tanks will be marked as returned
                    </p>
                  )}
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setReturnModal({ tank: null, quantity: 0 })}
                  className="px-6 py-3 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 transition-colors duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReturn}
                  disabled={saving || returnModal.quantity <= 0}
                  className="px-6 py-3 text-sm font-medium text-white bg-green-600 border border-transparent rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2 inline-block"></div>
                      Recording...
                    </>
                  ) : (
                    'Record Return'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
