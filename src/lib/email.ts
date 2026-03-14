import nodemailer from 'nodemailer'

// Debug environment variables
console.log('Email Configuration Debug:')
console.log('GMAIL_EMAIL:', process.env.GMAIL_EMAIL ? 'SET' : 'NOT SET')
console.log('GMAIL_APP_PASSWORD:', process.env.GMAIL_APP_PASSWORD ? 'SET' : 'NOT SET')

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_EMAIL,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
  debug: true, // Enable debug logging
  logger: true, // Log to console
})

export const sendLowStockEmail = async (
  toEmail: string,
  productName: string,
  currentStock: number,
  minAlert: number
) => {
  try {
    const mailOptions = {
      from: `"Arkie Gasul Inventory" <${process.env.GMAIL_EMAIL}>`,
      to: toEmail,
      subject: `🚨 Low Stock Alert - ${productName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
            <h2 style="color: #dc3545; margin-bottom: 20px;">⚠️ Low Stock Alert</h2>
            
            <div style="background: white; padding: 15px; border-radius: 6px; border-left: 4px solid #dc3545;">
              <h3 style="color: #333; margin-top: 0;">Product Information</h3>
              <p><strong>Product Name:</strong> ${productName}</p>
              <p><strong>Current Stock:</strong> <span style="color: #dc3545; font-weight: bold;">${currentStock}</span></p>
              <p><strong>Minimum Alert Level:</strong> ${minAlert}</p>
              <p><strong>Status:</strong> <span style="color: #dc3545; font-weight: bold;">CRITICAL - Restock Required</span></p>
            </div>
            
            <div style="margin-top: 20px; padding: 15px; background: #e9ecef; border-radius: 6px;">
              <h4 style="margin-top: 0;">Action Required:</h4>
              <p>Please restock <strong>${productName}</strong> as soon as possible to avoid stockouts.</p>
              <p>Current inventory levels are below the minimum alert threshold.</p>
            </div>
            
            <div style="margin-top: 20px; text-align: center; color: #6c757d; font-size: 12px;">
              <p>This is an automated message from Arkie Gasul Inventory System</p>
              <p>Generated on: ${new Date().toLocaleString()}</p>
            </div>
          </div>
        </div>
      `,
    }

    const info = await transporter.sendMail(mailOptions)
    console.log('Email sent successfully:', info.messageId)
    return { success: true, messageId: info.messageId }
  } catch (error) {
    console.error('Error sending email:', error)
    throw error
  }
}

export const verifyEmailConnection = async () => {
  try {
    await transporter.verify()
    console.log('Email server connection verified successfully')
    return true
  } catch (error) {
    console.error('Email server connection failed:', error)
    return false
  }
}
