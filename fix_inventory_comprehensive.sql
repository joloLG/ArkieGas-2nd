-- COMPREHENSIVE INVENTORY FIX
-- This creates a unified transaction system that properly handles inventory deduction
-- for both single and bulk sales, with correct empty tank tracking

-- Step 1: Clean up existing functions to avoid conflicts
DROP FUNCTION IF EXISTS create_transaction_with_inventory_check(text, uuid, integer, numeric, numeric, text, numeric, boolean, integer);
DROP FUNCTION IF EXISTS ensure_inventory_deduction(uuid, integer);
DROP FUNCTION IF EXISTS create_transaction_v2(text, uuid, text, uuid, integer, numeric, numeric, text, numeric);
DROP FUNCTION IF EXISTS handle_empty_tank_return(text, uuid, integer, integer);
DROP FUNCTION IF EXISTS handle_unreturned_tanks(text, uuid, integer);
DROP FUNCTION IF EXISTS create_complete_transaction(text, uuid, integer, numeric, numeric, text, numeric, boolean, integer);

-- Step 2: Create the main unified transaction function
CREATE OR REPLACE FUNCTION create_sale_transaction(
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
    returned_quantity INTEGER;
BEGIN
    -- Get current stock and lock the row for atomic operation
    SELECT stocks INTO stock_before 
    FROM products 
    WHERE id = p_product_id FOR UPDATE;
    
    -- Validate product exists
    IF stock_before IS NULL THEN
        RETURN QUERY SELECT NULL::UUID, FALSE, 'Product not found'::TEXT, NULL::INTEGER, NULL::INTEGER;
        RETURN;
    END IF;
    
    -- Validate stock availability
    IF stock_before < p_quantity THEN
        RETURN QUERY SELECT NULL::UUID, FALSE, 
            format('Not enough stock. Available: %, Requested: %', stock_before, p_quantity)::TEXT, 
            stock_before::INTEGER, stock_before::INTEGER;
        RETURN;
    END IF;
    
    -- Calculate remaining balance based on payment method
    IF p_payment_method = 'partial_loan' THEN
        remaining_balance := total_amount - p_payment_value;
        IF remaining_balance < 0 THEN
            remaining_balance := 0;
        END IF;
    ELSIF p_payment_method = 'full_loan' THEN
        remaining_balance := total_amount;
    END IF;
    
    -- Create transaction record
    INSERT INTO transactions (
        transaction_type, reference_id, customer_name, product_id, quantity,
        selling_price, base_price, payment_method, payment_value, remaining_balance
    ) VALUES (
        'sale', NULL, p_customer_name, p_product_id, p_quantity,
        p_selling_price, p_base_price, p_payment_method, p_payment_value, remaining_balance
    ) RETURNING id INTO transaction_id;
    
    -- Handle loans if needed
    IF p_payment_method = 'full_loan' OR p_payment_method = 'partial_loan' THEN
        INSERT INTO loans (
            customer_name, product_id, selling_price, base_price, loan_amount, paid_amount
        ) VALUES (
            p_customer_name, p_product_id, p_selling_price, p_base_price, remaining_balance, p_payment_value
        ) RETURNING id INTO loan_id;
        
        -- Update transaction with loan reference
        UPDATE transactions 
        SET reference_id = loan_id 
        WHERE id = transaction_id;
    END IF;
    
    -- DEDUCT INVENTORY (ATOMIC OPERATION)
    UPDATE products 
    SET stocks = stocks - p_quantity
    WHERE id = p_product_id;
    
    -- Handle empty tank logic
    IF p_returned_empty THEN
        -- Calculate returned quantity: sold - not returned = actually returned
        returned_quantity := p_quantity - p_empty_quantity_not_returned;
        
        -- Add returned tanks back to main product stock
        IF returned_quantity > 0 THEN
            UPDATE products 
            SET stocks = stocks + returned_quantity
            WHERE id = p_product_id;
            
            -- Add to shop empty tanks inventory
            INSERT INTO shop_empty_tanks (product_id, quantity)
            VALUES (p_product_id, returned_quantity)
            ON CONFLICT (product_id) 
            DO UPDATE SET 
                quantity = shop_empty_tanks.quantity + returned_quantity;
        END IF;
        
        -- Remove from unreturned tanks if customer had previous unreturned tanks
        IF returned_quantity > 0 THEN
            DELETE FROM empty_tanks_unreturned
            WHERE customer_name = p_customer_name 
                AND product_id = p_product_id
                AND quantity <= returned_quantity;
            
            UPDATE empty_tanks_unreturned
            SET quantity = quantity - returned_quantity
            WHERE customer_name = p_customer_name 
                AND product_id = p_product_id
                AND quantity > returned_quantity;
        END IF;
        
    ELSIF p_empty_quantity_not_returned > 0 THEN
        -- Track unreturned tanks
        INSERT INTO empty_tanks_unreturned (customer_name, product_id, quantity, date)
        VALUES (p_customer_name, p_product_id, p_empty_quantity_not_returned, NOW())
        ON CONFLICT (customer_name, product_id) 
        DO UPDATE SET 
            quantity = empty_tanks_unreturned.quantity + p_empty_quantity_not_returned,
            date = NOW();
    END IF;
    
    -- Record incoming payment if there's a payment_value
    IF p_payment_value > 0 THEN
        INSERT INTO incoming_payments (
            transaction_id, customer_name, payment_amount, notes
        ) VALUES (
            transaction_id, p_customer_name, p_payment_value, 
            'Initial payment for ' || p_payment_method
        );
    END IF;
    
    -- Get final stock after all operations
    SELECT stocks INTO stock_after FROM products WHERE id = p_product_id;
    
    RETURN QUERY SELECT transaction_id, TRUE, 'Transaction completed successfully'::TEXT, stock_before, stock_after;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Create bulk transaction function for multiple sales
CREATE OR REPLACE FUNCTION create_bulk_sale_transactions(
    p_sales JSONB -- Array of sale objects with all sale parameters
) RETURNS TABLE(
    success BOOLEAN,
    message TEXT,
    transaction_id UUID,
    customer_name TEXT,
    product_name TEXT,
    stock_before INTEGER,
    stock_after INTEGER
) AS $$
DECLARE
    sale_record JSON;
    transaction_id UUID;
    stock_before INTEGER;
    stock_after INTEGER;
    product_name TEXT;
BEGIN
    -- Process each sale in the bulk array
    FOR sale_record IN SELECT * FROM jsonb_array_elements(p_sales)
    LOOP
        BEGIN
            -- Extract sale parameters
            transaction_id := (
                SELECT create_sale_transaction.* 
                FROM create_sale_transaction(
                    sale_record->>'customer_name',
                    sale_record->>'product_id'::UUID,
                    (sale_record->>'quantity')::INTEGER,
                    (sale_record->>'selling_price')::DECIMAL,
                    (sale_record->>'base_price')::DECIMAL,
                    sale_record->>'payment_method',
                    (sale_record->>'payment_value')::DECIMAL,
                    (sale_record->>'returned_empty')::BOOLEAN,
                    (sale_record->>'empty_quantity_not_returned')::INTEGER
                ) LIMIT 1
            ).transaction_id;
            
            -- Get product name for reporting
            SELECT name INTO product_name FROM products WHERE id = sale_record->>'product_id'::UUID;
            
            -- Get stock values
            SELECT stock_before, stock_after INTO stock_before, stock_after
            FROM create_sale_transaction(
                sale_record->>'customer_name',
                sale_record->>'product_id'::UUID,
                (sale_record->>'quantity')::INTEGER,
                (sale_record->>'selling_price')::DECIMAL,
                (sale_record->>'base_price')::DECIMAL,
                sale_record->>'payment_method',
                (sale_record->>'payment_value')::DECIMAL,
                (sale_record->>'returned_empty')::BOOLEAN,
                (sale_record->>'empty_quantity_not_returned')::INTEGER
            );
            
            -- Return success result
            RETURN QUERY SELECT TRUE, 'Sale processed successfully'::TEXT, 
                transaction_id, sale_record->>'customer_name', product_name, 
                stock_before, stock_after;
                
        EXCEPTION WHEN OTHERS THEN
            -- Return error result
            RETURN QUERY SELECT FALSE, SQLERRM::TEXT, 
                NULL::UUID, sale_record->>'customer_name', 'Unknown'::TEXT,
                NULL::INTEGER, NULL::INTEGER;
        END;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Grant permissions
GRANT EXECUTE ON FUNCTION create_sale_transaction TO authenticated;
GRANT EXECUTE ON FUNCTION create_bulk_sale_transactions TO authenticated;

-- Step 5: Update existing sales records to ensure consistency
UPDATE sales 
SET profit = (selling_price - (SELECT base_price FROM products WHERE products.id = sales.product_id)) * quantity
WHERE payment_method = 'cash' AND profit = 0;

-- Success message
SELECT 'Comprehensive inventory fix completed!' as status,
       'Single and bulk sales now use unified inventory deduction' as details;
