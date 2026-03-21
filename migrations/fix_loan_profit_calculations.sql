-- Migration: Fix Loan Profit Calculations
-- This migration fixes profit recognition for Full Loan and Partial Loan transactions

-- 1. Drop existing functions to recreate with correct signatures
DROP FUNCTION IF EXISTS process_loan_payment_v2(uuid, numeric, text);
DROP FUNCTION IF EXISTS create_transaction_v2(text, uuid, text, uuid, integer, numeric, numeric, text, numeric);

-- 2. Update create_transaction_v2 to properly handle loan profit tracking
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
  loan_id UUID;
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
  
  -- Record profit for cash sales (immediate recognition)
  IF p_payment_method = 'cash' THEN
    profit_id := record_profit(
      transaction_id, NULL, NULL, p_customer_name, p_product_id,
      p_quantity, p_base_price, p_selling_price, 'initial_sale'
    );
  ELSIF p_payment_method = 'partial_loan' THEN
    -- Use the specialized partial loan function to avoid duplicates
    transaction_id := create_partial_loan(
      p_customer_name, p_product_id, p_quantity,
      p_selling_price, p_base_price, p_payment_value
    );
  ELSIF p_payment_method = 'full_loan' THEN
    -- Create loan record for full loan (profit deferred until payment)
    INSERT INTO loans (
      customer_name, product_id, selling_price, base_price, loan_amount, paid_amount
    ) VALUES (
      p_customer_name, p_product_id, p_selling_price, p_base_price, total_amount, 0
    ) RETURNING id INTO loan_id;
    
    -- Update transaction with loan reference
    UPDATE transactions 
    SET reference_id = loan_id 
    WHERE id = transaction_id;
  END IF;
  
  RETURN transaction_id;
END;
$$ LANGUAGE plpgsql;

-- 2. Update process_loan_payment_v2 to handle excess payments and partial profit
CREATE OR REPLACE FUNCTION process_loan_payment_v2(
  p_loan_id UUID,
  p_payment_amount DECIMAL,
  p_payment_notes TEXT DEFAULT NULL
) RETURNS TABLE(
  payment_id UUID,
  remaining_balance DECIMAL,
  profit_recognized DECIMAL,
  excess_payment DECIMAL,
  is_loan_paid_off BOOLEAN
) AS $$
DECLARE
  loan_record RECORD;
  new_paid_amount DECIMAL;
  remaining_balance DECIMAL;
  is_final BOOLEAN;
  profit_amount DECIMAL := 0;
  excess_amount DECIMAL := 0;
  payment_id UUID;
  payment_transaction_id UUID;
  original_sale RECORD;
BEGIN
  -- Get loan details
  SELECT * INTO loan_record FROM loans WHERE id = p_loan_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan not found';
  END IF;
  
  -- Calculate new amounts
  new_paid_amount := loan_record.paid_amount + p_payment_amount;
  remaining_balance := loan_record.loan_amount - new_paid_amount;
  excess_amount := GREATEST(0, -remaining_balance); -- Positive if overpaid
  remaining_balance := GREATEST(0, remaining_balance); -- Never negative
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
    remaining_balance, is_final, p_payment_notes
  ) RETURNING id INTO payment_id;
  
  -- Create transaction record for payment
  INSERT INTO transactions (
    transaction_type, reference_id, customer_name, product_id,
    quantity, selling_price, base_price, payment_method, payment_value,
    remaining_balance, excess_payment
  ) VALUES (
    'payment', p_loan_id, loan_record.customer_name, loan_record.product_id,
    0, loan_record.selling_price, loan_record.base_price, 'cash', 
    p_payment_amount, 0, excess_amount
  ) RETURNING id INTO payment_transaction_id;
  
  -- Find the original sale to get quantity
  SELECT * INTO original_sale 
  FROM transactions 
  WHERE reference_id = p_loan_id 
    AND transaction_type = 'sale'
  ORDER BY date DESC
  LIMIT 1;
  
  -- Calculate profit for this payment based on proportion
  IF original_sale IS NOT NULL THEN
    -- Calculate profit proportionally based on payment amount
    DECLARE
      total_profit DECIMAL;
      payment_profit DECIMAL;
      payment_sales_value DECIMAL;
    BEGIN
      -- Total profit for the original sale
      total_profit := calculate_standard_profit(
        loan_record.selling_price, 
        loan_record.base_price, 
        original_sale.quantity
      );
      
      -- Calculate sales value for this payment (quantity × selling price proportion)
      payment_sales_value := (p_payment_amount / loan_record.loan_amount) * (original_sale.quantity * loan_record.selling_price);
      
      -- Calculate profit proportionally based on payment amount
      payment_profit := (p_payment_amount / loan_record.loan_amount) * total_profit;
      
      -- Record profit for this payment
      PERFORM record_profit(
        payment_transaction_id, NULL, p_loan_id,
        loan_record.customer_name, loan_record.product_id,
        original_sale.quantity, loan_record.base_price, 
        loan_record.selling_price, 'loan_payment'
      );
      
      -- Update the profit amount to match the calculated payment profit
      UPDATE profit_tracking 
      SET profit_amount = payment_profit
      WHERE transaction_id = payment_transaction_id;
    END;
  END IF;
  
  -- Record excess payment as additional profit if any
  IF excess_amount > 0 THEN
    PERFORM record_profit(
      payment_transaction_id, NULL, p_loan_id,
      loan_record.customer_name, loan_record.product_id,
      0, 0, excess_amount, 'excess_payment'
    );
  END IF;
  
  -- Return payment details
  RETURN QUERY SELECT 
    payment_id, 
    remaining_balance,
    profit_amount,
    excess_amount,
    is_final;
