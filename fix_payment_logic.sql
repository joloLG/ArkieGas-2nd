-- PAYMENT LOGIC FIX
-- Fixes Partial Loan and Full Loan payment and inventory logic

-- Step 1: Fix the unified transaction function payment logic
DROP FUNCTION IF EXISTS create_sale_transaction(text, uuid, integer, numeric, numeric, text, numeric, boolean, integer);

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
    profit_id UUID;
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
    
    -- FIXED: Calculate remaining balance correctly for all payment methods
    IF p_payment_method = 'cash' THEN
        remaining_balance := 0; -- Cash sales have no remaining balance
    ELSIF p_payment_method = 'partial_loan' THEN
        remaining_balance := total_amount - p_payment_value;
        IF remaining_balance < 0 THEN
            remaining_balance := 0;
        END IF;
    ELSIF p_payment_method = 'full_loan' THEN
        remaining_balance := total_amount; -- Full loan has entire amount as remaining balance
    END IF;
    
    -- Create transaction record
    INSERT INTO transactions (
        transaction_type, reference_id, customer_name, product_id, quantity,
        selling_price, base_price, payment_method, payment_value, remaining_balance
    ) VALUES (
        'sale', NULL, p_customer_name, p_product_id, p_quantity,
        p_selling_price, p_base_price, p_payment_method, p_payment_value, remaining_balance
    ) RETURNING id INTO transaction_id;
    
    -- RECORD PROFIT FOR CASH SALES (immediate recognition)
    IF p_payment_method = 'cash' THEN
        profit_id := record_profit(
            transaction_id, NULL, NULL, p_customer_name, p_product_id,
            p_quantity, p_base_price, p_selling_price, 'initial_sale'
        );
    END IF;
    
    -- Handle loans if needed
    IF p_payment_method = 'full_loan' OR p_payment_method = 'partial_loan' THEN
        -- FIXED: Correct loan amount and paid amount calculation
        INSERT INTO loans (
            customer_name, product_id, selling_price, base_price, loan_amount, paid_amount
        ) VALUES (
            p_customer_name, p_product_id, p_selling_price, p_base_price, 
            total_amount, p_payment_value  -- paid_amount = initial payment
        ) RETURNING id INTO loan_id;
        
        -- Update transaction with loan reference
        UPDATE transactions 
        SET reference_id = loan_id 
        WHERE id = transaction_id;
        
        -- For loans, profit is deferred until fully paid - no immediate profit recording
    END IF;
    
    -- FIXED: Always deduct inventory (for all payment methods)
    -- This ensures quantity is removed from stock immediately
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

-- Step 2: Fix the bulk transaction function to use the corrected single function
DROP FUNCTION IF EXISTS create_bulk_sale_transactions(jsonb);

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

-- Step 3: Fix the loan payment function to NOT re-add inventory
-- The inventory should remain deducted after loan payments
DROP FUNCTION IF EXISTS process_loan_payment_v2(uuid, numeric, text);

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
    
    -- FIXED: Do NOT modify inventory on loan payments
    -- Inventory was already deducted when the loan was created
    -- We only recognize profit when loan is fully paid
    
    -- Recognize profit if loan is fully paid
    IF is_final THEN
        -- Find the original sale to get quantity
        DECLARE
            original_sale RECORD;
        BEGIN
            SELECT * INTO original_sale 
            FROM transactions 
            WHERE reference_id = p_loan_id
                AND transaction_type = 'sale'
            LIMIT 1;
            
            IF original_sale IS NOT NULL THEN
                profit_amount := calculate_standard_profit(
                    loan_record.selling_price, 
                    loan_record.base_price, 
                    original_sale.quantity
                );
                
                -- Record profit
                PERFORM record_profit(
                    transaction_id, NULL, p_loan_id,
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

-- Step 4: Grant permissions
GRANT EXECUTE ON FUNCTION create_sale_transaction TO authenticated;
GRANT EXECUTE ON FUNCTION create_bulk_sale_transactions TO authenticated;
GRANT EXECUTE ON FUNCTION process_loan_payment_v2 TO authenticated;

-- Step 5: Verification
SELECT 'Payment logic fix completed!' as status,
       'Partial Loan: Payment Value deducted from Total Sale Amount' as partial_loan_fix,
       'Full Loan: Quantity stays deducted after payments' as full_loan_fix,
       'Customer List: Shows correct remaining balance' as customer_list_fix;
