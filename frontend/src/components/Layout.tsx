import { Link, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../store/auth";

export default function Layout() {
  const auth = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    auth.logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between p-4 border-b bg-white">
        <nav className="space-x-4">
          <Link to="/" className="text-blue-600">Dashboard</Link>
          <Link to="/invoices" className="text-blue-600">Faktury</Link>
          <Link to="/wz" className="text-blue-600">WZ</Link>
          <Link to="/users" className="text-blue-600">Użytkownicy</Link>
          <Link to="/products" className="text-blue-600">Produkty</Link>
        </nav>
        <button onClick={handleLogout} className="px-3 py-1 rounded bg-black text-white">Wyloguj</button>
      </header>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}
