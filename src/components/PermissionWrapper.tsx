import { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Shield } from 'lucide-react';

interface PermissionWrapperProps {
  children: ReactNode;
  permission: string;
  fallback?: ReactNode;
  hideIfNoAccess?: boolean;
}

export function PermissionWrapper({
  children,
  permission,
  fallback,
  hideIfNoAccess = false
}: PermissionWrapperProps) {
  const { hasPermission } = useAuth();

  if (!hasPermission(permission)) {
    if (hideIfNoAccess) {
      return null;
    }

    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <div className="flex items-center justify-center py-12 px-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-red-600" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Prieiga uždrausta</h3>
          <p className="text-gray-600">
            Jūs neturite reikiamų teisių šiai operacijai atlikti. Susisiekite su administratoriumi.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
