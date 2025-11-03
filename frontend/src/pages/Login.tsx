// src/pages/Login.tsx
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { toMessage } from "../lib/error";
import { useAuth } from "../store/auth";
import { Link } from "react-router-dom";

export default function LoginPage() {
  const [email, setEmail] = useState("admin2@example.com");
  const [password, setPassword] = useState("Admin123!");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const navigate = useNavigate();
  const { login } = useAuth();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.post("/login", { email, password });
      const token: string | undefined = res.data?.access_token;
      if (!token) throw new Error("Brak access_token w odpowiedzi");
      login(token); // zapis przez kontekst
      navigate("/");
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-gray-50">
      <form onSubmit={onSubmit} className="w-full max-w-md bg-white p-6 rounded shadow">
        <h1 className="text-xl mb-4">Logowanie</h1>

        <input
          className="border rounded w-full p-2 mb-4"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-mail"
        />
        <input
          className="border rounded w-full p-2 mb-4"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Hasło"
        />

        {error && <p className="text-red-600 mb-3">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full px-3 py-2 rounded bg-black text-white disabled:opacity-60"
        >
          {loading ? "Logowanie..." : "Zaloguj"}
        </button>
        <p className="text-center mt-4 text-sm">
          Nie masz konta?{" "}
           <Link to="/register" className="text-blue-600 hover:underline">
          Zarejestruj się
           </Link>
        </p>
      </form>
    </div>
    
  );
}
