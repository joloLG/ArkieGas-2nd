import { NextRequest, NextResponse } from 'next/server'
import { sendLowStockEmail } from '@/lib/email'

export async function POST(request: NextRequest) {
  try {
    const { productName, currentStock, minAlert, userEmail } = await request.json()

    // Use provided user email or fallback to environment variable
    const toEmail = userEmail || process.env.DEFAULT_USER_EMAIL

    if (!toEmail) {
      return NextResponse.json({ 
        error: 'No recipient email provided. Please set userEmail in request or DEFAULT_USER_EMAIL in environment.' 
      }, { status: 400 })
    }

    await sendLowStockEmail(toEmail, productName, currentStock, minAlert)

    return NextResponse.json({ success: true, message: 'Low stock email sent successfully' })
  } catch (error) {
    console.error('Error in send-email API:', error)
    return NextResponse.json({ 
      error: 'Failed to send email',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
