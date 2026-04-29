-- Check what product categories exist in the enum
SELECT 
    enumlabel as category_value
FROM pg_enum
WHERE enumtypid = (
    SELECT oid 
    FROM pg_type 
    WHERE typname = 'product_category'
)
ORDER BY enumsortorder;

-- Check what categories are actually being used in products table
SELECT 
    category,
    COUNT(*) as product_count
FROM products
GROUP BY category
ORDER BY product_count DESC;
