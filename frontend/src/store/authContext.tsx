// frontend/src/store/authContext.tsx
import { createContext, useContext } from "react";
import { AuthState } from "./AuthProvider";

export const AuthCtx = createContext<AuthState | undefined>(undefined);

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
