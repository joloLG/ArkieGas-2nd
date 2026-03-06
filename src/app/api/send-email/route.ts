import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: NextRequest) {
  try {
    const { productName, currentStock, minAlert } = await request.json()

    const { data, error } = await resend.emails.send({
      from: 'Arkie Gasul <noreply@arkiegasul.com>',
      to: ['user@example.com'], // Replace with actual user email
      subject: 'Low Stock Alert',
      html: `
        <h2>Low Stock Alert</h2>
        <p>Product: ${productName}</p>
        <p>Current Stock: ${currentStock}</p>
        <p>Minimum Alert: ${minAlert}</p>
        <p>Please restock soon.</p>
      `,
    })

    if (error) {
      console.error('Error sending email:', error)
      return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in send-email API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
