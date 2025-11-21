import { Outlet, useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../store/auth";
import { ShoppingCart, Building } from "lucide-react";
import { useState } from "react";
import CompanyDataModal from "./CompanyDataModal";

export default function Layout() {
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

  const cartItemCount = cart?.items.reduce((sum, item) => sum + item.qty, 0) ?? 0;

  const [companyModalOpen, setCompanyModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between p-4 border-b bg-white">
        <nav className="flex items-center space-x-2">
          {/* ----- Wspólne dla wszystkich ----- */}
          <NavLink
            to="/"
            end
            className={({ isActive }) => (isActive ? activeLinkStyle : baseLinkStyle)}
          >
            Pulpit
          </NavLink>
          
          {/* ... (trasy admina/sprzedawcy/magazyniera bez zmian) ... */}
          {(role === "admin" || role === "salesman") && (
            <>
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
          {role === "admin" && (
            <NavLink
              to="/users"
              className={({ isActive }) => (isActive ? activeLinkStyle : baseLinkStyle)}
            >
              Użytkownicy
            </NavLink>
          )}
          {role === "warehouse" && (
            <>
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

          {/* ----- Tylko dla Klienta ----- */}
          {role === "customer" && (
            <>
              <NavLink
                to="/my-orders"
                className={({ isActive }) => (isActive ? activeLinkStyle : baseLinkStyle)}
              >
                Moje zamówienia
              </NavLink>
              
              {/* ZMIANA: Dodany link */}
              <NavLink
                to="/my-invoices"
                className={({ isActive }) => (isActive ? activeLinkStyle : baseLinkStyle)}
              >
                Moje faktury
              </NavLink>
            </>
          )}

        </nav>

        {/* Akcje po prawej (koszyk + wyloguj) */}
        <div className="flex items-center space-x-4">
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
          {role === "admin" && (
            <button title="Dane firmy" onClick={() => setCompanyModalOpen(true)} className="px-2 py-1 rounded text-gray-600 hover:bg-gray-100">
              <Building size={20} />
            </button>
          )}

          <button onClick={handleLogout} className="px-3 py-1 rounded bg-black text-white">
            Wyloguj
          </button>
        </div>
        <CompanyDataModal open={companyModalOpen} onClose={() => setCompanyModalOpen(false)} />
      </header>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}