// frontend/src/store/auth.tsx

import { createContext, useContext, useMemo, useState, type ReactNode, useEffect } from "react";
import { jwtDecode } from "jwt-decode";
import { api } from "../lib/api"; // 1. ZMIANA: Import API

// === 2. ZMIANA: Definicje typów dla Koszyka ===
// (Muszą pasować do schematu CartOut i CartItemOut z backendu)
export type CartItem = {
  id: number;
  product_id: number;
  name: string;
  qty: number;
  unit_price: number;
  line_total: number;
};

export type Cart = {
  items: CartItem[];
  total: number;
};

// 3. ZMIANA: Rozszerzenie JwtPayload o rolę 'warehouse'
type JwtPayload = {
  sub: string;
  role: "admin" | "salesman" | "customer" | "warehouse";
  exp: number;
};

// 4. ZMIANA: Rozszerzenie stanu o koszyk
type AuthState = {
  token: string | null;
  role: JwtPayload["role"] | null;
  userId: number | null;
  cart: Cart | null; // <-- Nowe pole
  setCart: (cart: Cart | null) => void; // <-- Nowa funkcja
  login: (token: string) => void;
  logout: () => void;
};

const AuthCtx = createContext<AuthState | undefined>(undefined);

// Funkcja pomocnicza (bez zmian)
const getAuthFromStorage = (): Omit<AuthState, "login" | "logout" | "cart" | "setCart"> => {
  const token = localStorage.getItem("token");
  if (!token) {
    return { token: null, role: null, userId: null };
  }
  try {
    const decoded = jwtDecode<JwtPayload>(token);
    if (decoded.exp * 1000 < Date.now()) {
      localStorage.removeItem("token");
      return { token: null, role: null, userId: null };
    }
    return {
      token: token,
      role: decoded.role,
      userId: parseInt(decoded.sub),
    };
  } catch (error) {
    console.error("Nie udało się zdekodować tokena:", error);
    localStorage.removeItem("token");
    return { token: null, role: null, userId: null };
  }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState(getAuthFromStorage());
  // 5. ZMIANA: Dodajemy stan dla koszyka
  const [cart, setCart] = useState<Cart | null>(null);

  // 6. ZMIANA: Funkcja do ładowania koszyka z API
  const loadCart = async () => {
    try {
      const res = await api.get<Cart>("/cart");
      setCart(res.data);
    } catch (err) {
      console.error("Nie udało się pobrać koszyka", err);
      setCart(null); // Wyczyść w razie błędu
    }
  };

  // 7. ZMIANA: Ładuj koszyk, gdy użytkownik jest zalogowany (jako klient)
  useEffect(() => {
    if (authState.token && authState.role === "customer") {
      loadCart();
    } else {
      setCart(null); // Wyczyść koszyk dla innych ról lub gościa
    }
  }, [authState.token, authState.role]);

  const login = (t: string) => {
    localStorage.setItem("token", t);
    try {
      const decoded = jwtDecode<JwtPayload>(t);
      setAuthState({
        token: t,
        role: decoded.role,
        userId: parseInt(decoded.sub),
      });
      // (useEffect powyżej automatycznie załaduje koszyk)
    } catch (error) {
      console.error("Błąd logowania, nie udało się zdekodować tokena:", error);
      logout();
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    setAuthState({ token: null, role: null, userId: null });
    setCart(null); // 8. ZMIANA: Wyczyść koszyk przy wylogowaniu
  };

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
      cart, // <-- 9. ZMIANA: Przekaż koszyk
      setCart, // <-- 10. ZMIANA: Przekaż funkcję
      login,
      logout,
    }),
    [authState, cart] // <-- 11. ZMIANA: Dodaj 'cart' do zależności
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}