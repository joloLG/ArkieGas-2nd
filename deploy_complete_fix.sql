-- COMPLETE DEPLOYMENT SCRIPT
-- This script applies both the inventory fix and profit calculation fix

-- Step 1: Apply the comprehensive inventory fix
\i fix_inventory_comprehensive.sql

-- Step 2: Apply the profit calculation fix
\i fix_profit_calculation.sql

-- Step 3: Verify all functions are working
SELECT 
    proname as function_name,
    pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname IN ('create_sale_transaction', 'create_bulk_sale_transactions', 'record_profit', 'calculate_standard_profit')
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
ORDER BY proname;

-- Step 4: Verify profit tracking table exists and has proper structure
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'profit_tracking' 
    AND table_schema = 'public'
ORDER BY ordinal_position;

-- Step 5: Test profit calculation
DO $$
DECLARE
    test_profit DECIMAL;
BEGIN
    test_profit := calculate_standard_profit(50.00, 30.00, 5);
    IF test_profit = 100.00 THEN
        RAISE NOTICE '✅ Profit calculation working correctly: 50 - 30 = 20 × 5 = 100';
    ELSE
        RAISE EXCEPTION '❌ Profit calculation failed: expected 100, got %', test_profit;
    END IF;
END $$;

-- Step 6: Show current profit tracking data
SELECT 
    COUNT(*) as total_profit_records,
    SUM(profit_amount) as total_profit,
    COUNT(DISTINCT profit_type) as profit_types
FROM profit_tracking;

-- Step 7: Verify inventory functions
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_sale_transaction') THEN
        RAISE NOTICE '✅ create_sale_transaction function ready';
    ELSE
        RAISE EXCEPTION '❌ create_sale_transaction function missing';
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_bulk_sale_transactions') THEN
        RAISE NOTICE '✅ create_bulk_sale_transactions function ready';
    ELSE
        RAISE EXCEPTION '❌ create_bulk_sale_transactions function missing';
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'record_profit') THEN
        RAISE NOTICE '✅ record_profit function ready';
    ELSE
        RAISE EXCEPTION '❌ record_profit function missing';
    END IF;
    
    RAISE NOTICE '🎉 All functions deployed successfully!';
END $$;

-- Step 8: Show current stock levels for verification
SELECT 
    name as product_name,
    stocks as current_stock,
    min_alert as minimum_alert_level
FROM products 
ORDER BY name;

SELECT 'Complete deployment finished!' as status,
       'Inventory deduction and profit tracking are now working correctly' as summary,
       'Test both single and bulk sales to verify everything works' as next_step;
