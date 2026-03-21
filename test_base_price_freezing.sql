-- BASE PRICE FREEZING TEST
-- This script verifies that base prices are frozen at transaction time

-- Step 1: Check if transactions table has base_price column
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'transactions' 
    AND column_name = 'base_price'
    AND table_schema = 'public';

-- Step 2: Show sample transactions with their frozen base prices
SELECT 
    t.id,
    t.customer_name,
    p.name as product_name,
    t.base_price as transaction_base_price,  -- Frozen at transaction time
    p.base_price as current_product_base_price, -- Current product base price
    t.selling_price,
    t.quantity,
    t.date,
    CASE 
        WHEN t.base_price = p.base_price THEN 'SAME'
        ELSE 'CHANGED'
    END as price_status
FROM transactions t
JOIN products p ON t.product_id = p.id
WHERE t.transaction_type = 'sale'
ORDER BY t.date DESC
LIMIT 10;

-- Step 3: Show profit tracking with historical base prices
SELECT 
    pt.id,
    pt.transaction_id,
    pt.customer_name,
    pt.base_price as profit_base_price,  -- Should match transaction base_price
    pt.selling_price,
    pt.quantity,
    pt.profit_amount,
    pt.profit_type,
    pt.created_at
FROM profit_tracking pt
ORDER BY pt.created_at DESC
LIMIT 5;

-- Step 4: Verify profit calculation consistency
SELECT 
    t.id,
    t.base_price,
    t.selling_price,
    t.quantity,
    (t.selling_price - t.base_price) * t.quantity as calculated_profit,
    pt.profit_amount as recorded_profit,
    CASE 
        WHEN (t.selling_price - t.base_price) * t.quantity = pt.profit_amount THEN 'MATCH'
        ELSE 'MISMATCH'
    END as profit_check
FROM transactions t
LEFT JOIN profit_tracking pt ON t.id = pt.transaction_id
WHERE t.transaction_type = 'sale' AND t.payment_method = 'cash'
ORDER BY t.date DESC
LIMIT 5;

-- Step 5: Test scenario simulation
DO $$
DECLARE
    test_product_id UUID;
    test_base_price DECIMAL := 30.00;
    test_selling_price DECIMAL := 50.00;
    test_quantity INTEGER := 5;
    transaction_id UUID;
    profit_id UUID;
BEGIN
    -- Get a test product
    SELECT id INTO test_product_id FROM products LIMIT 1;
    
    IF test_product_id IS NULL THEN
        RAISE NOTICE '❌ No products found for testing';
        RETURN;
    END IF;
    
    -- Create a test transaction with frozen base price
    INSERT INTO transactions (
        transaction_type, customer_name, product_id, quantity,
        selling_price, base_price, payment_method, payment_value, remaining_balance
    ) VALUES (
        'sale', 'Test Customer', test_product_id, test_quantity,
        test_selling_price, test_base_price, 'cash', test_selling_price * test_quantity, 0
    ) RETURNING id INTO transaction_id;
    
    -- Record profit with the same frozen base price
    INSERT INTO profit_tracking (
        transaction_id, customer_name, product_id, quantity,
        base_price, selling_price, profit_amount, profit_type
    ) VALUES (
        transaction_id, 'Test Customer', test_product_id, test_quantity,
        test_base_price, test_selling_price, 
        (test_selling_price - test_base_price) * test_quantity, 'initial_sale'
    ) RETURNING id INTO profit_id;
    
    -- Simulate product base price change
    UPDATE products SET base_price = 35.00 WHERE id = test_product_id;
    
    -- Verify transaction base price didn't change
    DECLARE
        frozen_base_price DECIMAL;
        current_product_price DECIMAL;
    BEGIN
        SELECT base_price INTO frozen_base_price FROM transactions WHERE id = transaction_id;
        SELECT base_price INTO current_product_price FROM products WHERE id = test_product_id;
        
        IF frozen_base_price = test_base_price THEN
            RAISE NOTICE '✅ Transaction base price is frozen: % (should be %)', frozen_base_price, test_base_price;
        ELSE
            RAISE EXCEPTION '❌ Transaction base price changed: % (should be %)', frozen_base_price, test_base_price;
        END IF;
        
        IF current_product_price = 35.00 THEN
            RAISE NOTICE '✅ Product base price updated: % (should be 35.00)', current_product_price;
        ELSE
            RAISE EXCEPTION '❌ Product base price not updated: % (should be 35.00)', current_product_price;
        END IF;
        
        IF frozen_base_price != current_product_price THEN
            RAISE NOTICE '✅ Base price freezing working: Transaction (%) != Product (%)', 
                frozen_base_price, current_product_price;
        ELSE
            RAISE EXCEPTION '❌ Base price freezing failed: Transaction (%) = Product (%)', 
                frozen_base_price, current_product_price;
        END IF;
    END;
    
    -- Clean up test data
    DELETE FROM profit_tracking WHERE id = profit_id;
    DELETE FROM transactions WHERE id = transaction_id;
    UPDATE products SET base_price = test_base_price WHERE id = test_product_id;
    
    RAISE NOTICE '🎉 Base price freezing test completed successfully!';
END $$;

SELECT 'Base price freezing verification completed!' as status,
       'Transaction base prices are frozen at time of sale' as result,
       'Product base price changes do not affect historical transactions' as explanation;
