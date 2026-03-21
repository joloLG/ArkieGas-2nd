-- MINIMAL FIX: Only Inventory Deduction - Don't Touch Other Functions
-- This fixes only the stock deduction issue without affecting existing logic

-- Step 1: Create a simple inventory deduction function that works with existing code
CREATE OR REPLACE FUNCTION ensure_inventory_deduction(
  p_product_id UUID,
  p_quantity INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
  current_stock INTEGER;
BEGIN
  -- Get current stock
  SELECT stocks INTO current_stock 
  FROM products 
  WHERE id = p_product_id FOR UPDATE; -- Lock the row
  
  IF current_stock IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;
  
  IF current_stock < p_quantity THEN
    RAISE EXCEPTION 'Not enough stock. Available: %, Requested: %', current_stock, p_quantity;
  END IF;
  
  -- Deduct inventory
  UPDATE products 
  SET stocks = stocks - p_quantity
  WHERE id = p_product_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Create a wrapper function that calls existing logic + ensures inventory deduction
CREATE OR REPLACE FUNCTION create_transaction_with_inventory_check(
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
  stock_before INTEGER,
  stock_after INTEGER
) AS $$
DECLARE
  transaction_id UUID;
  stock_before INTEGER;
  stock_after INTEGER;
  remaining_balance DECIMAL := 0;
  total_amount DECIMAL := p_selling_price * p_quantity;
  loan_id UUID;
BEGIN
  -- Get stock before transaction
  SELECT stocks INTO stock_before 
  FROM products 
  WHERE id = p_product_id;
  
  -- Validate stock
  IF stock_before IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, FALSE, 'Product not found'::TEXT, NULL::INTEGER, NULL::INTEGER;
    RETURN;
  END IF;
  
  IF stock_before < p_quantity THEN
    RETURN QUERY SELECT NULL::UUID, FALSE, 
      format('Not enough stock. Available: %, Requested: %', stock_before, p_quantity)::TEXT, 
      stock_before::INTEGER, stock_before::INTEGER;
    RETURN;
  END IF;
  
  -- ENSURE INVENTORY DEDUCTION FIRST
  PERFORM ensure_inventory_deduction(p_product_id, p_quantity);
  
  -- Calculate remaining balance
  IF p_payment_method = 'partial_loan' THEN
    remaining_balance := total_amount - p_payment_value;
  ELSIF p_payment_method = 'full_loan' THEN
    remaining_balance := total_amount;
  END IF;
  
  -- Use EXISTING create_transaction_v2 function (don't modify it)
  transaction_id := create_transaction_v2(
    'sale', NULL, p_customer_name, p_product_id, p_quantity,
    p_selling_price, p_base_price, p_payment_method, p_payment_value
  );
  
  -- Handle empty tanks using EXISTING logic (manually call what frontend was doing)
  IF p_returned_empty THEN
    -- Add returned tanks to product stock (same as original frontend logic)
    UPDATE products 
    SET stocks = stocks + p_empty_quantity_not_returned
    WHERE id = p_product_id;
    
    -- Handle unreturned tanks tracking (same as original)
    -- Remove from unreturned if exists
    DELETE FROM empty_tanks_unreturned
    WHERE customer_name = p_customer_name 
      AND product_id = p_product_id
      AND quantity <= p_empty_quantity_not_returned;
    
    -- Update unreturned tanks if needed
    UPDATE empty_tanks_unreturned
    SET quantity = quantity - p_empty_quantity_not_returned
    WHERE customer_name = p_customer_name 
      AND product_id = p_product_id
      AND quantity > p_empty_quantity_not_returned;
      
  ELSIF p_empty_quantity_not_returned > 0 THEN
    -- Handle unreturned tanks (same as original)
    INSERT INTO empty_tanks_unreturned (customer_name, product_id, quantity, date)
    VALUES (p_customer_name, p_product_id, p_empty_quantity_not_returned, NOW())
    ON CONFLICT (customer_name, product_id) 
    DO UPDATE SET 
      quantity = empty_tanks_unreturned.quantity + p_empty_quantity_not_returned,
      date = NOW();
  END IF;
  
  -- Calculate final stock
  SELECT stocks INTO stock_after FROM products WHERE id = p_product_id;
  
  RETURN QUERY SELECT transaction_id, TRUE, 'Transaction completed successfully'::TEXT, stock_before, stock_after;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Grant permissions
GRANT EXECUTE ON FUNCTION ensure_inventory_deduction TO authenticated;
GRANT EXECUTE ON FUNCTION create_transaction_with_inventory_check TO authenticated;

-- Success message
SELECT 'Inventory deduction fix completed - Existing functions preserved!' as status;
