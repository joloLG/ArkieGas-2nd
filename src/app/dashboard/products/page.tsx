'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { FiPlus, FiEdit2, FiAlertTriangle, FiPackage } from 'react-icons/fi'
import { supabase } from '@/lib/supabase'

interface Product {
  id: string
  name: string
  base_price: number
  min_alert: number
  stocks: number
  image_url?: string
}

interface ProductWithUnreturned extends Product {
  unreturnedTanks: number
}

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductWithUnreturned[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    base_price: 0,
    min_alert: 10,
    stocks: 0,
    image_url: '',
    image_file: null as File | null
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchProducts()
  }, [])

  const fetchProducts = async () => {
    try {
      // Fetch products
      const { data: productsData } = await supabase
        .from('products')
        .select('*')
        .order('name')

      // Fetch unreturned tanks for each product
      const { data: unreturnedData } = await supabase
        .from('empty_tanks_unreturned')
        .select('product_id, quantity')

      const unreturnedMap = new Map<string, number>()
      unreturnedData?.forEach(item => {
        unreturnedMap.set(item.product_id, (unreturnedMap.get(item.product_id) || 0) + item.quantity)
      })

      const productsWithUnreturned: ProductWithUnreturned[] = productsData?.map(product => ({
        ...product,
        unreturnedTanks: unreturnedMap.get(product.id) || 0
      })) || []

      setProducts(productsWithUnreturned)
    } catch (error) {
      console.error('Error fetching products:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      let imageUrl = formData.image_url || null

      // Handle file upload if a file is selected
      if (formData.image_file) {
        const file = formData.image_file
        const fileName = `${Date.now()}-${file.name}`
        
        // Upload file to Supabase storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('product-images')
          .upload(fileName, file)

        if (uploadError) throw uploadError

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('product-images')
          .getPublicUrl(fileName)

        imageUrl = urlData.publicUrl
      }

      if (editingProduct) {
        // Update
        const { error } = await supabase
          .from('products')
          .update({
            name: formData.name,
            base_price: formData.base_price,
            min_alert: formData.min_alert,
            stocks: formData.stocks,
            image_url: imageUrl
          })
          .eq('id', editingProduct.id)

        if (error) throw error
      } else {
        // Insert
        const { error } = await supabase
          .from('products')
          .insert({
            name: formData.name,
            base_price: formData.base_price,
            min_alert: formData.min_alert,
            stocks: formData.stocks,
            image_url: imageUrl
          })

        if (error) throw error
      }

      // Send low stock alert email if applicable
      if (formData.stocks <= formData.min_alert) {
        try {
          await fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              productName: formData.name,
              currentStock: formData.stocks,
              minAlert: formData.min_alert
            })
          })
        } catch (emailError) {
          console.error('Error sending low stock email:', emailError)
          // Don't fail the save if email fails
        }
      }

      setShowModal(false)
      setEditingProduct(null)
      resetForm()
      fetchProducts()
    } catch (error) {
      console.error('Error saving product:', error)
      alert('Error saving product')
    } finally {
      setSaving(false)
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      base_price: 0,
      min_alert: 10,
      stocks: 0,
      image_url: '',
      image_file: null
    })
  }

  const openEditModal = (product: Product) => {
    setEditingProduct(product)
    setFormData({
      name: product.name,
      base_price: product.base_price,
      min_alert: product.min_alert,
      stocks: product.stocks,
      image_url: product.image_url || '',
      image_file: null
    })
    setShowModal(true)
  }

  const openAddModal = () => {
    setEditingProduct(null)
    resetForm()
    setShowModal(true)
  }

  const totalUnreturned = products.reduce((sum, product) => sum + product.unreturnedTanks, 0)

  if (loading) {
    return <div className="text-center py-8">Loading products...</div>
  }

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-2xl p-8 text-white shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
          <div className="mb-6 lg:mb-0">
            <h1 className="text-3xl font-bold mb-2">Product Management</h1>
            <p className="text-green-100 text-lg">Manage your product inventory and pricing</p>
          </div>
          
          <button
            onClick={openAddModal}
            className="bg-white text-green-600 px-6 py-3 rounded-xl hover:bg-green-50 flex items-center transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl font-semibold"
          >
            <FiPlus className="w-5 h-5 mr-2" />
            Add Product
          </button>
        </div>
      </div>

      {/* Unreturned Tanks Alert */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="p-3 rounded-xl bg-red-50 mr-4">
              <FiPackage className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Total Empty Tanks Not Returned</p>
              <p className="text-2xl font-bold text-gray-900">{totalUnreturned}</p>
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

      {/* Products Table */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Product Inventory</h2>
            <div className="text-sm text-gray-500">
              {products.length} products in inventory
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
                  Base Price
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Min Alert
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Current Stock
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Unreturned Tanks
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
                      <div>
                        <div className="text-sm font-semibold text-gray-900">{product.name}</div>
                        {product.stocks <= product.min_alert && (
                          <div className="flex items-center text-red-600 text-xs mt-1">
                            <FiAlertTriangle className="w-4 h-4 mr-1" />
                            <span className="font-medium">Low Stock Alert</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-semibold text-gray-900">₱{product.base_price.toLocaleString()}</span>
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
                    <span className={`text-sm font-bold px-3 py-1 rounded-lg ${
                      product.stocks <= product.min_alert 
                        ? 'bg-red-600 text-white' 
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {product.stocks}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-medium text-orange-600">{product.unreturnedTanks}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => openEditModal(product)}
                      className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg transition-all duration-200 transform hover:scale-105 shadow-md hover:shadow-lg"
                    >
                      <FiEdit2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center">
                      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                        <FiPackage className="w-8 h-8 text-gray-400" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">No products found</h3>
                      <p className="text-gray-600 mb-4">Start by adding your first product to the inventory.</p>
                      <button
                        onClick={openAddModal}
                        className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-medium transition-all duration-200 transform hover:scale-105"
                      >
                        Add First Product
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/10 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full transform transition-all duration-300 scale-100">
            <div className="bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-4 rounded-t-2xl">
              <h3 className="text-xl font-bold text-white">
                {editingProduct ? 'Edit Product' : 'Add New Product'}
              </h3>
            </div>
            
            <div className="p-6">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Product Name</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="block w-full border border-gray-300 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 text-black placeholder-gray-500"
                    placeholder="Enter product name"
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Base Price (₱)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">₱</span>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={formData.base_price}
                        onChange={(e) => setFormData({ ...formData, base_price: parseFloat(e.target.value) })}
                        className="pl-8 block w-full border border-gray-300 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 text-black placeholder-gray-500"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Minimum Alert Level</label>
                    <input
                      type="number"
                      required
                      value={formData.min_alert}
                      onChange={(e) => setFormData({ ...formData, min_alert: parseInt(e.target.value) })}
                      className="block w-full border border-gray-300 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 text-black placeholder-gray-500"
                      placeholder="10"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Current Stock</label>
                    <input
                      type="number"
                      required
                      value={formData.stocks}
                      onChange={(e) => setFormData({ ...formData, stocks: parseInt(e.target.value) })}
                      className="block w-full border border-gray-300 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 text-black placeholder-gray-500"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Product Image (optional)</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setFormData({ ...formData, image_file: e.target.files?.[0] || null })}
                      className="block w-full border border-gray-300 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 file:mr-4 file:font-medium"
                    />
                    {formData.image_file && (
                      <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                        <p className="text-sm text-green-800 font-medium">
                          📎 {formData.image_file.name}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-6 py-3 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-xl hover:bg-gray-200 transition-all duration-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-6 py-3 text-sm font-semibold text-white bg-green-600 border border-transparent rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105"
                  >
                    {saving ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2 inline-block"></div>
                        Saving...
                      </>
                    ) : (
                      editingProduct ? 'Update Product' : 'Add Product'
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
