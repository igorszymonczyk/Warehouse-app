// frontend/src/components/Layout.tsx
import { Outlet, useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../store/auth";

export default function Layout() {
  // 1. ZMIANA: Pobieramy rolę i funkcję logout z hooka
  const { role, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const baseLinkStyle =
    "px-3 py-2 rounded-md text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900";
  const activeLinkStyle =
    "px-3 py-2 rounded-md text-sm font-bold text-blue-700 bg-blue-100";

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between p-4 border-b bg-white">
        {/* 2. ZMIANA: Cała nawigacja jest teraz warunkowa */}
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

          {/* TODO: W przyszłości dodamy tu linki dla 'customer' */}

        </nav>
        <button onClick={handleLogout} className="px-3 py-1 rounded bg-black text-white">
          Wyloguj
        </button>
      </header>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}