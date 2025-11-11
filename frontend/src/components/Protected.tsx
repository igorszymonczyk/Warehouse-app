import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../store/auth";

type Role = "admin" | "salesman" | "customer";

type ProtectedProps = {
  children: ReactNode;
  // 1. Dodajemy nową, opcjonalną właściwość
  allowedRoles?: Role[];
};

export default function Protected({ children, allowedRoles }: ProtectedProps) {
  // 2. Pobieramy token ORAZ rolę z naszego ulepszonego hooka
  const { token, role } = useAuth();

  // 3. Sprawdzenie logowania (jak wcześniej)
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // 4. NOWE: Sprawdzenie autoryzacji (roli)
  // Jeśli trasa wymaga konkretnych ról...
  if (allowedRoles && role) {
    // ...i jeśli rola użytkownika nie znajduje się na liście dozwolonych ról...
    if (!allowedRoles.includes(role)) {
      // ...przekieruj na stronę główną (lub stronę "Brak dostępu")
      return <Navigate to="/" replace />;
    }
  }

  // Jeśli wszystko jest w porządku, wyświetl chronioną zawartość
  return <>{children}</>;
}