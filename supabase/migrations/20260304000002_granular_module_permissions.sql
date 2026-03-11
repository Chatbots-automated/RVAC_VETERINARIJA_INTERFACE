-- ============================================================================
-- GRANULAR MODULE PERMISSIONS SYSTEM
-- ============================================================================
-- Add module-based permissions for fine-grained access control
-- Users can now have access to specific modules only
-- ============================================================================

-- 1. Create user_module_permissions table
CREATE TABLE IF NOT EXISTS user_module_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_name text NOT NULL,
  can_view boolean DEFAULT true,
  can_edit boolean DEFAULT false,
  can_delete boolean DEFAULT false,
  can_create boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, module_name)
);

-- Add indexes for performance
CREATE INDEX idx_user_module_permissions_user ON user_module_permissions(user_id);
CREATE INDEX idx_user_module_permissions_module ON user_module_permissions(module_name);

-- Comments
COMMENT ON TABLE user_module_permissions IS 'Granular module-level permissions for users';
COMMENT ON COLUMN user_module_permissions.module_name IS 'Module identifier: darbuotojai, technika, veterinarija, sandėlis, etc.';
COMMENT ON COLUMN user_module_permissions.can_view IS 'Can view/read data in this module';
COMMENT ON COLUMN user_module_permissions.can_edit IS 'Can edit existing data in this module';
COMMENT ON COLUMN user_module_permissions.can_delete IS 'Can delete data in this module';
COMMENT ON COLUMN user_module_permissions.can_create IS 'Can create new data in this module';

-- Enable RLS
ALTER TABLE user_module_permissions ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all operations for now (custom auth)
CREATE POLICY "Allow all operations on user_module_permissions"
  ON user_module_permissions
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 2. Update users table role constraint to include new granular roles
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check 
  CHECK (role IN (
    'admin',           -- Full access to everything
    'vet',             -- Veterinary module access
    'tech',            -- Technical/warehouse module access
    'viewer',          -- Read-only access to all
    'farm_worker',     -- Farm worker portal
    'warehouse_worker',-- Warehouse worker portal
    'custom'           -- Custom permissions (uses user_module_permissions table)
  ));

-- 3. Add comments for new role
COMMENT ON COLUMN users.role IS 'User role: admin (full access), vet (veterinary), tech (warehouse), viewer (read-only), farm_worker, warehouse_worker, custom (module-based permissions)';

-- 4. Create helper function to check module permission
CREATE OR REPLACE FUNCTION has_module_permission(
  p_user_id uuid,
  p_module_name text,
  p_permission_type text DEFAULT 'view'
)
RETURNS boolean AS $$
DECLARE
  v_user_role text;
  v_has_permission boolean;
BEGIN
  -- Get user role
  SELECT role INTO v_user_role FROM users WHERE id = p_user_id;
  
  -- Admin always has all permissions
  IF v_user_role = 'admin' THEN
    RETURN true;
  END IF;
  
  -- For custom role, check user_module_permissions table
  IF v_user_role = 'custom' THEN
    CASE p_permission_type
      WHEN 'view' THEN
        SELECT can_view INTO v_has_permission 
        FROM user_module_permissions 
        WHERE user_id = p_user_id AND module_name = p_module_name;
      WHEN 'edit' THEN
        SELECT can_edit INTO v_has_permission 
        FROM user_module_permissions 
        WHERE user_id = p_user_id AND module_name = p_module_name;
      WHEN 'delete' THEN
        SELECT can_delete INTO v_has_permission 
        FROM user_module_permissions 
        WHERE user_id = p_user_id AND module_name = p_module_name;
      WHEN 'create' THEN
        SELECT can_create INTO v_has_permission 
        FROM user_module_permissions 
        WHERE user_id = p_user_id AND module_name = p_module_name;
      ELSE
        RETURN false;
    END CASE;
    
    RETURN COALESCE(v_has_permission, false);
  END IF;
  
  -- For other roles, use default role-based permissions
  -- Vet has full access to veterinary module
  IF v_user_role = 'vet' AND p_module_name IN ('veterinarija', 'animals', 'treatments') THEN
    RETURN true;
  END IF;
  
  -- Tech has access to warehouse and technical modules
  IF v_user_role = 'tech' AND p_module_name IN ('technika', 'warehouse', 'stock', 'biocides', 'waste') THEN
    RETURN p_permission_type != 'delete'; -- Tech cannot delete
  END IF;
  
  -- Viewer has view-only access to all modules
  IF v_user_role = 'viewer' AND p_permission_type = 'view' THEN
    RETURN true;
  END IF;
  
  -- Farm worker has access to farm-related modules
  IF v_user_role = 'farm_worker' AND p_module_name IN ('darbuotojai_farm', 'worker_portal_farm') THEN
    RETURN true;
  END IF;
  
  -- Warehouse worker has access to warehouse-related modules
  IF v_user_role = 'warehouse_worker' AND p_module_name IN ('darbuotojai_warehouse', 'worker_portal_warehouse') THEN
    RETURN true;
  END IF;
  
  -- Default: no permission
  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Create function to get all user permissions
CREATE OR REPLACE FUNCTION get_user_module_permissions(p_user_id uuid)
RETURNS TABLE (
  module_name text,
  can_view boolean,
  can_edit boolean,
  can_delete boolean,
  can_create boolean
) AS $$
DECLARE
  v_user_role text;
BEGIN
  -- Get user role
  SELECT role INTO v_user_role FROM users WHERE id = p_user_id;
  
  -- Admin has all permissions for all modules
  IF v_user_role = 'admin' THEN
    RETURN QUERY
    SELECT 
      m.name::text,
      true,
      true,
      true,
      true
    FROM (VALUES 
      ('darbuotojai'),
      ('technika'),
      ('veterinarija'),
      ('warehouse'),
      ('stock'),
      ('biocides'),
      ('waste'),
      ('animals'),
      ('treatments'),
      ('reports'),
      ('settings')
    ) AS m(name);
    RETURN;
  END IF;
  
  -- For custom role, return from user_module_permissions table
  IF v_user_role = 'custom' THEN
    RETURN QUERY
    SELECT 
      ump.module_name,
      ump.can_view,
      ump.can_edit,
      ump.can_delete,
      ump.can_create
    FROM user_module_permissions ump
    WHERE ump.user_id = p_user_id;
    RETURN;
  END IF;
  
  -- For other roles, return default permissions based on role
  -- This is a simplified version - expand as needed
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_module_permissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_module_permissions_updated_at
  BEFORE UPDATE ON user_module_permissions
  FOR EACH ROW
  EXECUTE FUNCTION update_user_module_permissions_updated_at();

-- 7. Insert example module permissions for demonstration
-- (These will be managed through the UI)
-- Uncomment to create example custom user with specific permissions:
/*
INSERT INTO user_module_permissions (user_id, module_name, can_view, can_edit, can_delete, can_create) VALUES
  -- Example: User with only darbuotojai access
  ('user-uuid-here', 'darbuotojai', true, true, false, true),
  -- Example: User with only technika view access
  ('user-uuid-here', 'technika', true, false, false, false);
*/
