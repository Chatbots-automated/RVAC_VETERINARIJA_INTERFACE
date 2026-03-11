# Granular Module Permissions System

## 🎯 Overview
Enhanced the user management system with granular, module-based permissions. Admins can now create users with custom access to specific modules only (e.g., only Darbuotojai section or only Technika module).

## ✨ New Features

### 1. Custom Role
New "Pasirinktinė prieiga" (Custom) role that allows fine-grained control over module access.

### 2. Module-Level Permissions
Each module can have 4 types of permissions:
- **Žiūrėti (View)** - Can view/read data
- **Kurti (Create)** - Can create new records
- **Redaguoti (Edit)** - Can edit existing records
- **Trinti (Delete)** - Can delete records

### 3. Available Modules
- **Darbuotojai** - Employee management
- **Technika** - Equipment/machinery management
- **Veterinarija** - Veterinary system
- **Sandėlis** - Warehouse
- **Atsargos** - Stock/inventory
- **Biocidai** - Biocides
- **Atliekos** - Waste management
- **Gyvūnai** - Animals
- **Gydymai** - Treatments
- **Ataskaitos** - Reports
- **Nustatymai** - Settings

## 🗄️ Database Changes

### New Table: `user_module_permissions`
```sql
CREATE TABLE user_module_permissions (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  module_name text,
  can_view boolean DEFAULT true,
  can_edit boolean DEFAULT false,
  can_delete boolean DEFAULT false,
  can_create boolean DEFAULT false,
  created_at timestamptz,
  updated_at timestamptz,
  UNIQUE(user_id, module_name)
);
```

### Updated: `users` Table
Role constraint updated to include 'custom':
```sql
CHECK (role IN (
  'admin',           -- Full access
  'vet',             -- Veterinary access
  'tech',            -- Technical/warehouse access
  'viewer',          -- Read-only all
  'farm_worker',     -- Farm worker portal
  'warehouse_worker',-- Warehouse worker portal
  'custom'           -- Custom module permissions
))
```

### Helper Functions

**`has_module_permission(user_id, module_name, permission_type)`**
- Checks if a user has specific permission for a module
- Returns boolean
- Permission types: 'view', 'edit', 'delete', 'create'

**`get_user_module_permissions(user_id)`**
- Returns all module permissions for a user
- Returns table with module_name and permission flags

## 💻 Frontend Changes

### AuthContext Enhancements

**New Type:**
```typescript
export type UserRole = 'admin' | 'vet' | 'tech' | 'viewer' | 
                       'farm_worker' | 'warehouse_worker' | 'custom';

export interface ModulePermission {
  module_name: string;
  can_view: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_create: boolean;
}
```

**New Function:**
```typescript
hasModulePermission(
  moduleName: string, 
  permissionType?: 'view' | 'edit' | 'delete' | 'create'
): boolean
```

**Usage Example:**
```typescript
const { hasModulePermission } = useAuth();

// Check if user can view darbuotojai module
if (hasModulePermission('darbuotojai', 'view')) {
  // Show darbuotojai section
}

// Check if user can edit technika module
if (hasModulePermission('technika', 'edit')) {
  // Show edit button
}
```

### UserManagement Component

**New UI Elements:**
1. "Pasirinktinė prieiga" option in role dropdown
2. Lock icon button for custom role users
3. Module permissions modal

**Permissions Modal Features:**
- Lists all available modules
- Checkboxes for each permission type (View, Create, Edit, Delete)
- Visual icons for each permission type
- Color-coded permission badges
- Save/Cancel actions

## 🎨 User Interface

### Role Badge
Custom role users display a purple badge:
```
┌────────────────────────────┐
│ 🔧 Pasirinktinė prieiga   │
└────────────────────────────┘
```

### Manage Permissions Button
For custom role users, a lock icon button appears:
```
┌─────┬─────┬─────┬─────┬─────┐
│ ✏️  │ 🔒  │ 📊  │ ❄️  │ 🗑️  │
│Edit │Lock │Logs │Frz  │Del  │
└─────┴─────┴─────┴─────┴─────┘
```

