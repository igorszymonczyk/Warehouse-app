import { useState, useEffect, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { toMessage } from "../lib/error";
import { useAuth } from "../store/auth";
import { Link } from "react-router-dom";
import { FaEye, FaEyeSlash } from "react-icons/fa";

export default function LoginPage() {
  const [email, setEmail] = useState("admin2@example.com");
  const [password, setPassword] = useState("Admin123!");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [showPassword, setShowPassword] = useState(false);
  
  // Stan na nazwę firmy
  const [companyName, setCompanyName] = useState<string>("");

  const navigate = useNavigate();
  const { login } = useAuth();

  // Pobieranie danych firmy przy załadowaniu komponentu
  useEffect(() => {
    api.get("/company/")
      .then((res) => {
        if (res.data?.name) {
          setCompanyName(res.data.name);
        }
      })
      .catch((err) => {
        console.error("Błąd pobierania danych firmy:", err);
      });
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.post("/login", { email, password });
      const token: string | undefined = res.data?.access_token;
      if (!token) throw new Error("Brak access_token w odpowiedzi");
      login(token);
      navigate("/");
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      
      {/* Wyświetlanie nazwy firmy - ZWIĘKSZONA CZCIONKA (text-6xl) */}
      {companyName && (
        <div className="mb-10 text-center animate-fade-in-down">
          <h1 className="text-6xl font-extrabold text-blue-600 tracking-tight drop-shadow-sm">
            {companyName}
          </h1>
        </div>
      )}

      <form onSubmit={onSubmit} className="w-full max-w-md bg-white p-8 rounded-lg shadow-md">
        <h2 className="text-2xl font-semibold mb-6 text-gray-800 text-center">Logowanie</h2>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            className="border border-gray-300 rounded-md w-full p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Wprowadź e-mail"
            type="email"
          />
        </div>

        <div className="mb-6 relative">
          <label className="block text-sm font-medium text-gray-700 mb-1">Hasło</label>
          <div className="relative">
            <input
              className="border border-gray-300 rounded-md w-full p-2 pr-10 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Wprowadź hasło"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
            >
              {showPassword ? <FaEyeSlash size={18} /> : <FaEye size={18} />}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm mb-4 border border-red-200">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full px-4 py-2.5 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Logowanie..." : "Zaloguj się"}
        </button>

        <p className="text-center mt-6 text-sm text-gray-600">
          Nie masz konta?{" "}
          <Link to="/register" className="text-blue-600 hover:text-blue-800 font-medium hover:underline">
            Zarejestruj się
          </Link>
        </p>
      </form>
    </div>
  );
}