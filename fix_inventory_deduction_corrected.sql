-- FIX: Corrected Inventory Deduction and Empty Tank Calculations
-- This fixes the issues with stock deduction and empty tank tracking

-- Step 1: Drop existing functions to recreate with fixes
DROP FUNCTION IF EXISTS create_transaction_v2(text, uuid, text, uuid, integer, numeric, numeric, text, numeric);
DROP FUNCTION IF EXISTS handle_empty_tank_return(text, uuid, integer, integer);
DROP FUNCTION IF EXISTS handle_unreturned_tanks(text, uuid, integer);
DROP FUNCTION IF EXISTS create_complete_transaction(text, uuid, integer, numeric, numeric, text, numeric, boolean, integer);

-- Step 2: Fixed create_transaction_v2 with proper inventory deduction
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
  current_stock INTEGER;
BEGIN
  -- Check current stock first
  SELECT stocks INTO current_stock 
  FROM products 
  WHERE id = p_product_id;
  
  IF current_stock IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;
  
  IF current_stock < p_quantity THEN
    RAISE EXCEPTION 'Not enough stock available. Current stock: %, Requested: %', current_stock, p_quantity;
  END IF;
  
  -- Calculate remaining balance
  IF p_payment_method = 'partial_loan' THEN
    remaining_balance := total_amount - p_payment_value;
  ELSIF p_payment_method = 'full_loan' THEN
    remaining_balance = total_amount;
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
  
  -- DEDUCT INVENTORY - ATOMIC OPERATION (FIXED)
  UPDATE products 
  SET stocks = stocks - p_quantity
  WHERE id = p_product_id;
  
  RETURN transaction_id;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Fixed handle_empty_tank_return function
CREATE OR REPLACE FUNCTION handle_empty_tank_return(
  p_customer_name TEXT,
  p_product_id UUID,
  p_returned_quantity INTEGER,
  p_sold_quantity INTEGER
) RETURNS VOID AS $$
DECLARE
  current_unreturned INTEGER;
BEGIN
  -- Add returned tanks to product inventory (FIXED: Add to main product stock)
  UPDATE products 
  SET stocks = stocks + p_returned_quantity
  WHERE id = p_product_id;
  
  -- Handle unreturned tanks tracking
  SELECT quantity INTO current_unreturned
  FROM empty_tanks_unreturned
  WHERE customer_name = p_customer_name AND product_id = p_product_id;
  
  IF current_unreturned IS NOT NULL THEN
    IF current_unreturned <= p_returned_quantity THEN
      -- Remove all unreturned tanks record
      DELETE FROM empty_tanks_unreturned
      WHERE customer_name = p_customer_name AND product_id = p_product_id;
    ELSE
      -- Reduce unreturned tanks count
      UPDATE empty_tanks_unreturned
      SET quantity = current_unreturned - p_returned_quantity
      WHERE customer_name = p_customer_name AND product_id = p_product_id;
    END IF;
  END IF;
  
  -- Add returned tanks to shop empty tanks inventory
  INSERT INTO shop_empty_tanks (product_id, quantity)
  VALUES (p_product_id, p_returned_quantity)
  ON CONFLICT (product_id) 
  DO UPDATE SET 
    quantity = shop_empty_tanks.quantity + p_returned_quantity;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Fixed handle_unreturned_tanks function
CREATE OR REPLACE FUNCTION handle_unreturned_tanks(
  p_customer_name TEXT,
  p_product_id UUID,
  p_unreturned_quantity INTEGER
) RETURNS VOID AS $$
DECLARE
  existing_record BOOLEAN;
BEGIN
  -- Check if record already exists
  SELECT EXISTS(
    SELECT 1 FROM empty_tanks_unreturned
    WHERE customer_name = p_customer_name AND product_id = p_product_id
  ) INTO existing_record;
  
  IF existing_record THEN
    -- Update existing record
    UPDATE empty_tanks_unreturned
    SET quantity = quantity + p_unreturned_quantity,
        date = NOW()
    WHERE customer_name = p_customer_name AND product_id = p_product_id;
  ELSE
    -- Insert new record
    INSERT INTO empty_tanks_unreturned (
      customer_name, product_id, quantity, date
    ) VALUES (
      p_customer_name, p_product_id, p_unreturned_quantity, NOW()
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Fixed create_complete_transaction function
CREATE OR REPLACE FUNCTION create_complete_transaction(
  p_customer_name TEXT,
  p_product_id UUID,
  p_quantity INTEGER,
  p_selling_price DECIMAL,
  p_base_price DECIMAL,
  p_payment_method TEXT,
  p_payment_value DECIMAL,
  p_returned_empty BOOLEAN DEFAULT FALSE,
  p_empty_quantity_not_returned INTEGER DEFAULT 0
) RETURNS TABLE(
  transaction_id UUID,
  success BOOLEAN,
  message TEXT
) AS $$
DECLARE
  transaction_id UUID;
  current_stock INTEGER;
  returned_quantity INTEGER;
BEGIN
  -- Get current stock
  SELECT stocks INTO current_stock 
  FROM products 
  WHERE id = p_product_id;
  
  -- Validate stock
  IF current_stock IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, FALSE, 'Product not found'::TEXT;
    RETURN;
  END IF;
  
  IF current_stock < p_quantity THEN
    RETURN QUERY SELECT NULL::UUID, FALSE, 
      format('Not enough stock. Available: %, Requested: %', current_stock, p_quantity)::TEXT;
    RETURN;
  END IF;
  
  -- Create transaction (includes inventory deduction)
  transaction_id := create_transaction_v2(
    'sale', NULL, p_customer_name, p_product_id, p_quantity,
    p_selling_price, p_base_price, p_payment_method, p_payment_value
  );
  
  -- Handle empty tanks (FIXED LOGIC)
  IF p_returned_empty THEN
    -- Calculate returned quantity: sold - not returned = returned
    returned_quantity := p_quantity - p_empty_quantity_not_returned;
    
    PERFORM handle_empty_tank_return(
      p_customer_name, p_product_id, 
      returned_quantity, p_quantity
    );
  ELSIF p_empty_quantity_not_returned > 0 THEN
    -- All tanks not returned
    PERFORM handle_unreturned_tanks(
      p_customer_name, p_product_id, p_empty_quantity_not_returned
    );
  END IF;
  
  RETURN QUERY SELECT transaction_id, TRUE, 'Transaction completed successfully'::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Grant permissions
GRANT EXECUTE ON FUNCTION create_transaction_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION handle_empty_tank_return TO authenticated;
GRANT EXECUTE ON FUNCTION handle_unreturned_tanks TO authenticated;
GRANT EXECUTE ON FUNCTION create_complete_transaction TO authenticated;

-- Success message
SELECT 'Inventory deduction and empty tank calculations have been fixed!' as status;