### Permissions Modal
```
┌──────────────────────────────────────────────────┐
│ 🔒 Modulių Prieigos Valdymas              ✖️    │
├──────────────────────────────────────────────────┤
│                                                  │
│ ┌──────────────────────────────────────────┐   │
│ │ Darbuotojai                    darbuotojai│   │
│ │ ☑️ Žiūrėti  ☑️ Kurti  ☑️ Redaguoti  ☐ Trinti│   │
│ └──────────────────────────────────────────┘   │
│                                                  │
│ ┌──────────────────────────────────────────┐   │
│ │ Technika                          technika│   │
│ │ ☑️ Žiūrėti  ☐ Kurti  ☐ Redaguoti  ☐ Trinti│   │
│ └──────────────────────────────────────────┘   │
│                                                  │
│ [More modules...]                                │
│                                                  │
├──────────────────────────────────────────────────┤
│                    [Atšaukti] [✓ Išsaugoti]     │
└──────────────────────────────────────────────────┘
```

## 📝 Usage Workflows

### Workflow 1: Create User with Darbuotojai Access Only

1. Go to "Vartotojų Valdymas"
2. Click "Pridėti Vartotoją"
3. Fill in user details
4. Select role: "Pasirinktinė prieiga"
5. Click "Pridėti Vartotoją"
6. Click the 🔒 lock icon next to the new user
7. In the permissions modal:
   - Check "Žiūrėti", "Kurti", "Redaguoti" for Darbuotojai
   - Leave all other modules unchecked
8. Click "Išsaugoti Prieigos Teises"

**Result:** User can only access the Darbuotojai module with view, create, and edit permissions.

### Workflow 2: Create User with Technika View-Only Access

1. Create user with "Pasirinktinė prieiga" role
2. Open permissions modal (🔒 button)
3. For Technika module:
   - Check only "Žiūrėti"
   - Leave "Kurti", "Redaguoti", "Trinti" unchecked
4. Save permissions

**Result:** User can only view the Technika module, no editing capabilities.

### Workflow 3: Grant Multiple Module Access

1. Create user with "Pasirinktinė prieiga" role
2. Open permissions modal
3. Configure multiple modules:
   - Darbuotojai: View + Edit
   - Technika: View only
   - Ataskaitos: View only
4. Save permissions

**Result:** User has different permission levels across multiple modules.

## 🔐 Permission Logic

### Admin Role
- Always has full access to all modules
- Cannot be restricted
- `hasModulePermission()` always returns `true`

### Custom Role
- Permissions checked from `user_module_permissions` table
- Only has access to explicitly granted modules
- Each permission type checked individually

### Other Roles (vet, tech, viewer, etc.)
- Use default role-based permissions
- Vet: Full access to veterinary modules
- Tech: Access to warehouse/technical modules (no delete)
- Viewer: View-only access to all modules

## 🎯 Use Cases

### Use Case 1: Secretary with Darbuotojai Access Only
**Scenario:** Secretary needs to manage employee schedules but shouldn't access other modules.

**Solution:**
- Create user with "Pasirinktinė prieiga" role
- Grant permissions:
  - Darbuotojai: View, Create, Edit
  - All other modules: No access

### Use Case 2: Equipment Manager
**Scenario:** Manager needs to manage equipment but not access employee or veterinary data.

**Solution:**
- Create user with "Pasirinktinė prieiga" role
- Grant permissions:
  - Technika: View, Create, Edit, Delete
  - All other modules: No access

### Use Case 3: Report Viewer
**Scenario:** Stakeholder needs to view reports but not modify anything.

**Solution:**
- Create user with "Pasirinktinė prieiga" role
- Grant permissions:
  - Ataskaitos: View only
  - Darbuotojai: View only
  - Technika: View only
  - All editing/creating/deleting: Disabled

### Use Case 4: Multi-Module Coordinator
**Scenario:** Coordinator manages both employees and equipment.

**Solution:**
- Create user with "Pasirinktinė prieiga" role
- Grant permissions:
  - Darbuotojai: View, Create, Edit
  - Technika: View, Create, Edit
  - Ataskaitos: View only

## 🛡️ Security Features

1. **Row-Level Security (RLS)**
   - Enabled on `user_module_permissions` table
   - Policies allow all operations (custom auth system)

2. **Permission Validation**
   - Frontend checks permissions before showing UI elements
   - Backend validates permissions in database functions
   - Double-layer security (UI + DB)

