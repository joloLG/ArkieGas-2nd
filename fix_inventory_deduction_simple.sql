-- SIMPLE FIX: Direct Inventory Deduction with Debugging
-- This ensures stock deduction works correctly

-- Step 1: Create a simple function that just handles inventory deduction
CREATE OR REPLACE FUNCTION deduct_inventory(
  p_product_id UUID,
  p_quantity INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
  current_stock INTEGER;
BEGIN
  -- Get current stock
  SELECT stocks INTO current_stock 
  FROM products 
  WHERE id = p_product_id;
  
  IF current_stock IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;
  
  IF current_stock < p_quantity THEN
    RAISE EXCEPTION 'Not enough stock. Available: %, Requested: %', current_stock, p_quantity;
  END IF;
  
  -- Deduct stock directly
  UPDATE products 
  SET stocks = stocks - p_quantity
  WHERE id = p_product_id;
  
  -- Verify the update worked
  GET DIAGNOSTICS current_stock = ROW_COUNT;
  
  RETURN current_stock > 0;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Create a comprehensive transaction function with guaranteed inventory deduction
CREATE OR REPLACE FUNCTION create_transaction_with_inventory(
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
  message TEXT,
  new_stock INTEGER
) AS $$
DECLARE
  transaction_id UUID;
  current_stock INTEGER;
  new_stock INTEGER;
  remaining_balance DECIMAL := 0;
  total_amount DECIMAL := p_selling_price * p_quantity;
  loan_id UUID;
  returned_quantity INTEGER;
BEGIN
  -- Get current stock before transaction
  SELECT stocks INTO current_stock 
  FROM products 
  WHERE id = p_product_id;
  
  -- Validate stock
  IF current_stock IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, FALSE, 'Product not found'::TEXT, NULL::INTEGER;
    RETURN;
  END IF;
  
  IF current_stock < p_quantity THEN
    RETURN QUERY SELECT NULL::UUID, FALSE, 
      format('Not enough stock. Available: %, Requested: %', current_stock, p_quantity)::TEXT, 
      current_stock::INTEGER;
    RETURN;
  END IF;
  
  -- Calculate new stock
  new_stock := current_stock - p_quantity;
  
  -- Calculate remaining balance for loans
  IF p_payment_method = 'partial_loan' THEN
    remaining_balance := total_amount - p_payment_value;
  ELSIF p_payment_method = 'full_loan' THEN
    remaining_balance := total_amount;
  END IF;
  
  -- Create transaction record FIRST
  INSERT INTO transactions (
    transaction_type, reference_id, customer_name, product_id, quantity,
    selling_price, base_price, payment_method, payment_value, remaining_balance
  ) VALUES (
    'sale', NULL, p_customer_name, p_product_id, p_quantity,
    p_selling_price, p_base_price, p_payment_method, p_payment_value, remaining_balance
  ) RETURNING id INTO transaction_id;
  
  -- Handle loans
  IF p_payment_method = 'partial_loan' THEN
    INSERT INTO loans (
      customer_name, product_id, selling_price, base_price, loan_amount, paid_amount
    ) VALUES (
      p_customer_name, p_product_id, p_selling_price, p_base_price, total_amount, p_payment_value
    ) RETURNING id INTO loan_id;
    
    UPDATE transactions SET reference_id = loan_id WHERE id = transaction_id;
    
  ELSIF p_payment_method = 'full_loan' THEN
    INSERT INTO loans (
      customer_name, product_id, selling_price, base_price, loan_amount, paid_amount
    ) VALUES (
      p_customer_name, p_product_id, p_selling_price, p_base_price, total_amount, 0
    ) RETURNING id INTO loan_id;
    
    UPDATE transactions SET reference_id = loan_id WHERE id = transaction_id;
    
  ELSIF p_payment_method = 'cash' THEN
    -- Record profit for cash sales
    PERFORM record_profit(
      transaction_id, NULL, NULL, p_customer_name, p_product_id,
      p_quantity, p_base_price, p_selling_price, 'initial_sale'
    );
  END IF;
  
  -- UPDATE INVENTORY - GUARANTEED
  UPDATE products 
  SET stocks = new_stock
  WHERE id = p_product_id;
  
  -- Handle empty tanks
  IF p_returned_empty THEN
    returned_quantity := p_quantity - p_empty_quantity_not_returned;
    
    -- Add returned tanks to product stock
    UPDATE products 
    SET stocks = stocks + returned_quantity
    WHERE id = p_product_id;
    
    -- Update shop empty tanks
    INSERT INTO shop_empty_tanks (product_id, quantity)
    VALUES (p_product_id, returned_quantity)
    ON CONFLICT (product_id) 
    DO UPDATE SET quantity = shop_empty_tanks.quantity + returned_quantity;
    
    -- Handle unreturned tanks
    IF p_empty_quantity_not_returned > 0 THEN
      INSERT INTO empty_tanks_unreturned (customer_name, product_id, quantity, date)
      VALUES (p_customer_name, p_product_id, p_empty_quantity_not_returned, NOW())
      ON CONFLICT (customer_name, product_id) 
      DO UPDATE SET 
        quantity = empty_tanks_unreturned.quantity + p_empty_quantity_not_returned,
        date = NOW();
    END IF;
    
  ELSIF p_empty_quantity_not_returned > 0 THEN
    -- All tanks not returned
    INSERT INTO empty_tanks_unreturned (customer_name, product_id, quantity, date)
    VALUES (p_customer_name, p_product_id, p_empty_quantity_not_returned, NOW())
    ON CONFLICT (customer_name, product_id) 
    DO UPDATE SET 
      quantity = empty_tanks_unreturned.quantity + p_empty_quantity_not_returned,
      date = NOW();
  END IF;
  
  -- Calculate final stock after empty tank handling
  IF p_returned_empty THEN
    new_stock := new_stock + returned_quantity;
  END IF;
  
  RETURN QUERY SELECT transaction_id, TRUE, 'Transaction completed successfully'::TEXT, new_stock;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Create a simple test function
CREATE OR REPLACE FUNCTION test_inventory_deduction(
  p_product_id UUID,
  p_quantity INTEGER
) RETURNS TABLE(
  before_stock INTEGER,
  after_stock INTEGER,
  success BOOLEAN,
  message TEXT
) AS $$
DECLARE
  before_stock INTEGER;
  after_stock INTEGER;
BEGIN
  -- Get stock before
  SELECT stocks INTO before_stock FROM products WHERE id = p_product_id;
  
  -- Try to deduct
  BEGIN
    UPDATE products SET stocks = stocks - p_quantity WHERE id = p_product_id;
    SELECT stocks INTO after_stock FROM products WHERE id = p_product_id;
    
    RETURN QUERY SELECT before_stock, after_stock, TRUE, 'Success'::TEXT;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT before_stock, before_stock, FALSE, SQLERRM::TEXT;
  END;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Grant permissions
GRANT EXECUTE ON FUNCTION deduct_inventory TO authenticated;
GRANT EXECUTE ON FUNCTION create_transaction_with_inventory TO authenticated;
GRANT EXECUTE ON FUNCTION test_inventory_deduction TO authenticated;

-- Step 5: Test the function
SELECT 'Inventory deduction functions created successfully!' as status;

-- Optional: Test with a real product (uncomment to test)
-- SELECT * FROM test_inventory_deduction('your-product-id-here', 1);
