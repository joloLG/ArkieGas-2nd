'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { FiPlus, FiEdit2, FiPackage, FiAlertTriangle, FiEdit, FiRefreshCw } from 'react-icons/fi'
import { supabase } from '@/lib/supabase'
import { InventoryAlertManager } from '@/components/InventoryAlertManager'

interface Product {
  id: string
  name: string
  base_price: number
  min_alert: number
  stocks: number
  image_url?: string
}


export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showStockModal, setShowStockModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [stockValue, setStockValue] = useState(0)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      // Fetch products
      const { data: productsData } = await supabase
        .from('products')
        .select('*')
        .order('name')

      setProducts(productsData || [])
    } catch (error) {
      console.error('Error fetching inventory data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleStockSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingProduct) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from('products')
        .update({ stocks: stockValue })
        .eq('id', editingProduct.id)

      if (error) throw error

      setShowStockModal(false)
      setEditingProduct(null)
      fetchData()
    } catch (error) {
      console.error('Error updating stock:', error)
      alert('Error updating stock')
    } finally {
      setSaving(false)
    }
  }


  const openStockModal = (product: Product) => {
    setEditingProduct(product)
    setStockValue(product.stocks)
    setShowStockModal(true)
  }




  const [unreturnedTanks, setUnreturnedTanks] = useState(0)

  useEffect(() => {
    const fetchUnreturned = async () => {
      const { data } = await supabase
        .from('empty_tanks_unreturned')
        .select('quantity')
      setUnreturnedTanks(data?.reduce((sum, item) => sum + item.quantity, 0) || 0)
    }
    fetchUnreturned()
  }, [])

  if (loading) {
    return <div className="text-center py-8">Loading inventory...</div>
  }

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-8 text-white shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
          <div className="mb-6 lg:mb-0">
            <h1 className="text-3xl font-bold mb-2">Inventory Management</h1>
            <p className="text-blue-100 text-lg">Track product stocks and empty tank returns</p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/dashboard/inventory/add-product"
              className="bg-white text-blue-600 hover:bg-blue-50 px-6 py-3 rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2"
            >
              <FiPlus className="text-xl" />
              Add Product
            </Link>
          </div>
        </div>
      </div>

      {/* Email Alert Manager */}
      <InventoryAlertManager 
        products={products} 
        userEmail={process.env.NEXT_PUBLIC_USER_EMAIL || 'jlgracilla53@gmail.com'} 
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-1 gap-6">
        
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 hover:shadow-xl transition-all duration-300">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="p-4 rounded-xl bg-red-50 mr-4">
                <FiAlertTriangle className="w-8 h-8 text-red-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">Unreturned Empty Tanks</p>
                <p className="text-3xl font-bold text-red-600">{unreturnedTanks}</p>
                <p className="text-sm text-gray-500">Need customer follow-up</p>
              </div>
            </div>
            <Link
              href="/dashboard/customers"
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 transform hover:scale-105 shadow-md hover:shadow-lg"
            >
              Manage Customers →
            </Link>
          </div>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Product Stocks</h2>
            <div className="text-sm text-gray-500">
              {products.length} products tracked
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Product
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Current Stock
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Min Alert
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {products.map((product) => (
                <tr key={product.id} className={`hover:bg-gray-50 transition-colors duration-150 ${
                  product.stocks <= product.min_alert ? 'bg-red-50' : ''
                }`}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {product.image_url && (
                        <img
                          className="h-12 w-12 rounded-xl object-cover mr-4 shadow-sm"
                          src={product.image_url}
                          alt={product.name}
                        />
                      )}
                      <div className="text-sm font-semibold text-gray-900">{product.name}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`text-sm font-bold px-3 py-1 rounded-lg ${
                      product.stocks <= product.min_alert 
                        ? 'bg-red-600 text-white' 
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {product.stocks}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`text-sm font-medium px-2 py-1 rounded-lg ${
                      product.stocks <= product.min_alert 
                        ? 'bg-red-100 text-red-800' 
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {product.min_alert}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {product.stocks <= product.min_alert ? (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">
                        🔴 Low Stock
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                        ✅ In Stock
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => openStockModal(product)}
                      className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg transition-all duration-200 transform hover:scale-105 shadow-md hover:shadow-lg"
                    >
                      <FiEdit2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center">
                      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                        <FiPackage className="w-8 h-8 text-gray-400" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">No Products Found</h3>
                      <p className="text-gray-600 mb-4">Start by adding products to track inventory.</p>
                      <button
                        onClick={() => window.location.href = '/dashboard/products'}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-all duration-200 transform hover:scale-105"
                      >
                        Add Products
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stock Edit Modal */}
      {showStockModal && editingProduct && (
        <div className="fixed inset-0 bg-black/10 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full transform transition-all duration-300 scale-100">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 rounded-t-2xl">
              <h3 className="text-xl font-bold text-white">
                Edit Stock for {editingProduct.name}
              </h3>
            </div>
            
            <div className="p-6">
              <form onSubmit={handleStockSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Current Stock</label>
                  <input
                    type="number"
                    required
                    value={stockValue || ''}
                    onChange={(e) => setStockValue(e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                    className="block w-full border border-gray-300 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 text-black placeholder-gray-500"
                    placeholder="Enter new stock value"
                  />
                </div>
                
                <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-blue-800 font-medium">Current: {editingProduct.stocks}</span>
                    <span className="text-sm text-blue-600">New: {stockValue}</span>
                  </div>
                  <div className="text-xs text-blue-700 mt-2">
                    Change: {stockValue > editingProduct.stocks ? `+${stockValue - editingProduct.stocks}` : `-${editingProduct.stocks - stockValue}`}
                  </div>
                </div>
                
                <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => setShowStockModal(false)}
                    className="px-6 py-3 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-xl hover:bg-gray-200 transition-all duration-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-6 py-3 text-sm font-semibold text-white bg-blue-600 border border-transparent rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105"
                  >
                    {saving ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2 inline-block"></div>
                        Updating...
                      </>
                    ) : (
                      'Update Stock'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}



    </div>
  )
}
