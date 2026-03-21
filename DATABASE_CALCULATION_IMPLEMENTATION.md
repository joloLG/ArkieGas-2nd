# Database-Based Calculation Implementation

## ✅ **Current Status**

### **Files Created:**
1. **`src/lib/database-calculations.ts`** - New database-specific calculation library
2. **Updated Sales Tracking Page** - Partially updated with database functions

### **❌ Issues Remaining to Fix:**

#### **1. Sales Tracking Page (`src/app/dashboard/sales-tracking/page.tsx`)**

**Lines 427-428** - Still using old function names:
```typescript
// CURRENT (WRONG):
const activeLoansTotal = calculateActiveLoans(data || [])
const customersWithActiveLoansCount = getCustomersWithActiveLoans(data || [])

// SHOULD BE (CORRECT):
const activeLoansTotal = calculateActiveLoansFromDatabase(data || [])
const customersWithActiveLoansCount = getCustomersWithActiveLoansFromDatabase(data || [])
```

**Line 460** - Still using old profit function:
```typescript
// CURRENT (WRONG):
calculateTransactionProfit(sale),

// SHOULD BE (CORRECT):
calculateTransactionProfitFromDatabase(sale),
```

#### **2. Dashboard Page (`src/app/dashboard/page.tsx`)**

**Lines 16-22** - Import statements need updating:
```typescript
// CURRENT:
import {
  calculateTotalSales,
  calculateTotalProfit,
  calculateActiveLoans,
  getCustomersWithActiveLoans,
  generateFinancialSummary
} from '@/lib/sales-calculations'

// SHOULD BE:
import {
  getFinancialSummaryFromDatabase
} from '@/lib/database-calculations'
```

**Lines 91-96** - Function calls need updating:
```typescript
// CURRENT:
const financialSummary = generateFinancialSummary(
  transactions,
  [], // TODO: Add profit tracking data when available
  loans,
  now
)

// SHOULD BE:
const financialSummary = getFinancialSummaryFromDatabase(
  transactions,
  loans,
  sales // optional, for fallback
)
```

## 🎯 **Database Schema Utilization**

### **Tables Being Used:**

1. **`transactions` table** - Primary source for sales calculations
   - `transaction_type` = 'sale' (counts as sales)
   - `transaction_type` = 'payment' (NOT counted as sales)
   - `payment_value` - Actual payment amount
   - `profit` - Pre-calculated profit from database functions

2. **`loans` table** - Source for active loan calculations
   - `loan_amount` - Total loan amount
   - `paid_amount` - Amount paid so far
   - Active loans = `loan_amount - paid_amount`

3. **`sales` table** - Legacy fallback (if needed)
   - Only cash sales counted for backward compatibility

### **Key Calculation Logic:**

#### **Total Sales:**
```typescript
// Only count actual sales transactions, NOT loan payments
transactions
  .filter(t => t.transaction_type === 'sale')
  .reduce((sum, t) => sum + t.payment_value, 0)
```

#### **Total Profit:**
```typescript
// Use pre-calculated profit from database
transactions
  .filter(t => t.transaction_type === 'sale')
  .reduce((sum, t) => sum + t.profit, 0)
```

#### **Active Loans:**
```typescript
// Calculate from loans table, never negative
loans.reduce((sum, loan) => {
  const remaining = Math.max(0, loan.loan_amount - loan.paid_amount)
  return sum + remaining
}, 0)
```

## 🔧 **Manual Fixes Required**

Since I'm currently banned from editing the sales tracking file, you need to manually fix these lines:

### **In `src/app/dashboard/sales-tracking/page.tsx`:**

1. **Line 427**: Change `calculateActiveLoans` → `calculateActiveLoansFromDatabase`
2. **Line 428**: Change `getCustomersWithActiveLoans` → `getCustomersWithActiveLoansFromDatabase`  
3. **Line 460**: Change `calculateTransactionProfit` → `calculateTransactionProfitFromDatabase`

### **In `src/app/dashboard/page.tsx`:**

1. **Lines 16-22**: Update imports to use `getFinancialSummaryFromDatabase`
2. **Lines 91-96**: Replace `generateFinancialSummary` with `getFinancialSummaryFromDatabase`

## 📊 **Benefits of Database-Based Calculations**

✅ **Accurate Data Source** - Uses actual database columns  
✅ **No Double Counting** - Loan payments excluded from sales  
✅ **Proper Profit Timing** - Uses database-calculated profit  
✅ **Consistent Logic** - Same calculations across all pages  
✅ **Performance** - Uses pre-calculated values where possible  

## 🚀 **Next Steps**

1. **Manual Fixes**: Apply the changes listed above
2. **Test**: Verify calculations match expected values
3. **Run Migration**: Execute database migration if not already done
4. **Monitor**: Check for any calculation discrepancies

---

**Status**: 🟡 **Implementation 90% Complete - Manual Fixes Needed**  
**Risk**: 🟢 **Low - Simple find/replace changes**  
**Impact**: 📈 **High - Accurate financial reporting**
