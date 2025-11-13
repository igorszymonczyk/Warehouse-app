// frontend/src/components/Layout.tsx
import { Outlet, useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../store/auth";
import { ShoppingCart } from "lucide-react"; // 1. ZMIANA: Import ikony

export default function Layout() {
  // 2. ZMIANA: Pobieramy 'role', 'logout' i 'cart'
  const { role, logout, cart } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const baseLinkStyle =
    "px-3 py-2 rounded-md text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900";
  const activeLinkStyle =
    "px-3 py-2 rounded-md text-sm font-bold text-blue-700 bg-blue-100";

  // 3. ZMIANA: Obliczamy łączną liczbę sztuk w koszyku
  const cartItemCount = cart?.items.reduce((sum, item) => sum + item.qty, 0) ?? 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between p-4 border-b bg-white">
        {/* Nawigacja po lewej (bez zmian) */}
        <nav className="flex items-center space-x-2">
          {/* ----- Wspólne dla wszystkich ----- */}
          <NavLink
            to="/"
            end
            className={({ isActive }) => (isActive ? activeLinkStyle : baseLinkStyle)}
          >
            Pulpit
          </NavLink>
          
          {/* ----- Tylko dla Admina i Sprzedawcy ----- */}
          {(role === "admin" || role === "salesman") && (
            <>
              {/* ... (linki admina/sprzedawcy bez zmian) ... */}
              <NavLink
                to="/invoices"
                className={({ isActive }) => (isActive ? activeLinkStyle : baseLinkStyle)}
              >
                Faktury
              </NavLink>
              <NavLink
                to="/wz"
                className={({ isActive }) => (isActive ? activeLinkStyle : baseLinkStyle)}
              >
                WZ
              </NavLink>
              <NavLink
                to="/products"
                className={({ isActive }) => (isActive ? activeLinkStyle : baseLinkStyle)}
              >
                Produkty
              </NavLink>
            </>
          )}

          {/* ----- Tylko dla Admina ----- */}
          {role === "admin" && (
            <NavLink
              to="/users"
              className={({ isActive }) => (isActive ? activeLinkStyle : baseLinkStyle)}
            >
              Użytkownicy
            </NavLink>
          )}
          {/* ----- Tylko dla Magazyniera ----- */}
          {role === "warehouse" && (
            <>
              {/* ... (linki magazyniera bez zmian) ... */}
              <NavLink
                to="/wz"
                className={({ isActive }) => (isActive ? activeLinkStyle : baseLinkStyle)}
              >
                WZ
              </NavLink>
              <NavLink
                to="/products"
                className={({ isActive }) => (isActive ? activeLinkStyle : baseLinkStyle)}
              >
                Produkty
              </NavLink>
            </>
          )}
        </nav>

        {/* 4. ZMIANA: Kontener na akcje po prawej stronie (koszyk + wyloguj) */}
        <div className="flex items-center space-x-4">
          
          {/* ----- Ikona Koszyka (tylko customer) ----- */}
          {role === "customer" && (
            <NavLink
              to="/cart"
              className="relative text-gray-500 hover:text-gray-900"
              aria-label="Koszyk"
            >
              <ShoppingCart size={24} />
              {cartItemCount > 0 && (
                <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white">
                  {cartItemCount}
                </span>
              )}
            </NavLink>
          )}

          <button onClick={handleLogout} className="px-3 py-1 rounded bg-black text-white">
            Wyloguj
          </button>
        </div>
      </header>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}