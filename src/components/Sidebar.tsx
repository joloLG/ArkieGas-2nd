'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import {
  FiHome,
  FiPackage,
  FiTrendingUp,
  FiShoppingCart,
  FiArchive,
  FiUsers,
  FiLogOut,
  FiMenu,
  FiX,
  FiDownload
} from 'react-icons/fi'
import { useAuth } from '@/contexts/AuthContext'
import { usePWAInstall } from '@/hooks/usePWAInstall'

const navigation = [
  { name: 'Main Dashboard', href: '/dashboard', icon: FiHome },
  { name: 'Record Products', href: '/dashboard/products', icon: FiPackage },
  { name: 'Sales Tracking', href: '/dashboard/sales-tracking', icon: FiTrendingUp },
  { name: 'Record Sales', href: '/dashboard/record-sales', icon: FiShoppingCart },
  { name: 'Track Inventory', href: '/dashboard/inventory', icon: FiArchive },
  { name: 'Customer List', href: '/dashboard/customers', icon: FiUsers },
]

export default function Sidebar() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { signOut } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const { isInstallable, isInstalled, install } = usePWAInstall()

  const handleLogout = async () => {
    await signOut()
    router.push('/login')
  }

  const handleInstall = async () => {
    const success = await install()
    if (success) {
      console.log('App installed successfully!')
    }
  }

  return (
    <>
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-gray-900 bg-opacity-50 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-gradient-to-b from-gray-900 to-gray-800 border-r border-gray-700 transform ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } transition-transform duration-300 ease-in-out lg:translate-x-0 lg:fixed`}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-6 border-b border-gray-700 bg-gray-900/50 backdrop-blur-sm">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                <span className="text-white font-bold text-lg">A</span>
              </div>
              <div className="ml-3">
                <span className="text-lg font-bold text-white">Arkie</span>
                <span className="text-sm text-gray-300 ml-1">Gasul</span>
              </div>
            </div>
            <button
              className="lg:hidden text-gray-400 hover:text-white transition-colors duration-200"
              onClick={() => setSidebarOpen(false)}
            >
              <FiX className="w-6 h-6" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Main Menu</p>
            </div>
            {navigation.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
                    isActive
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg transform scale-[1.02]'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  }`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon className={`w-5 h-5 mr-3 transition-transform duration-200 ${
                    isActive ? 'transform scale-110' : 'group-hover:scale-110'
                  }`} />
                  <span className="transition-all duration-200">{item.name}</span>
                  {isActive && (
                    <div className="ml-auto w-2 h-2 bg-white rounded-full shadow-lg"></div>
                  )}
                </Link>
              )
            })}
            
            {/* Install App Button */}
            {isInstallable && !isInstalled && (
              <button
                onClick={handleInstall}
                className="group flex items-center w-full px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
              >
                <FiDownload className="w-5 h-5 mr-3 transition-transform duration-200 group-hover:scale-110" />
                <span className="transition-all duration-200">Install App</span>
                <div className="ml-auto">
                  <div className="w-2 h-2 bg-white rounded-full shadow-lg animate-pulse"></div>
                </div>
              </button>
            )}
            
            {isInstalled && (
              <div className="flex items-center px-4 py-3 text-sm font-medium rounded-xl bg-green-600/20 text-green-400 border border-green-600/30">
                <FiDownload className="w-5 h-5 mr-3" />
                <span>App Installed</span>
                <div className="ml-auto w-2 h-2 bg-green-400 rounded-full"></div>
              </div>
            )}
          </nav>

          {/* User Section */}
          <div className="p-4 border-t border-gray-700 bg-gray-900/50 backdrop-blur-sm">
            <div className="mb-4">
              <div className="flex items-center">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-semibold">U</span>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-white">Admin User</p>
                  <p className="text-xs text-gray-400">System Administrator</p>
                </div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center w-full px-4 py-3 text-sm font-medium text-gray-300 rounded-xl hover:bg-red-600/20 hover:text-red-400 transition-all duration-200 group"
            >
              <FiLogOut className="w-5 h-5 mr-3 transition-transform duration-200 group-hover:scale-110" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu button */}
      <div className="lg:hidden">
        <button
          className="fixed top-4 left-4 z-40 bg-gradient-to-r from-blue-600 to-indigo-600 p-3 rounded-xl shadow-lg border border-gray-700 text-white hover:shadow-xl transition-all duration-200 transform hover:scale-105"
          onClick={() => setSidebarOpen(true)}
        >
          <FiMenu className="w-6 h-6" />
        </button>
      </div>
    </>
  )
}
