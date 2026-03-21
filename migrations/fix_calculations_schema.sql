-- Migration: Fix Profit, Sales, and Loan Calculation Issues
-- This migration resolves duplicated math calculations and standardizes financial calculations

-- 1. Add proper profit tracking table
CREATE TABLE IF NOT EXISTS profit_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
  sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
  loan_id UUID REFERENCES loans(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL,
  base_price DECIMAL(10,2) NOT NULL,
  selling_price DECIMAL(10,2) NOT NULL,
  profit_amount DECIMAL(10,2) NOT NULL,
  profit_type TEXT NOT NULL CHECK (profit_type IN ('initial_sale', 'loan_payment', 'excess_payment')),
  recognized_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Add payment tracking table for better loan management
CREATE TABLE IF NOT EXISTS loan_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loan_id UUID REFERENCES loans(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  payment_amount DECIMAL(10,2) NOT NULL,
  payment_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  remaining_balance_after DECIMAL(10,2) NOT NULL,
  is_final_payment BOOLEAN DEFAULT FALSE,
  profit_recognized DECIMAL(10,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Update transactions table to remove redundant profit field
ALTER TABLE transactions DROP COLUMN IF EXISTS profit;

-- 4. Add computed profit view for consistent reporting
CREATE OR REPLACE VIEW v_financial_summary AS
SELECT 
  DATE_TRUNC('month', t.date) as month,
  SUM(CASE WHEN t.transaction_type = 'sale' THEN t.payment_value ELSE 0 END) as total_sales,
  SUM(CASE WHEN t.transaction_type = 'payment' THEN t.payment_value ELSE 0 END) as total_payments,
  COALESCE(SUM(pt.profit_amount), 0) as total_profit,
  COUNT(DISTINCT CASE WHEN t.transaction_type = 'sale' THEN t.customer_name END) as unique_customers,
  COUNT(DISTINCT l.customer_name) as customers_with_loans
FROM transactions t
LEFT JOIN profit_tracking pt ON t.id = pt.transaction_id
LEFT JOIN loans l ON l.loan_amount > l.paid_amount
GROUP BY DATE_TRUNC('month', t.date)
ORDER BY month DESC;

-- 5. Standardized profit calculation function
CREATE OR REPLACE FUNCTION calculate_standard_profit(
  p_selling_price DECIMAL,
  p_base_price DECIMAL,
  p_quantity INTEGER
) RETURNS DECIMAL AS $$
BEGIN
  RETURN (p_selling_price - p_base_price) * p_quantity;
END;
$$ LANGUAGE plpgsql;

-- 6. Function to record profit with proper tracking
CREATE OR REPLACE FUNCTION record_profit(
  p_transaction_id UUID,
  p_sale_id UUID,
  p_loan_id UUID,
  p_customer_name TEXT,
  p_product_id UUID,
  p_quantity INTEGER,
  p_base_price DECIMAL,
  p_selling_price DECIMAL,
  p_profit_type TEXT
) RETURNS UUID AS $$
DECLARE
  profit_id UUID;
  calculated_profit DECIMAL;
BEGIN
  calculated_profit := calculate_standard_profit(p_selling_price, p_base_price, p_quantity);
  
  INSERT INTO profit_tracking (
    transaction_id, sale_id, loan_id, customer_name, product_id,
    quantity, base_price, selling_price, profit_amount, profit_type
  ) VALUES (
    p_transaction_id, p_sale_id, p_loan_id, p_customer_name, p_product_id,
    p_quantity, p_base_price, p_selling_price, calculated_profit, p_profit_type
  ) RETURNING id INTO profit_id;
  
  RETURN profit_id;
END;
$$ LANGUAGE plpgsql;

-- 7. Function to process loan payments with proper profit recognition
CREATE OR REPLACE FUNCTION process_loan_payment_v2(
  p_loan_id UUID,
  p_payment_amount DECIMAL,
  p_payment_notes TEXT DEFAULT NULL
) RETURNS TABLE(
  payment_id UUID,
  remaining_balance DECIMAL,
  profit_recognized DECIMAL,
  is_loan_paid_off BOOLEAN
) AS $$
DECLARE
  loan_record RECORD;
  new_paid_amount DECIMAL;
  remaining_balance DECIMAL;
  is_final BOOLEAN;
  profit_amount DECIMAL := 0;
  payment_id UUID;
  transaction_id UUID;
BEGIN
  -- Get loan details
  SELECT * INTO loan_record FROM loans WHERE id = p_loan_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan not found';
  END IF;
  
  -- Calculate new amounts
  new_paid_amount := loan_record.paid_amount + p_payment_amount;
  remaining_balance := loan_record.loan_amount - new_paid_amount;
  is_final := remaining_balance <= 0;
  
  -- Update loan
  UPDATE loans 
  SET paid_amount = new_paid_amount 
  WHERE id = p_loan_id;
  
  -- Record payment
  INSERT INTO loan_payments (
    loan_id, customer_name, payment_amount, remaining_balance_after, 
    is_final_payment, notes
  ) VALUES (
    p_loan_id, loan_record.customer_name, p_payment_amount, 
    GREATEST(0, remaining_balance), is_final, p_payment_notes
  ) RETURNING id INTO payment_id;
  
  -- Create transaction record
  INSERT INTO transactions (
    transaction_type, reference_id, customer_name, product_id,
    quantity, selling_price, base_price, payment_method, payment_value,
    remaining_balance
  ) VALUES (
    'payment', p_loan_id, loan_record.customer_name, loan_record.product_id,
    0, loan_record.selling_price, loan_record.base_price, 'cash', 
    p_payment_amount, 0
  ) RETURNING id INTO transaction_id;
  
  -- Recognize profit if loan is fully paid
  IF is_final THEN
    -- Find the original sale to get quantity
    DECLARE
      original_sale RECORD;
    BEGIN
      SELECT * INTO original_sale 
      FROM sales 
      WHERE customer_name = loan_record.customer_name 
        AND product_id = loan_record.product_id 
        AND payment_method = 'full_loan'
      ORDER BY date DESC
      LIMIT 1;
      
      IF original_sale IS NOT NULL THEN
        profit_amount := calculate_standard_profit(
          loan_record.selling_price, 
          loan_record.base_price, 
          original_sale.quantity
        );
        
        -- Record profit
        PERFORM record_profit(
          transaction_id, original_sale.id, p_loan_id,
          loan_record.customer_name, loan_record.product_id,
          original_sale.quantity, loan_record.base_price, 
          loan_record.selling_price, 'loan_payment'
        );
      END IF;
    END;
  END IF;
  
  -- Return payment details
  RETURN QUERY SELECT 
    payment_id, 
    GREATEST(0, remaining_balance),
    profit_amount,
    is_final;
END;
$$ LANGUAGE plpgsql;

-- 8. Update existing sales to use proper profit tracking
INSERT INTO profit_tracking (
  transaction_id, sale_id, customer_name, product_id, quantity,
  base_price, selling_price, profit_amount, profit_type
)
SELECT 
  t.id, s.id, s.customer_name, s.product_id, s.quantity,
  s.selling_price - s.profit, s.selling_price, s.profit, 
  CASE WHEN s.payment_method = 'cash' THEN 'initial_sale' ELSE 'loan_payment' END
FROM sales s
JOIN transactions t ON s.customer_name = t.customer_name AND s.product_id = t.product_id
WHERE s.profit > 0 AND s.payment_method = 'cash'
ON CONFLICT DO NOTHING;

-- 9. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_profit_tracking_transaction ON profit_tracking(transaction_id);
CREATE INDEX IF NOT EXISTS idx_profit_tracking_customer ON profit_tracking(customer_name);
CREATE INDEX IF NOT EXISTS idx_profit_tracking_date ON profit_tracking(recognized_at);
CREATE INDEX IF NOT EXISTS idx_loan_payments_loan ON loan_payments(loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_payments_customer ON loan_payments(customer_name);
CREATE INDEX IF NOT EXISTS idx_loan_payments_date ON loan_payments(payment_date);

-- 10. Row Level Security
ALTER TABLE profit_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to manage profit_tracking" ON profit_tracking
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to manage loan_payments" ON loan_payments
  FOR ALL USING (auth.role() = 'authenticated');

-- 11. Update existing functions to use new standardized calculations
DROP FUNCTION IF EXISTS calculate_cash_profit(DECIMAL, DECIMAL, INTEGER);
DROP FUNCTION IF EXISTS calculate_loan_profit(UUID);
DROP FUNCTION IF EXISTS process_partial_payment(UUID, DECIMAL, DECIMAL);
DROP FUNCTION IF EXISTS create_transaction(TEXT, UUID, TEXT, UUID, INTEGER, DECIMAL, DECIMAL, TEXT, DECIMAL);

-- 12. Create new simplified transaction creation function
CREATE OR REPLACE FUNCTION create_transaction_v2(
  p_transaction_type TEXT,
  p_reference_id UUID,
  p_customer_name TEXT,
  p_product_id UUID,
  p_quantity INTEGER,
  p_selling_price DECIMAL,
  p_base_price DECIMAL,
  p_payment_method TEXT,
  p_payment_value DECIMAL
) RETURNS UUID AS $$
DECLARE
  transaction_id UUID;
  remaining_balance DECIMAL := 0;
  total_amount DECIMAL := p_selling_price * p_quantity;
  profit_id UUID;
BEGIN
  -- Calculate remaining balance
  IF p_payment_method = 'partial_loan' THEN
    remaining_balance := total_amount - p_payment_value;
  ELSIF p_payment_method = 'full_loan' THEN
    remaining_balance := total_amount;
  END IF;
  
  -- Insert transaction
  INSERT INTO transactions (
    transaction_type, reference_id, customer_name, product_id, quantity,
    selling_price, base_price, payment_method, payment_value, remaining_balance
  ) VALUES (
    p_transaction_type, p_reference_id, p_customer_name, p_product_id, p_quantity,
    p_selling_price, p_base_price, p_payment_method, p_payment_value, remaining_balance
  ) RETURNING id INTO transaction_id;
  
  -- Record profit for cash sales
  IF p_payment_method = 'cash' THEN
    profit_id := record_profit(
      transaction_id, NULL, NULL, p_customer_name, p_product_id,
      p_quantity, p_base_price, p_selling_price, 'initial_sale'
    );
  END IF;
  
  RETURN transaction_id;
END;
$$ LANGUAGE plpgsql;
