-- DIAGNOSTIC SCRIPT TO IDENTIFY THE EXACT SOURCE OF THE BOOLEAN ERROR
-- This will help us pinpoint where the "invalid input syntax for type integer: t" is coming from

-- First, let's check all versions of create_sale_transaction that might exist
SELECT 
    proname as function_name,
    oid as function_oid,
    pronargs as num_args,
    proargtypes as arg_type_oids,
    array_to_string(array_agg(pg_get_function_arguments(oid)), ', ') as signature
FROM pg_proc 
WHERE proname = 'create_sale_transaction'
GROUP BY proname, oid, pronargs, proargtypes
ORDER BY oid;

-- Now let's test the bulk function with detailed error reporting
DO $$
DECLARE
    test_sales JSONB := '[
        {
            "customer_name": "Test Customer",
            "product_id": "00000000-0000-0000-0000-000000000000",
            "quantity": 1,
            "selling_price": 50.00,
            "base_price": 30.00,
            "payment_method": "cash",
            "payment_value": 50.00,
            "returned_empty": true,
            "empty_quantity_not_returned": 0
        }
    ]';
    test_result RECORD;
    error_count INTEGER := 0;
BEGIN
    -- Test the bulk function
    BEGIN
        FOR test_result IN SELECT * FROM create_bulk_sale_transactions(test_sales)
        LOOP
            IF test_result.success THEN
                RAISE NOTICE '✅ Success: %', test_result.message;
            ELSE
                RAISE NOTICE '❌ Failed: %', test_result.message;
                error_count := error_count + 1;
            END IF;
        END LOOP;
        
        IF error_count = 0 THEN
            RAISE NOTICE '✅ Bulk function test passed!';
        ELSE
            RAISE NOTICE '❌ Bulk function test failed with % errors', error_count;
        END IF;
        
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION '❌ Bulk function error: %', SQLERRM;
    END;
    
    -- Now test the single function directly
    BEGIN
        SELECT * INTO test_result
        FROM create_sale_transaction(
            'Test Customer'::TEXT,
            '00000000-0000-0000-0000-000000000000'::UUID,
            1::INTEGER,
            50.00::NUMERIC,
            30.00::NUMERIC,
            'cash'::TEXT,
            50.00::NUMERIC,
            TRUE::BOOLEAN,
            0::INTEGER
        ) LIMIT 1;
        
        RAISE NOTICE '✅ Single function test passed (should fail on product not found, but not on type errors)';
        
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE 'invalid input syntax%' THEN
            RAISE EXCEPTION '❌ Single function type error: %', SQLERRM;
        ELSIF SQLERRM LIKE 'Product not found%' THEN
            RAISE NOTICE '✅ Single function types are correct (failed on product not found as expected)';
        ELSE
            RAISE NOTICE 'ℹ️ Single function other error: %', SQLERRM;
        END IF;
    END;
    
END $$;

-- Check if there are any other functions that might be interfering
SELECT 
    proname as function_name,
    prosrc as source_code_snippet
FROM pg_proc 
WHERE proname LIKE '%sale%' 
   AND proname != 'create_sale_transaction'
   AND proname != 'create_bulk_sale_transactions'
LIMIT 10;
