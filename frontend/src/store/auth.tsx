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

// --- 1. CHANGE: User type definition (must match /me response) ---
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

// --- 2. CHANGE: Added user field to AuthState ---
type AuthState = {
  token: string | null;
  role: JwtPayload["role"] | null;
  userId: number | null;
  cart: Cart | null;
  user: UserData | null; // <-- Store full user data here
  setCart: (cart: Cart | null) => void;
  login: (token: string) => void;
  logout: () => void;
};

const AuthCtx = createContext<AuthState | undefined>(undefined);

// Helper function (updated with user: null)
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
      user: null, // Detailed data will be fetched from API
    };
  } catch (error) {
    console.error("Failed to decode token:", error);
    localStorage.removeItem("token");
    return { token: null, role: null, userId: null, user: null };
  }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState(getAuthFromStorage());
  const [cart, setCart] = useState<Cart | null>(null);
  // --- 3. CHANGE: State for user data ---
  const [user, setUser] = useState<UserData | null>(null);

  const loadCart = async () => {
    try {
      const res = await api.get<Cart>("/cart");
      setCart(res.data);
    } catch (err) {
      console.error("Failed to fetch cart", err);
      setCart(null);
    }
  };

  // --- 4. CHANGE: Fetching user data and cart ---
  useEffect(() => {
    if (authState.token) {
      // Set authorization header for all requests
      api.defaults.headers.common["Authorization"] = `Bearer ${authState.token}`;

      // Fetch user details (first name, last name)
      api.get<UserData>("/me")
        .then((res) => setUser(res.data))
        .catch((err) => console.error("Error fetching user data", err));

      // If customer, fetch cart
      if (authState.role === "customer") {
        loadCart();
      }
    } else {
      // Clear states
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
      console.error("Login error, failed to decode token:", error);
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
      user, // Overwrite null from authState with current user state
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