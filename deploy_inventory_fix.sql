-- DEPLOYMENT SCRIPT
-- Run this script to apply the comprehensive inventory fix

-- This script will:
-- 1. Drop old conflicting functions
-- 2. Create the unified transaction system
-- 3. Update permissions
-- 4. Provide feedback on success

-- Execute the comprehensive fix
\i fix_inventory_comprehensive.sql

-- Verify the functions were created successfully
SELECT 
    proname as function_name,
    pg_get_function_arguments(oid) as parameters
FROM pg_proc 
WHERE proname IN ('create_sale_transaction', 'create_bulk_sale_transactions')
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- Test the functions with a simple validation
DO $$
BEGIN
    -- Test that functions exist and are executable
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_sale_transaction') THEN
        RAISE NOTICE '✅ create_sale_transaction function created successfully';
    ELSE
        RAISE EXCEPTION '❌ create_sale_transaction function not found';
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_bulk_sale_transactions') THEN
        RAISE NOTICE '✅ create_bulk_sale_transactions function created successfully';
    ELSE
        RAISE EXCEPTION '❌ create_bulk_sale_transactions function not found';
    END IF;
    
    RAISE NOTICE '🎉 All inventory functions deployed successfully!';
END $$;

-- Show current stock levels for verification
SELECT 
    name as product_name,
    stocks as current_stock,
    min_alert as minimum_alert_level
FROM products 
ORDER BY name;

SELECT 'Inventory fix deployment completed!' as status,
       'Frontend should now use unified transaction functions' as next_step;