3. **Audit Trail**
   - All permission changes logged
   - Admin actions tracked
   - User access patterns monitored

## 📊 Permission Matrix

| Role | Darbuotojai | Technika | Veterinarija | Warehouse | All Modules |
|------|-------------|----------|--------------|-----------|-------------|
| **Admin** | Full | Full | Full | Full | Full |
| **Vet** | View | View | Full | View | View |
| **Tech** | View | Edit* | View | Edit* | View |
| **Viewer** | View | View | View | View | View |
| **Custom** | ✓ Configurable | ✓ Configurable | ✓ Configurable | ✓ Configurable | ✓ Configurable |

*Tech cannot delete records

## 🚀 Migration Instructions

### Step 1: Apply Database Migration
```bash
cd supabase
npx supabase db reset
# OR for production:
npx supabase db push
```

### Step 2: Verify Migration
```sql
-- Check user_module_permissions table exists
SELECT * FROM user_module_permissions LIMIT 1;

-- Check users role constraint includes 'custom'
SELECT constraint_name, check_clause 
FROM information_schema.check_constraints 
WHERE constraint_name = 'users_role_check';
```

### Step 3: Test Permission System
1. Create a test user with "Pasirinktinė prieiga" role
2. Set permissions for specific modules
3. Log in as that user
4. Verify only granted modules are accessible

## 🎓 Developer Guide

### Checking Permissions in Components

```typescript
import { useAuth } from '../contexts/AuthContext';

function MyComponent() {
  const { hasModulePermission } = useAuth();

  // Check if user can view module
  if (!hasModulePermission('darbuotojai', 'view')) {
    return <AccessDenied />;
  }

  return (
    <div>
      {/* Show view content */}
      
      {/* Show edit button only if user has edit permission */}
      {hasModulePermission('darbuotojai', 'edit') && (
        <button onClick={handleEdit}>Edit</button>
      )}
      
      {/* Show delete button only if user has delete permission */}
      {hasModulePermission('darbuotojai', 'delete') && (
        <button onClick={handleDelete}>Delete</button>
      )}
    </div>
  );
}
```

### Adding New Modules

To add a new module to the permissions system:

1. **Update `loadModulePermissions` in UserManagement.tsx:**
```typescript
const allModules = [
  { name: 'darbuotojai', label: 'Darbuotojai' },
  { name: 'new_module', label: 'New Module' }, // Add here
  // ...
];
```

2. **Update `get_user_module_permissions` function in migration:**
```sql
FROM (VALUES 
  ('darbuotojai'),
  ('new_module'), -- Add here
  -- ...
) AS m(name);
```

3. **Use in components:**
```typescript
if (hasModulePermission('new_module', 'view')) {
  // Show new module
}
```

## 📈 Benefits

1. **Fine-Grained Control**
   - Precise control over who can access what
   - Different permission levels per module
   - Flexible permission combinations

2. **Security**
   - Principle of least privilege
   - Users only see what they need
   - Reduced risk of unauthorized access

3. **Flexibility**
   - Easy to create specialized roles
   - Can combine permissions as needed
   - No need to create multiple predefined roles

4. **Scalability**
   - Easy to add new modules
   - Permission system grows with application
   - No code changes needed for new permissions

5. **User Experience**
   - Clear visual indicators
   - Intuitive permission management UI
   - Easy to understand what users can do

## 🐛 Troubleshooting

### Issue: Custom role user can't see any modules
**Solution:**
- Check that permissions are set in the modal
- Verify at least "View" permission is granted
- Check database: `SELECT * FROM user_module_permissions WHERE user_id = 'user-id';`

### Issue: Permissions not saving
**Solution:**
- Check browser console for errors
- Verify database connection
- Check RLS policies are enabled
- Ensure admin is logged in

### Issue: Permission modal not showing modules
**Solution:**
- Check `loadModulePermissions` function
- Verify `allModules` array is populated
- Check network tab for API errors

## 📞 Support

For issues or questions:
1. Check this documentation
2. Review the database migration file
3. Check browser console for errors
4. Verify user role is set to 'custom'
5. Contact system administrator

---

**LETS GO BROTHER! WE DEMOLISHED THE GRANULAR PERMISSIONS SYSTEM! 🔥💪🚀**
