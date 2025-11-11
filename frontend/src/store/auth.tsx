import { createContext, useContext, useMemo, useState, type ReactNode, useEffect } from "react";
// 1. Zaimportuj bibliotekę do dekodowania JWT
import { jwtDecode } from "jwt-decode";

// 2. Zdefiniuj, jakie dane wyciągniemy z tokena
type JwtPayload = {
  sub: string; // ID użytkownika (standard w JWT)
  role: "admin" | "salesman" | "customer";
  exp: number;
};

// 3. Rozszerz stan o rolę i ID użytkownika
type AuthState = {
  token: string | null;
  role: JwtPayload["role"] | null;
  userId: number | null;
  login: (token: string) => void;
  logout: () => void;
};

const AuthCtx = createContext<AuthState | undefined>(undefined);

// Funkcja pomocnicza do odczytu i dekodowania tokena z localStorage
const getAuthFromStorage = (): Omit<AuthState, "login" | "logout"> => {
  const token = localStorage.getItem("token");
  if (!token) {
    return { token: null, role: null, userId: null };
  }
  try {
    const decoded = jwtDecode<JwtPayload>(token);
    // Sprawdź, czy token nie wygasł
    if (decoded.exp * 1000 < Date.now()) {
      localStorage.removeItem("token");
      return { token: null, role: null, userId: null };
    }
    return {
      token: token,
      role: decoded.role,
      userId: parseInt(decoded.sub), // 'sub' to ID, konwertujemy na liczbę
    };
  } catch (error) {
    console.error("Nie udało się zdekodować tokena:", error);
    localStorage.removeItem("token");
    return { token: null, role: null, userId: null };
  }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  // 4. Użyj funkcji pomocniczej do ustawienia stanu początkowego
  const [authState, setAuthState] = useState(getAuthFromStorage());

  const login = (t: string) => {
    // Zapisz token
    localStorage.setItem("token", t);
    // Zdekoduj i ustaw pełny stan
    try {
      const decoded = jwtDecode<JwtPayload>(t);
      setAuthState({
        token: t,
        role: decoded.role,
        userId: parseInt(decoded.sub),
      });
    } catch (error) {
      console.error("Błąd logowania, nie udało się zdekodować tokena:", error);
      // W razie błędu, wyloguj
      logout();
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    setAuthState({ token: null, role: null, userId: null });
  };

  // 5. Zapewnij spójność między zakładkami przeglądarki
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === "token") {
        setAuthState(getAuthFromStorage());
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const value = useMemo(
    () => ({
      ...authState,
      login,
      logout,
    }),
    [authState]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}