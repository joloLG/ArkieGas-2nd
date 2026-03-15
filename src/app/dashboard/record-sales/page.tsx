'use client'

import { useState, useEffect } from 'react'
import { FiShoppingCart, FiPlus, FiX, FiPackage } from 'react-icons/fi'
import { supabase } from '@/lib/supabase'

interface Product {
  id: string
  name: string
  base_price: number
  stocks: number
  image_url?: string
}

interface CustomerBulkSale {
  id: string
  customer_name: string
  product_id: string
  quantity: number
  selling_price: number
  payment_method: 'cash' | 'full_loan' | 'partial_loan'
  payment_value: number
  returned_empty: 'yes' | 'no'
  empty_quantity_not_returned: number
}

export default function RecordSalesPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [formData, setFormData] = useState({
    customer_name: '',
    selling_price: 0,
    payment_method: 'cash',
    payment_value: 0,
    quantity: 1,
    returned_empty: 'no',
    empty_quantity_not_returned: 0
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [bulkModalOpen, setBulkModalOpen] = useState(false)
  const [bulkSaving, setBulkSaving] = useState(false)
  const [customerBulkSales, setCustomerBulkSales] = useState<CustomerBulkSale[]>([])

  useEffect(() => {
    fetchProducts()
  }, [])

  const fetchProducts = async () => {
    try {
      const { data } = await supabase
        .from('products')
        .select('*')
        .order('name')
      setProducts(data || [])
    } catch (error) {
      console.error('Error fetching products:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleProductSelect = (product: Product) => {
    setSelectedProduct(product)
    setFormData({
      ...formData,
      selling_price: product.base_price // default to base price
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedProduct) return

    if (formData.quantity > selectedProduct.stocks) {
      alert('Not enough stock available')
      return
    }

    setSaving(true)

    try {
      const profit = (formData.selling_price - selectedProduct.base_price) * formData.quantity
      let loan_amount = 0
      let payment_value = 0

      if (formData.payment_method === 'partial_loan') {
        loan_amount = (formData.selling_price * formData.quantity) - formData.payment_value
        payment_value = formData.payment_value
      } else if (formData.payment_method === 'full_loan') {
        loan_amount = formData.selling_price * formData.quantity
        payment_value = 0
      } else {
        payment_value = formData.selling_price * formData.quantity
      }

      // Insert sale
      const { data: saleData, error: saleError } = await supabase
        .from('sales')
        .insert({
          customer_name: formData.customer_name,
          product_id: selectedProduct.id,
          quantity: formData.quantity,
          selling_price: formData.selling_price,
          payment_method: formData.payment_method,
          payment_value: payment_value,
          profit: formData.payment_method === 'cash' ? profit : 0,
          returned_empty: formData.returned_empty === 'yes',
          empty_quantity_not_returned: formData.returned_empty === 'no' ? formData.empty_quantity_not_returned : 0
        })
        .select()
        .single()

      if (saleError) throw saleError

      // Update product stocks
      const { error: stockError } = await supabase
        .from('products')
        .update({ stocks: selectedProduct.stocks - formData.quantity })
        .eq('id', selectedProduct.id)

      if (stockError) throw stockError

      // Handle loans
      if (formData.payment_method === 'full_loan' || formData.payment_method === 'partial_loan') {
        const { error: loanError } = await supabase
          .from('loans')
          .insert({
            customer_name: formData.customer_name,
            product_id: selectedProduct.id,
            selling_price: formData.selling_price,
            base_price: selectedProduct.base_price,
            loan_amount: loan_amount,
            paid_amount: 0 // Always start with 0 for new loans
          })

        if (loanError) throw loanError
      }

      // Handle empty tanks
      if (formData.returned_empty === 'yes') {
        // Remove from unreturned if exists
        const { data: unreturned } = await supabase
          .from('empty_tanks_unreturned')
          .select('*')
          .eq('customer_name', formData.customer_name)
          .eq('product_id', selectedProduct.id)

        if (unreturned && unreturned.length > 0) {
          const current = unreturned[0].quantity
          if (current <= formData.quantity) {
            // Remove entry
            await supabase
              .from('empty_tanks_unreturned')
              .delete()
              .eq('id', unreturned[0].id)
          } else {
            // Update quantity
            await supabase
              .from('empty_tanks_unreturned')
              .update({ quantity: current - formData.quantity })
              .eq('id', unreturned[0].id)
          }
        }

        // Add returned tanks to shop_empty_tanks
        const { data: existingShopTanks } = await supabase
          .from('shop_empty_tanks')
          .select('*')
          .eq('product_id', selectedProduct.id)

        if (existingShopTanks && existingShopTanks.length > 0) {
          // Update existing quantity
          await supabase
            .from('shop_empty_tanks')
            .update({ quantity: existingShopTanks[0].quantity + formData.quantity })
            .eq('product_id', selectedProduct.id)
        } else {
          // Insert new entry
          await supabase
            .from('shop_empty_tanks')
            .insert({
              product_id: selectedProduct.id,
              quantity: formData.quantity
            })
        }
      } else {
        // Add to unreturned
        const { data: existing } = await supabase
          .from('empty_tanks_unreturned')
          .select('*')
          .eq('customer_name', formData.customer_name)
          .eq('product_id', selectedProduct.id)

        if (existing && existing.length > 0) {
          // Update
          await supabase
            .from('empty_tanks_unreturned')
            .update({ quantity: existing[0].quantity + formData.empty_quantity_not_returned })
            .eq('id', existing[0].id)
        } else {
          // Insert
          await supabase
            .from('empty_tanks_unreturned')
            .insert({
              customer_name: formData.customer_name,
              product_id: selectedProduct.id,
              quantity: formData.empty_quantity_not_returned
            })
        }
      }

      // Reset form
      setSelectedProduct(null)
      setFormData({
        customer_name: '',
        selling_price: 0,
        payment_method: 'cash',
        payment_value: 0,
        quantity: 1,
        returned_empty: 'no',
        empty_quantity_not_returned: 0
      })

      alert('Sale recorded successfully!')
      fetchProducts() // Refresh products for stock update
    } catch (error) {
      console.error('Error recording sale:', error)
      alert('Error recording sale')
    } finally {
      setSaving(false)
    }
  }

  // Bulk Sales Functions for Multiple Customers
  const addCustomerRow = () => {
    const newCustomer: CustomerBulkSale = {
      id: Date.now().toString(),
      customer_name: '',
      product_id: '',
      quantity: 1,
      selling_price: 0,
      payment_method: 'cash',
      payment_value: 0,
      returned_empty: 'yes',
      empty_quantity_not_returned: 0
    }
    setCustomerBulkSales([...customerBulkSales, newCustomer])
  }

  const removeCustomerRow = (id: string) => {
    setCustomerBulkSales(customerBulkSales.filter(customer => customer.id !== id))
  }

  const updateCustomerRow = (id: string, field: keyof CustomerBulkSale, value: any) => {
    setCustomerBulkSales(customerBulkSales.map(customer => 
      customer.id === id ? { ...customer, [field]: value } : customer
    ))
  }

  const handleBulkSubmit = async () => {
    // Validate all customer rows
    for (const customer of customerBulkSales) {
      if (!customer.customer_name || !customer.product_id || customer.quantity <= 0 || customer.selling_price <= 0) {
        alert('Please fill in all required fields for each customer')
        return
      }

      const product = products.find(p => p.id === customer.product_id)
      if (!product || customer.quantity > product.stocks) {
        alert(`Not enough stock for ${product?.name || 'selected product'} for customer ${customer.customer_name}`)
        return
      }
    }

    setBulkSaving(true)

    try {
      for (const customer of customerBulkSales) {
        const product = products.find(p => p.id === customer.product_id)!
        const profit = (customer.selling_price - product.base_price) * customer.quantity
        let loan_amount = 0
        let payment_value = 0

        if (customer.payment_method === 'partial_loan') {
          loan_amount = (customer.selling_price * customer.quantity) - customer.payment_value
          payment_value = customer.payment_value
        } else if (customer.payment_method === 'full_loan') {
          loan_amount = customer.selling_price * customer.quantity
          payment_value = 0
        } else {
          payment_value = customer.selling_price * customer.quantity
        }

        // Insert sale
        await supabase
          .from('sales')
          .insert({
            customer_name: customer.customer_name,
            product_id: customer.product_id,
            quantity: customer.quantity,
            selling_price: customer.selling_price,
            payment_method: customer.payment_method,
            payment_value: payment_value,
            profit: customer.payment_method === 'cash' ? profit : 0,
            returned_empty: customer.returned_empty === 'yes',
            empty_quantity_not_returned: customer.returned_empty === 'no' ? customer.empty_quantity_not_returned : 0
          })

        // Update product stocks
        await supabase
          .from('products')
          .update({ stocks: product.stocks - customer.quantity })
          .eq('id', customer.product_id)

        // Handle loans
        if (customer.payment_method === 'full_loan' || customer.payment_method === 'partial_loan') {
          await supabase
            .from('loans')
            .insert({
              customer_name: customer.customer_name,
              product_id: customer.product_id,
              selling_price: customer.selling_price,
              base_price: product.base_price,
              loan_amount: loan_amount,
              paid_amount: 0 // Always start with 0 for new loans
            })
        }

        // Handle empty tanks
        if (customer.returned_empty === 'yes') {
          // Remove from unreturned if exists
          const { data: unreturned } = await supabase
            .from('empty_tanks_unreturned')
            .select('*')
            .eq('customer_name', customer.customer_name)
            .eq('product_id', customer.product_id)

          if (unreturned && unreturned.length > 0) {
            const current = unreturned[0].quantity
            if (current <= customer.quantity) {
              // Remove entry
              await supabase
                .from('empty_tanks_unreturned')
                .delete()
                .eq('id', unreturned[0].id)
            } else {
              // Update quantity
              await supabase
                .from('empty_tanks_unreturned')
                .update({ quantity: current - customer.quantity })
                .eq('id', unreturned[0].id)
            }
          }

          // Add returned tanks to shop_empty_tanks
          const { data: existingShopTanks } = await supabase
            .from('shop_empty_tanks')
            .select('*')
            .eq('product_id', customer.product_id)

          if (existingShopTanks && existingShopTanks.length > 0) {
            // Update existing quantity
            await supabase
              .from('shop_empty_tanks')
              .update({ quantity: existingShopTanks[0].quantity + customer.quantity })
              .eq('product_id', customer.product_id)
          } else {
            // Insert new entry
            await supabase
              .from('shop_empty_tanks')
              .insert({
                product_id: customer.product_id,
                quantity: customer.quantity
              })
          }
        } else {
          // Add to unreturned
          const { data: existing } = await supabase
            .from('empty_tanks_unreturned')
            .select('*')
            .eq('customer_name', customer.customer_name)
            .eq('product_id', customer.product_id)

          if (existing && existing.length > 0) {
            // Update
            await supabase
              .from('empty_tanks_unreturned')
              .update({ quantity: existing[0].quantity + customer.empty_quantity_not_returned })
              .eq('id', existing[0].id)
          } else {
            // Insert
            await supabase
              .from('empty_tanks_unreturned')
              .insert({
                customer_name: customer.customer_name,
                product_id: customer.product_id,
                quantity: customer.empty_quantity_not_returned
              })
          }
        }
      }

      // Reset form
      setCustomerBulkSales([])
      setBulkModalOpen(false)

      alert('Bulk sales recorded successfully!')
      fetchProducts() // Refresh products for stock update
    } catch (error) {
      console.error('Error recording bulk sales:', error)
      alert('Error recording bulk sales')
    } finally {
      setBulkSaving(false)
    }
  }

  const calculateBulkTotal = () => {
    return customerBulkSales.reduce((total, customer) => {
      return total + (customer.selling_price * customer.quantity)
    }, 0)
  }

  if (loading) {
    return <div className="text-center py-8">Loading products...</div>
  }

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="bg-gradient-to-r from-orange-600 to-red-600 rounded-2xl p-8 text-white shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
          <div className="mb-6 lg:mb-0">
            <h1 className="text-3xl font-bold mb-2">Record Sales</h1>
            <p className="text-orange-100 text-lg">Process new sales transactions efficiently</p>
          </div>
          
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setBulkModalOpen(true)}
              className="bg-white text-orange-600 px-6 py-3 rounded-xl font-semibold hover:bg-orange-50 transition-all duration-200 transform hover:scale-105 shadow-lg flex items-center"
            >
              <FiPlus className="w-5 h-5 mr-2" />
              Record Bulk Sales
            </button>
            <div className="bg-white/20 backdrop-blur-sm rounded-lg px-4 py-2">
              <p className="text-sm text-orange-100">Today's Sales</p>
              <p className="text-white font-semibold">{products.length} products</p>
            </div>
          </div>
        </div>
      </div>

      {!selectedProduct ? (
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FiShoppingCart className="w-8 h-8 text-orange-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Select Product</h2>
            <p className="text-gray-600">Choose a product to start recording a sale</p>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map((product) => (
              <button
                key={product.id}
                onClick={() => handleProductSelect(product)}
                disabled={product.stocks === 0}
                className="group bg-white border border-gray-200 rounded-xl p-6 hover:shadow-xl hover:border-orange-300 transition-all duration-300 transform hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="text-center">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="w-16 h-16 rounded-xl object-cover mx-auto mb-4 shadow-sm group-hover:shadow-md transition-shadow duration-300"
                    />
                  ) : (
                    <div className="w-16 h-16 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                      <FiShoppingCart className="w-8 h-8 text-gray-400" />
                    </div>
                  )}
                  <div>
                    <h3 className="font-bold text-gray-900 text-lg mb-2">{product.name}</h3>
                    <div className="space-y-1">
                      <p className="text-sm text-gray-600">Base Price: <span className="font-semibold text-gray-900">₱{product.base_price.toLocaleString()}</span></p>
                      <div className="flex justify-center">
                        <span className="text-sm text-gray-600">Stock: </span>
                        <span className={`text-sm font-bold px-2 py-1 rounded-lg ${
                          product.stocks === 0 
                            ? 'bg-red-100 text-red-800' 
                            : product.stocks <= 10 
                              ? 'bg-yellow-100 text-yellow-800' 
                              : 'bg-green-100 text-green-800'
                        }`}>
                          {product.stocks}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
          
          {products.length === 0 && (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FiShoppingCart className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Products Available</h3>
              <p className="text-gray-600">Add products to the inventory first.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
          {/* Selected Product Header */}
          <div className="bg-gradient-to-r from-orange-50 to-red-50 px-6 py-4 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                {selectedProduct.image_url ? (
                  <img
                    src={selectedProduct.image_url}
                    alt={selectedProduct.name}
                    className="w-14 h-14 rounded-xl object-cover mr-4 shadow-sm"
                  />
                ) : (
                  <div className="w-14 h-14 bg-gray-200 rounded-xl flex items-center justify-center mr-4">
                    <FiShoppingCart className="w-7 h-7 text-gray-600" />
                  </div>
                )}
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{selectedProduct.name}</h3>
                  <div className="flex items-center space-x-4 mt-1">
                    <span className="text-sm text-gray-600">Base Price: <span className="font-semibold text-gray-900">₱{selectedProduct.base_price.toLocaleString()}</span></span>
                    <span className={`text-sm font-bold px-2 py-1 rounded-lg ${
                      selectedProduct.stocks <= 10 
                        ? 'bg-yellow-100 text-yellow-800' 
                        : 'bg-green-100 text-green-800'
                    }`}>
                      Stock: {selectedProduct.stocks}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedProduct(null)}
                className="text-gray-500 hover:text-gray-700 p-2 rounded-lg hover:bg-gray-100 transition-colors duration-200"
              >
                Change Product
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Customer Name</label>
                <input
                  type="text"
                  required
                  value={formData.customer_name}
                  onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                  className="block w-full border border-gray-300 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all duration-200 text-black placeholder-gray-500"
                  placeholder="Enter customer name"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Selling Price (per unit)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">₱</span>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.selling_price}
                    onChange={(e) => setFormData({ ...formData, selling_price: parseFloat(e.target.value) })}
                    className="pl-8 block w-full border border-gray-300 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all duration-200 text-black placeholder-gray-500"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Quantity</label>
                <input
                  type="number"
                  min="1"
                  max={selectedProduct.stocks}
                  required
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) })}
                  className="block w-full border border-gray-300 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all duration-200 text-black placeholder-gray-500"
                  placeholder="1"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Payment Method</label>
                <select
                  value={formData.payment_method}
                  onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                  className="block w-full border border-gray-300 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all duration-200 text-black placeholder-gray-500"
                >
                  <option value="cash">💵 Cash</option>
                  <option value="full_loan">📋 Full Loan</option>
                  <option value="partial_loan">💰 Partial Loan</option>
                </select>
              </div>
            </div>
            
            {formData.payment_method === 'partial_loan' && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Customer Payment Value</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">₱</span>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.payment_value}
                    onChange={(e) => setFormData({ ...formData, payment_value: parseFloat(e.target.value) })}
                    className="pl-8 block w-full border border-gray-300 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all duration-200 text-black placeholder-gray-500"
                    placeholder="0.00"
                  />
                </div>
              </div>
            )}
            
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Returned Empty Tank</label>
              <select
                value={formData.returned_empty}
                onChange={(e) => setFormData({ ...formData, returned_empty: e.target.value })}
                className="block w-full border border-gray-300 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all duration-200 text-black placeholder-gray-500"
              >
                <option value="yes">✅ Yes</option>
                <option value="no">❌ No</option>
              </select>
            </div>
            
            {formData.returned_empty === 'no' && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Quantity Not Returned</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={formData.empty_quantity_not_returned}
                  onChange={(e) => setFormData({ ...formData, empty_quantity_not_returned: parseInt(e.target.value) })}
                  className="block w-full border border-gray-300 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all duration-200 text-black placeholder-gray-500"
                  placeholder="0"
                />
              </div>
            )}
            
            {/* Transaction Summary */}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Transaction Summary</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Total Sale Amount:</p>
                  <p className="text-lg font-bold text-gray-900">₱{(formData.selling_price * formData.quantity).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Profit:</p>
                  <p className={`text-lg font-bold ${
                    (selectedProduct.base_price - formData.selling_price) * formData.quantity >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    ₱{((selectedProduct.base_price - formData.selling_price) * formData.quantity).toLocaleString()}
                  </p>
                </div>
                {formData.payment_method === 'partial_loan' && (
                  <div>
                    <p className="text-sm text-gray-600">Loan Amount:</p>
                    <p className="text-lg font-bold text-orange-600">
                      ₱{((formData.selling_price * formData.quantity) - formData.payment_value).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setSelectedProduct(null)}
                className="px-6 py-3 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-xl hover:bg-gray-200 transition-all duration-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-3 text-sm font-semibold text-white bg-orange-600 border border-transparent rounded-xl hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2 inline-block"></div>
                    Recording...
                  </>
                ) : (
                  'Record Sale'
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bulk Sales Modal */}
      {bulkModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto transform transition-all duration-300 scale-100">
            <div className="bg-gradient-to-r from-orange-600 to-red-600 px-6 py-4 rounded-t-2xl sticky top-0 z-10">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold text-white">Record Bulk Sales</h3>
                  <p className="text-orange-100 text-sm mt-1">Process sales for multiple customers</p>
                </div>
                <button
                  onClick={() => setBulkModalOpen(false)}
                  className="text-white hover:text-orange-200 transition-colors duration-200"
                >
                  <FiX className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Add Customer Button */}
              <div className="flex justify-between items-center">
                <h4 className="text-lg font-semibold text-gray-900">Customer Sales</h4>
                <button
                  type="button"
                  onClick={addCustomerRow}
                  className="bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-700 transition-all duration-200 flex items-center"
                >
                  <FiPlus className="w-4 h-4 mr-2" />
                  Add Customer
                </button>
              </div>

              {/* Customer Table */}
              {customerBulkSales.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-xl">
                  <FiPackage className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 text-lg">No customers added yet.</p>
                  <p className="text-gray-500">Click &quot;Add Customer&quot; to start recording bulk sales.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="border border-gray-200 px-4 py-3 text-left text-sm font-semibold text-gray-900">Customer Name *</th>
                        <th className="border border-gray-200 px-4 py-3 text-left text-sm font-semibold text-gray-900">Product *</th>
                        <th className="border border-gray-200 px-4 py-3 text-left text-sm font-semibold text-gray-900">Quantity *</th>
                        <th className="border border-gray-200 px-4 py-3 text-left text-sm font-semibold text-gray-900">Selling Price *</th>
                        <th className="border border-gray-200 px-4 py-3 text-left text-sm font-semibold text-gray-900">Payment Method</th>
                        <th className="border border-gray-200 px-4 py-3 text-left text-sm font-semibold text-gray-900">Payment Value</th>
                        <th className="border border-gray-200 px-4 py-3 text-left text-sm font-semibold text-gray-900">Returned Empty</th>
                        <th className="border border-gray-200 px-4 py-3 text-left text-sm font-semibold text-gray-900">Not Returned</th>
                        <th className="border border-gray-200 px-4 py-3 text-center text-sm font-semibold text-gray-900">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerBulkSales.map((customer) => (
                        <tr key={customer.id} className="hover:bg-gray-50">
                          <td className="border border-gray-200 px-2 py-2">
                            <input
                              type="text"
                              value={customer.customer_name}
                              onChange={(e) => updateCustomerRow(customer.id, 'customer_name', e.target.value)}
                              className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                              placeholder="Customer name"
                            />
                          </td>
                          <td className="border border-gray-200 px-2 py-2">
                            <select
                              value={customer.product_id}
                              onChange={(e) => updateCustomerRow(customer.id, 'product_id', e.target.value)}
                              className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                            >
                              <option value="">Select Product</option>
                              {products.map((product) => (
                                <option key={product.id} value={product.id}>
                                  {product.name} (Stock: {product.stocks})
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="border border-gray-200 px-2 py-2">
                            <input
                              type="number"
                              min="1"
                              value={customer.quantity}
                              onChange={(e) => updateCustomerRow(customer.id, 'quantity', parseInt(e.target.value) || 1)}
                              className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                            />
                          </td>
                          <td className="border border-gray-200 px-2 py-2">
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">₱</span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={customer.selling_price}
                                onChange={(e) => updateCustomerRow(customer.id, 'selling_price', parseFloat(e.target.value) || 0)}
                                className="pl-5 w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                              />
                            </div>
                          </td>
                          <td className="border border-gray-200 px-2 py-2">
                            <select
                              value={customer.payment_method}
                              onChange={(e) => updateCustomerRow(customer.id, 'payment_method', e.target.value as any)}
                              className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                            >
                              <option value="cash">Cash</option>
                              <option value="full_loan">Full Loan</option>
                              <option value="partial_loan">Partial Loan</option>
                            </select>
                          </td>
                          <td className="border border-gray-200 px-2 py-2">
                            {customer.payment_method === 'partial_loan' ? (
                              <div className="relative">
                                <span className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">₱</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={customer.payment_value}
                                  onChange={(e) => updateCustomerRow(customer.id, 'payment_value', parseFloat(e.target.value) || 0)}
                                  className="pl-5 w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                                />
                              </div>
                            ) : (
                              <span className="text-gray-400 text-sm">-</span>
                            )}
                          </td>
                          <td className="border border-gray-200 px-2 py-2">
                            <select
                              value={customer.returned_empty}
                              onChange={(e) => updateCustomerRow(customer.id, 'returned_empty', e.target.value as any)}
                              className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                            >
                              <option value="yes">Yes</option>
                              <option value="no">No</option>
                            </select>
                          </td>
                          <td className="border border-gray-200 px-2 py-2">
                            {customer.returned_empty === 'no' ? (
                              <input
                                type="number"
                                min="0"
                                value={customer.empty_quantity_not_returned}
                                onChange={(e) => updateCustomerRow(customer.id, 'empty_quantity_not_returned', parseInt(e.target.value) || 0)}
                                className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                              />
                            ) : (
                              <span className="text-gray-400 text-sm">-</span>
                            )}
                          </td>
                          <td className="border border-gray-200 px-2 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => removeCustomerRow(customer.id)}
                              className="bg-red-600 text-white px-2 py-1 rounded text-xs hover:bg-red-700 transition-colors duration-200"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Summary */}
              {customerBulkSales.length > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                  <h4 className="text-lg font-semibold text-orange-900 mb-3">Order Summary</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-gray-700">Total Customers:</p>
                      <p className="text-xl font-bold text-orange-900">{customerBulkSales.length}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-700">Total Amount:</p>
                      <p className="text-xl font-bold text-orange-900">₱{calculateBulkTotal().toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-700">Total Items:</p>
                      <p className="text-xl font-bold text-orange-900">
                        {customerBulkSales.reduce((sum, customer) => sum + customer.quantity, 0)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setBulkModalOpen(false)}
                  className="px-6 py-3 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-xl hover:bg-gray-200 transition-all duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkSubmit}
                  disabled={bulkSaving || customerBulkSales.length === 0}
                  className="px-6 py-3 text-sm font-semibold text-white bg-orange-600 border border-transparent rounded-xl hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105"
                >
                  {bulkSaving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2 inline-block"></div>
                      Processing...
                    </>
                  ) : (
                    'Record Bulk Sales'
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
