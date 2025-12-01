import { createContext, useContext, useMemo, useState, type ReactNode, useEffect } from "react";
import { jwtDecode } from "jwt-decode";
import { api } from "../lib/api";

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

// --- 1. ZMIANA: Definicja typu użytkownika (musi pasować do odpowiedzi z /me) ---
export type UserData = {
  id: number;
  email: string;
  role: string;
  first_name?: string;
  last_name?: string;
};

type JwtPayload = {
  sub: string;
  role: "admin" | "salesman" | "customer" | "warehouse";
  exp: number;
};

// --- 2. ZMIANA: Dodano pole user do AuthState ---
type AuthState = {
  token: string | null;
  role: JwtPayload["role"] | null;
  userId: number | null;
  cart: Cart | null;
  user: UserData | null; // <-- Tutaj przechowujemy pełne dane usera
  setCart: (cart: Cart | null) => void;
  login: (token: string) => void;
  logout: () => void;
};

const AuthCtx = createContext<AuthState | undefined>(undefined);

// Pomocnicza funkcja (zaktualizowana o user: null)
const getAuthFromStorage = (): Omit<AuthState, "login" | "logout" | "cart" | "setCart"> => {
  const token = localStorage.getItem("token");
  if (!token) {
    return { token: null, role: null, userId: null, user: null };
  }
  try {
    const decoded = jwtDecode<JwtPayload>(token);
    if (decoded.exp * 1000 < Date.now()) {
      localStorage.removeItem("token");
      return { token: null, role: null, userId: null, user: null };
    }
    return {
      token: token,
      role: decoded.role,
      userId: parseInt(decoded.sub),
      user: null, // Dane szczegółowe pobierzemy z API
    };
  } catch (error) {
    console.error("Nie udało się zdekodować tokena:", error);
    localStorage.removeItem("token");
    return { token: null, role: null, userId: null, user: null };
  }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState(getAuthFromStorage());
  const [cart, setCart] = useState<Cart | null>(null);
  // --- 3. ZMIANA: Stan dla danych użytkownika ---
  const [user, setUser] = useState<UserData | null>(null);

  const loadCart = async () => {
    try {
      const res = await api.get<Cart>("/cart");
      setCart(res.data);
    } catch (err) {
      console.error("Nie udało się pobrać koszyka", err);
      setCart(null);
    }
  };

  // --- 4. ZMIANA: Pobieranie danych usera i koszyka ---
  useEffect(() => {
    if (authState.token) {
      // Ustawiamy nagłówek autoryzacji dla wszystkich zapytań
      api.defaults.headers.common["Authorization"] = `Bearer ${authState.token}`;

      // Pobierz szczegóły użytkownika (imię, nazwisko)
      api.get<UserData>("/me")
        .then((res) => setUser(res.data))
        .catch((err) => console.error("Błąd pobierania danych użytkownika", err));

      // Jeśli to klient, pobierz koszyk
      if (authState.role === "customer") {
        loadCart();
      }
    } else {
      // Czyszczenie stanów
      setCart(null);
      setUser(null);
      delete api.defaults.headers.common["Authorization"];
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
        user: null, 
      });
    } catch (error) {
      console.error("Błąd logowania, nie udało się zdekodować tokena:", error);
      logout();
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    setAuthState({ token: null, role: null, userId: null, user: null });
    setCart(null);
    setUser(null);
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
      user, // Nadpisujemy null z authState aktualnym stanem user
      cart,
      setCart,
      login,
      logout,
    }),
    [authState, cart, user]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}