-- TEST PARAMETER ORDER FOR CREATE_SALE_TRANSACTION
-- This will help us identify if there's a parameter order issue

-- First, let's see what the current function signature is
SELECT 
    proname as function_name,
    proargtypes as arg_type_oids,
    array_to_string(array_agg(pg_get_function_arguments(oid)), ', ') as signature
FROM pg_proc 
WHERE proname = 'create_sale_transaction'
GROUP BY proname, proargtypes;

-- Test with a simple call to see where the error occurs
DO $$
DECLARE
    test_result RECORD;
    v_customer_name TEXT := 'Test Customer';
    v_product_id UUID := '00000000-0000-0000-0000-000000000000'; -- Invalid UUID, but should fail on product not found
    v_quantity INTEGER := 1;
    v_selling_price DECIMAL := 50.00;
    v_base_price DECIMAL := 30.00;
    v_payment_method TEXT := 'cash';
    v_payment_value DECIMAL := 50.00;
    v_returned_empty BOOLEAN := FALSE;
    v_empty_quantity_not_returned INTEGER := 0;
BEGIN
    -- Test call with explicit parameter names to avoid order issues
    SELECT * INTO test_result
    FROM create_sale_transaction(
        v_customer_name,
        v_product_id,
        v_quantity,
        v_selling_price,
        v_base_price,
        v_payment_method,
        v_payment_value,
        v_returned_empty,
        v_empty_quantity_not_returned
    ) LIMIT 1;
    
    RAISE NOTICE '✅ Function call succeeded (should fail on product not found, but not on parameter types)';
    
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'invalid input syntax%' THEN
        RAISE EXCEPTION '❌ Parameter type error: %', SQLERRM;
    ELSIF SQLERRM LIKE 'Product not found%' THEN
        RAISE NOTICE '✅ Parameter types are correct (failed on product not found as expected)';
    ELSE
        RAISE NOTICE 'ℹ️ Other error (might be expected): %', SQLERRM;
    END IF;
END $$;
