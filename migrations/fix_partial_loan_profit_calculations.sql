-- Migration: Fix Partial Loan Profit Calculations to Match Full Loan Behavior
-- This migration makes Partial Loan work exactly like Full Loan - defer all profit until fully paid
-- The downpayment is treated as part of the loan, not as immediate cash

-- 1. Drop and recreate the partial loan function to match full loan behavior
DROP FUNCTION IF EXISTS create_partial_loan(text, uuid, integer, numeric, numeric, numeric);

-- 2. Updated create_partial_loan function - NO immediate profit recognition (like Full Loan)
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
  -- Create transaction record (NO immediate profit - deferred like Full Loan)
  INSERT INTO transactions (
    transaction_type, reference_id, customer_name, product_id, quantity,
    selling_price, base_price, payment_method, payment_value, remaining_balance
  ) VALUES (
    'sale', NULL, p_customer_name, p_product_id, p_quantity,
    p_selling_price, p_base_price, 'partial_loan', p_payment_amount, remaining_balance
  ) RETURNING id INTO transaction_id;
  
  -- Create loan record for TOTAL amount with downpayment as paid_amount
  -- This matches Full Loan logic but with initial payment
  INSERT INTO loans (
    customer_name, product_id, selling_price, base_price, loan_amount, paid_amount
  ) VALUES (
    p_customer_name, p_product_id, p_selling_price, p_base_price, total_amount, p_payment_amount
  ) RETURNING id INTO loan_id;
  
  -- Update transaction with loan reference
  UPDATE transactions 
  SET reference_id = loan_id 
  WHERE id = transaction_id;
  
  -- NO immediate profit recording - profit deferred until loan fully paid
  -- This is the key change to match Full Loan behavior
  
  RETURN transaction_id;
END;
$$ LANGUAGE plpgsql;

-- 3. Update create_transaction_v2 to use the corrected partial loan logic
DROP FUNCTION IF EXISTS create_transaction_v2(text, uuid, text, uuid, integer, numeric, numeric, text, numeric);

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
  
  -- Record profit ONLY for cash sales (immediate recognition)
  IF p_payment_method = 'cash' THEN
    profit_id := record_profit(
      transaction_id, NULL, NULL, p_customer_name, p_product_id,
      p_quantity, p_base_price, p_selling_price, 'initial_sale'
    );
  ELSIF p_payment_method = 'partial_loan' THEN
    -- Use the corrected partial loan function (NO immediate profit)
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

-- 4. Update process_loan_payment_v2 to handle both Full and Partial loans consistently
DROP FUNCTION IF EXISTS process_loan_payment_v2(uuid, numeric, text);

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
  
  -- Recognize profit ONLY when loan is fully paid (same for Full and Partial)
  IF is_final AND original_sale IS NOT NULL THEN
    -- Calculate total profit for the original sale
    profit_amount := calculate_standard_profit(
      loan_record.selling_price, 
      loan_record.base_price, 
      original_sale.quantity
    );
    
    -- Record profit (full amount recognized at final payment)
    PERFORM record_profit(
      payment_transaction_id, NULL, p_loan_id,
      loan_record.customer_name, loan_record.product_id,
      original_sale.quantity, loan_record.base_price, 
      loan_record.selling_price, 'loan_payment'
    );
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

-- 5. Clean up existing incorrect profit records for partial loans
DELETE FROM profit_tracking 
WHERE transaction_id IN (
  SELECT t.id FROM transactions t 
  WHERE t.payment_method = 'partial_loan' 
    AND t.transaction_type = 'sale'
);

-- 6. Grant necessary permissions
GRANT EXECUTE ON FUNCTION create_transaction_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION process_loan_payment_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION create_partial_loan TO authenticated;

-- 7. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_transactions_payment_method ON transactions(payment_method);
CREATE INDEX IF NOT EXISTS idx_loans_paid_amount ON loans(paid_amount);
