// frontend/src/store/AuthProvider.tsx
import { useMemo, useState, type ReactNode, useContext, createContext } from "react";

type AuthState = {
  token: string | null;
  login: (token: string) => void;
  logout: () => void;
};

const AuthCtx = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem("token"));

  const login = (t: string) => {
    setToken(t);
    localStorage.setItem("token", t);
  };

  const logout = () => {
    setToken(null);
    localStorage.removeItem("token");
  };

  const value = useMemo(() => ({ token, login, logout }), [token]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
