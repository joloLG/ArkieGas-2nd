-- FIX BOOLEAN CONVERSION ISSUE IN BULK SALES
-- This fixes the "invalid input syntax for type integer: t" error

-- Update the bulk sales function to handle integer (0/1) instead of boolean
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
    sale_record JSONB;
    transaction_id UUID;
    stock_before INTEGER;
    stock_after INTEGER;
    product_name TEXT;
    sale_count INTEGER := 0;
BEGIN
    -- Validate input is not null or empty
    IF p_sales IS NULL THEN
        RETURN QUERY SELECT FALSE, 'No sales data provided'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::INTEGER, NULL::INTEGER;
        RETURN;
    END IF;
    
    -- Handle case where input might be a string (JSON string)
    IF jsonb_typeof(p_sales) = 'string' THEN
        -- Try to parse the string as JSON
        BEGIN
            p_sales := p_sales::JSONB;
        EXCEPTION WHEN OTHERS THEN
            RETURN QUERY SELECT FALSE, 'Invalid JSON string provided'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::INTEGER, NULL::INTEGER;
            RETURN;
        END;
    END IF;
    
    -- Check if it's a valid JSON array
    IF jsonb_typeof(p_sales) != 'array' THEN
        RETURN QUERY SELECT FALSE, 'Sales data must be a JSON array'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::INTEGER, NULL::INTEGER;
        RETURN;
    END IF;
    
    -- Get the count of sales
    sale_count := jsonb_array_length(p_sales);
    
    IF sale_count = 0 THEN
        RETURN QUERY SELECT FALSE, 'Empty sales array provided'::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::INTEGER, NULL::INTEGER;
        RETURN;
    END IF;
    
    -- Process each sale in the bulk array
    FOR sale_record IN SELECT value FROM jsonb_array_elements(p_sales)
    LOOP
        BEGIN
            -- Validate required fields exist
            IF NOT (
                sale_record ? 'customer_name' AND
                sale_record ? 'product_id' AND
                sale_record ? 'quantity' AND
                sale_record ? 'selling_price' AND
                sale_record ? 'base_price' AND
                sale_record ? 'payment_method'
            ) THEN
                RETURN QUERY SELECT FALSE, 'Missing required fields in sale data'::TEXT, 
                    NULL::UUID, COALESCE(sale_record->>'customer_name', 'Unknown'), 'Unknown'::TEXT, NULL::INTEGER, NULL::INTEGER;
                CONTINUE;
            END IF;
            
            -- Extract sale parameters with proper type casting
            DECLARE
                v_customer_name TEXT := sale_record->>'customer_name';
                v_product_id UUID := (sale_record->>'product_id')::UUID;
                v_quantity INTEGER := (sale_record->>'quantity')::INTEGER;
                v_selling_price DECIMAL := (sale_record->>'selling_price')::DECIMAL;
                v_base_price DECIMAL := (sale_record->>'base_price')::DECIMAL;
                v_payment_method TEXT := sale_record->>'payment_method';
                v_payment_value DECIMAL := COALESCE((sale_record->>'payment_value')::DECIMAL, 0);
                v_returned_empty BOOLEAN := COALESCE((sale_record->>'returned_empty')::INTEGER, 0) = 1;
                v_empty_quantity_not_returned INTEGER := COALESCE((sale_record->>'empty_quantity_not_returned')::INTEGER, 0);
            BEGIN
                -- Call the single transaction function
                SELECT * INTO transaction_id, stock_before, stock_after
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
                
                -- Get product name for reporting
                SELECT name INTO product_name FROM products WHERE id = v_product_id;
                
                -- Return success result
                RETURN QUERY SELECT TRUE, 'Sale processed successfully'::TEXT, 
                    transaction_id, v_customer_name, COALESCE(product_name, 'Unknown'), 
                    stock_before, stock_after;
                    
            EXCEPTION WHEN OTHERS THEN
                -- Return error result with specific error message
                RETURN QUERY SELECT FALSE, SQLERRM::TEXT, 
                    NULL::UUID, v_customer_name, COALESCE(product_name, 'Unknown'),
                    NULL::INTEGER, NULL::INTEGER;
            END;
        END;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION create_bulk_sale_transactions TO authenticated;

SELECT 'Boolean conversion fix applied!' as status,
       'Updated bulk sales function to handle integer (0/1) for boolean fields' as details;
