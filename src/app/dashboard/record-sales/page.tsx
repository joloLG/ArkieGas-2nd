'use client'

import { useState, useEffect } from 'react'
import { FiShoppingCart } from 'react-icons/fi'
import { supabase } from '@/lib/supabase'

interface Product {
  id: string
  name: string
  base_price: number
  stocks: number
  image_url?: string
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
            paid_amount: formData.payment_method === 'partial_loan' ? formData.payment_value : 0
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
    </div>
  )
}