END;
$$ LANGUAGE plpgsql;

-- 3. Create function to handle partial loan creation
CREATE OR REPLACE FUNCTION create_partial_loan(
  p_customer_name TEXT,
  p_product_id UUID,
  p_quantity INTEGER,
  p_selling_price DECIMAL,
  p_base_price DECIMAL,
  p_payment_amount DECIMAL
) RETURNS UUID AS $$
DECLARE
  transaction_id UUID;
  loan_id UUID;
  total_amount DECIMAL := p_selling_price * p_quantity;
  remaining_balance DECIMAL := total_amount - p_payment_amount;
BEGIN
  -- Create transaction record
  INSERT INTO transactions (
    transaction_type, reference_id, customer_name, product_id, quantity,
    selling_price, base_price, payment_method, payment_value, remaining_balance
  ) VALUES (
    'sale', NULL, p_customer_name, p_product_id, p_quantity,
    p_selling_price, p_base_price, 'partial_loan', p_payment_amount, remaining_balance
  ) RETURNING id INTO transaction_id;
  
  -- Record profit for cash portion (immediate)
  PERFORM record_profit(
    transaction_id, NULL, NULL, p_customer_name, p_product_id,
    p_quantity, p_base_price, p_selling_price, 'initial_sale'
  );
  
  -- Create loan record for remaining balance
  INSERT INTO loans (
    customer_name, product_id, selling_price, base_price, loan_amount, paid_amount
  ) VALUES (
    p_customer_name, p_product_id, p_selling_price, p_base_price, remaining_balance, p_payment_amount
  ) RETURNING id INTO loan_id;
  
  -- Update transaction with loan reference
  UPDATE transactions 
  SET reference_id = loan_id 
  WHERE id = transaction_id;
  
  RETURN transaction_id;
END;
$$ LANGUAGE plpgsql;

-- 4. Update existing loan transactions to fix profit tracking
-- This migrates existing partial loans to record their cash portion profit
INSERT INTO profit_tracking (
  transaction_id, sale_id, customer_name, product_id, quantity,
  base_price, selling_price, profit_amount, profit_type
)
SELECT 
  t.id, NULL, t.customer_name, t.product_id, t.quantity,
  t.base_price, t.selling_price, 
  (t.selling_price - t.base_price) * t.quantity,
  'initial_sale'
FROM transactions t
WHERE t.payment_method = 'partial_loan'
  AND t.transaction_type = 'sale'
  AND t.id NOT IN (
    SELECT DISTINCT transaction_id FROM profit_tracking 
    WHERE profit_type = 'initial_sale'
  );

-- 5. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_transactions_reference_id ON transactions(reference_id);
CREATE INDEX IF NOT EXISTS idx_loans_customer_product ON loans(customer_name, product_id);

-- 6. Grant necessary permissions
GRANT EXECUTE ON FUNCTION create_transaction_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION process_loan_payment_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION create_partial_loan TO authenticated;
