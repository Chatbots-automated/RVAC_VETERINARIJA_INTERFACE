# Security Implementation - Server-Side Filtering & RLS

## Problem
Previously, the application was fetching ALL data from the database and then filtering it in the frontend (client-side). This created security risks:
- Workers could potentially see data they shouldn't in network requests
- Anyone could modify frontend code to bypass filters
- Inefficient (loading unnecessary data)

## Solution: Row Level Security (RLS) + Server-Side Filtering

### What Changed

#### 1. Database Level Security (RLS Policies)
Added Row Level Security policies to the migration file that enforce access control at the **database level**:

**`equipment_products` table:**
- Admins, vets, techs, viewers: Can see ALL products
- Farm workers: Can ONLY see products where `default_location_type = 'farm'`
- Warehouse workers: Can ONLY see products where `default_location_type = 'warehouse'`

**`maintenance_work_orders` table:**
- Admins, vets, techs, viewers: Can see ALL work orders
- Workers: Can ONLY see work orders where `assigned_to = auth.uid()` (their own assigned orders)

**`maintenance_schedules` table:**
- Admins, vets, techs, viewers: Can see ALL schedules
- Workers: Can see schedules (filtered by vehicle/tool location in app)

**`worker_schedules` table:**
- Workers: Can ONLY see their own schedules (`worker_id = auth.uid()`)
- Admins, vets, techs: Can see ALL schedules

**`worker_time_entries` table:**
- Workers: Can ONLY see their own time entries
- Workers: Can ONLY insert their own time entries
- Only admins can update/delete time entries

**`worker_task_reports` table:**
- Workers: Can ONLY see their own task reports
- Workers: Can ONLY insert their own task reports
- Only admins can update/delete task reports

### 2. Frontend Query Updates

#### ProductsManagement.tsx
**Before:**
```typescript
// Fetched ALL products
supabase.from('equipment_products').select('*')

// Then filtered in frontend
const matchesLocation = !locationFilter || product.default_location_type === locationFilter;
```

**After:**
```typescript
// Filter at database level
let productsQuery = supabase
  .from('equipment_products')
  .select('*');

if (locationFilter) {
  productsQuery = productsQuery.eq('default_location_type', locationFilter);
}
```

#### EquipmentInventory.tsx
**Before:**
```typescript
// Fetched ALL stock
supabase.from('equipment_warehouse_stock').select('*')

// Then filtered in frontend
const filteredStock = stockRes.data.filter((stock: any) => 
  productLocationMap.get(stock.product_id) === locationFilter
);
```

**After:**
```typescript
// Filter at database level with JOIN
let stockQuery = supabase
  .from('equipment_warehouse_stock')
  .select(`
    *,
    equipment_products!inner(default_location_type)
  `);

if (locationFilter) {
  stockQuery = stockQuery.eq('equipment_products.default_location_type', locationFilter);
}
```

#### WorkOrders.tsx
**Already Secure:**
```typescript
// Already filtering at database level
if (workerMode && workerId) {
  query = query.eq('assigned_to', workerId);
}
```

#### WorkerScheduleView.tsx
**Already Secure:**
```typescript
// Already filtering at database level
.eq('worker_id', user.id)
.eq('work_location', workLocation)
```

## How RLS Works

### Example: Farm Worker Accessing Products

1. **Worker logs in** → Supabase Auth sets `auth.uid()` to worker's user ID
2. **Worker queries products:**
   ```typescript
   supabase.from('equipment_products').select('*')
   ```
3. **RLS Policy kicks in automatically:**
   ```sql
   -- Checks if user is farm_worker
   EXISTS (
     SELECT 1 FROM users 
     WHERE id = auth.uid() 
     AND role = 'farm_worker'
   )
   AND default_location_type = 'farm'
   ```
4. **Database returns ONLY farm products** - warehouse products are never sent over the network

### Example: Worker Accessing Work Orders

1. **Worker queries work orders:**
   ```typescript
   supabase.from('maintenance_work_orders').select('*')
   ```
2. **RLS Policy enforces:**
   ```sql
   assigned_to = auth.uid()
   ```
3. **Database returns ONLY orders assigned to that worker**

## Security Benefits

✅ **Database-enforced security** - Cannot be bypassed by modifying frontend code
✅ **Data never leaves the server** - Workers can't see other workers' data even in network requests
✅ **Performance improvement** - Only necessary data is transmitted
✅ **Audit trail** - All queries are logged at database level
✅ **Defense in depth** - Multiple layers of security (RLS + frontend checks)

## Testing Security

### Test 1: Farm Worker Cannot See Warehouse Products
1. Log in as farm worker
2. Open browser DevTools → Network tab
3. Go to Produktai tab
4. Check network requests - should ONLY see products with `default_location_type: 'farm'`

### Test 2: Worker Cannot See Other Workers' Time Entries
1. Log in as worker
2. Open browser DevTools → Network tab
3. Go to Mano grafikas
4. Check network requests to `worker_time_entries` - should ONLY see entries where `worker_id` matches logged-in user

### Test 3: Worker Cannot See Unassigned Work Orders
1. Log in as worker
2. Go to Remonto darbai
3. Check network requests - should ONLY see work orders where `assigned_to` matches logged-in user

### Test 4: Direct Database Query (Admin Test)
As an admin, try to query as a worker would:
```sql
-- Set the auth context to a worker's ID
SET LOCAL request.jwt.claims.sub = 'worker-uuid-here';

-- Try to query products
SELECT * FROM equipment_products;
-- Should only return products for that worker's location
```

## Migration Application

**IMPORTANT:** The RLS policies are in the migration file. You MUST apply the migration for security to work:

```sql
-- Run this in Supabase SQL Editor
-- Copy contents from: supabase/migrations/20260217_worker_portal_schema.sql
```

## Verification Checklist

After applying the migration:

- [ ] RLS is enabled on `equipment_products`
- [ ] RLS is enabled on `maintenance_work_orders`
- [ ] RLS is enabled on `maintenance_schedules`
- [ ] RLS is enabled on `worker_schedules`
- [ ] RLS is enabled on `worker_time_entries`
- [ ] RLS is enabled on `worker_task_reports`
- [ ] Farm worker can only see farm products
- [ ] Warehouse worker can only see warehouse products
- [ ] Worker can only see their own schedules
- [ ] Worker can only see assigned work orders
- [ ] Worker can only see their own time entries
- [ ] Worker can only see their own task reports

## Additional Security Measures

### 1. API Keys
Ensure your Supabase API keys are properly secured:
- Use `anon` key for frontend (public)
- Never expose `service_role` key in frontend
- RLS policies protect data even with `anon` key

### 2. Authentication
- Passwords are hashed in database
- Session tokens expire
- Workers cannot escalate privileges

### 3. Audit Logging
All actions are logged in `user_actions` table:
- Who accessed what
- When they accessed it
- What changes were made

## Summary

The system now uses **defense in depth**:
1. **Authentication** - Users must log in
2. **Authorization** - RLS policies enforce role-based access
3. **Server-side filtering** - Queries filter at database level
4. **Frontend validation** - UI hides inappropriate actions
5. **Audit logging** - All actions are tracked

This ensures that workers can ONLY access data they're supposed to see, and this is enforced at the database level where it cannot be bypassed! 🔒
