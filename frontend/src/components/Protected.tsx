import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../store/auth";

export default function Protected({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
