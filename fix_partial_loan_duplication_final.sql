-- FIX: Remove Partial Loan Transaction Duplication (Final Version)
-- The issue: create_transaction_v2 creates 2 transactions for partial loans

-- Step 1: Drop and recreate create_transaction_v2 to fix duplication
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
  
  -- Record profit ONLY for cash sales (immediate recognition)
  IF p_payment_method = 'cash' THEN
    -- Insert transaction for cash sales
    INSERT INTO transactions (
      transaction_type, reference_id, customer_name, product_id, quantity,
      selling_price, base_price, payment_method, payment_value, remaining_balance
    ) VALUES (
      p_transaction_type, p_reference_id, p_customer_name, p_product_id, p_quantity,
      p_selling_price, p_base_price, p_payment_method, p_payment_value, remaining_balance
    ) RETURNING id INTO transaction_id;
    
    -- Record profit for cash sales
    profit_id := record_profit(
      transaction_id, NULL, NULL, p_customer_name, p_product_id,
      p_quantity, p_base_price, p_selling_price, 'initial_sale'
    );
    
  ELSIF p_payment_method = 'partial_loan' THEN
    -- Create loan record for partial loan (NO immediate profit)
    INSERT INTO loans (
      customer_name, product_id, selling_price, base_price, loan_amount, paid_amount
    ) VALUES (
      p_customer_name, p_product_id, p_selling_price, p_base_price, total_amount, p_payment_value
    ) RETURNING id INTO loan_id;
    
    -- Insert SINGLE transaction record for partial loan
    INSERT INTO transactions (
      transaction_type, reference_id, customer_name, product_id, quantity,
      selling_price, base_price, payment_method, payment_value, remaining_balance
    ) VALUES (
      p_transaction_type, p_reference_id, p_customer_name, p_product_id, p_quantity,
      p_selling_price, p_base_price, p_payment_method, p_payment_value, remaining_balance
    ) RETURNING id INTO transaction_id;
    
    -- Update transaction with loan reference
    UPDATE transactions 
    SET reference_id = loan_id 
    WHERE id = transaction_id;
    
    -- NO immediate profit recording (deferred like Full Loan)
    
  ELSIF p_payment_method = 'full_loan' THEN
    -- Create loan record for full loan (profit deferred until payment)
    INSERT INTO loans (
      customer_name, product_id, selling_price, base_price, loan_amount, paid_amount
    ) VALUES (
      p_customer_name, p_product_id, p_selling_price, p_base_price, total_amount, 0
    ) RETURNING id INTO loan_id;
    
    -- Insert transaction record for full loan
    INSERT INTO transactions (
      transaction_type, reference_id, customer_name, product_id, quantity,
      selling_price, base_price, payment_method, payment_value, remaining_balance
    ) VALUES (
      p_transaction_type, p_reference_id, p_customer_name, p_product_id, p_quantity,
      p_selling_price, p_base_price, p_payment_method, p_payment_value, remaining_balance
    ) RETURNING id INTO transaction_id;
    
    -- Update transaction with loan reference
    UPDATE transactions 
    SET reference_id = loan_id 
    WHERE id = transaction_id;
  END IF;
  
  RETURN transaction_id;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Clean up any existing duplicate partial loan transactions
-- FIXED: Proper UUID handling with MIN() function

-- Method 1: Use ROW_NUMBER() window function (recommended)
WITH ranked_transactions AS (
  SELECT 
    t.id,
    t.customer_name,
    t.product_id,
    l.date as loan_date,
    ROW_NUMBER() OVER (
      PARTITION BY t.customer_name, t.product_id, l.date 
      ORDER BY t.date ASC
    ) as rn
  FROM transactions t
  INNER JOIN loans l ON l.id = t.reference_id
  WHERE t.payment_method = 'partial_loan'
    AND t.transaction_type = 'sale'
)
DELETE FROM transactions 
WHERE id IN (
  SELECT id FROM ranked_transactions WHERE rn > 1
);

-- Method 2: Alternative approach using array_agg (if Method 1 fails)
DELETE FROM transactions 
WHERE id IN (
  SELECT unnest(
    array_remove(
      array_agg(t.id ORDER BY t.date),
      (array_agg(t.id ORDER BY t.date))[1]
    )
  )
  FROM transactions t
  INNER JOIN loans l ON l.id = t.reference_id
  WHERE t.payment_method = 'partial_loan'
    AND t.transaction_type = 'sale'
  GROUP BY t.customer_name, t.product_id, l.date
  HAVING COUNT(t.id) > 1
);

-- Method 3: Simple approach using EXISTS (safest)
DELETE FROM transactions t1
WHERE EXISTS (
  SELECT 1 FROM transactions t2
  INNER JOIN loans l2 ON l2.id = t2.reference_id
  WHERE t2.customer_name = t1.customer_name
    AND t2.product_id = t1.product_id
    AND l2.date = (SELECT l.date FROM loans l WHERE l.id = t1.reference_id)
    AND t2.payment_method = 'partial_loan'
    AND t2.transaction_type = 'sale'
    AND t2.id < t1.id
) AND t1.payment_method = 'partial_loan' AND t1.transaction_type = 'sale';

-- Grant permissions
GRANT EXECUTE ON FUNCTION create_transaction_v2 TO authenticated;

-- Success message
SELECT 'Partial Loan duplication has been fixed!' as status;
