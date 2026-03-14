# Email Notification Setup

This system uses Gmail SMTP with Nodemailer to send low stock alerts automatically.

## Environment Variables

Create a `.env.local` file in the root directory with the following variables:

```env
# Gmail SMTP Configuration for Email Notifications
GMAIL_EMAIL=jlgracilla53@gmail.com
GMAIL_APP_PASSWORD=xyci jcoa lqvy vlpv

# Default user email for notifications (can be overridden in API calls)
DEFAULT_USER_EMAIL=jlgracilla53@gmail.com
```

## Gmail App Password Setup

1. Go to your Google Account settings
2. Enable 2-Step Verification
3. Go to Security → App Passwords
4. Generate a new app password for "Arkie Gas - App Password"
5. Use the generated password in `GMAIL_APP_PASSWORD`

## API Usage

The email notification API is available at `/api/send-email`

### Request Format:
```json
{
  "productName": "Product Name",
  "currentStock": 5,
  "minAlert": 10,
  "userEmail": "optional-recipient@example.com"
}
```

### Response:
```json
{
  "success": true,
  "message": "Low stock email sent successfully"
}
```

## Automatic Trigger

The system automatically sends email notifications when:
- Product stock goes below the minimum alert level
- The database trigger `low_stock_trigger` calls the notification function
- The API endpoint is invoked with the product details

## Email Template

The system sends a professionally formatted HTML email with:
- Product information
- Current stock levels
- Alert status
- Action required message
- Timestamp
