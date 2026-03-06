'use client'

import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-white py-6 px-4 border-t border-gray-800">
      <div className="max-w-7xl mx-auto text-center">
        <p className="text-sm text-gray-400">
          © 2026 Arkie Gasul - Developed by{' '}
          <Link 
            href="https://jlgdev.vercel.app/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-400 font-medium hover:text-blue-300 transition-colors duration-200 underline"
          >
            JLG-DEV Solutions
          </Link>
        </p>
        <p className="text-xs text-gray-500 mt-2">
          All rights reserved. Inventory & Sales Management System
        </p>
      </div>
    </footer>
  )
}
