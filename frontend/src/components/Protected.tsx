import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../store/auth";

type Role = "admin" | "salesman" | "customer" | "warehouse";

type ProtectedProps = {
  children: ReactNode;
  // 1. Add new optional property
  allowedRoles?: Role[];
};

export default function Protected({ children, allowedRoles }: ProtectedProps) {
  // 2. Retrieve token AND role from the auth hook
  const { token, role } = useAuth();

  // 3. Check authentication (as before)
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // 4. NEW: Authorization check (role-based)
  // If the route requires specific roles...
  if (allowedRoles && role) {
    // ...and the user's role is not in the allowed list...
    if (!allowedRoles.includes(role)) {
      // ...redirect to home (or an "Access Denied" page)
      return <Navigate to="/" replace />;
    }
  }

  // Render protected content if authorized
  return <>{children}</>;
}