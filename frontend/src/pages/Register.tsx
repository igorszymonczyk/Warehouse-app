import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../lib/api";
import { toMessage } from "../lib/error";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [imie, setImie] = useState("");
  const [nazwisko, setNazwisko] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const navigate = useNavigate();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/register", {
        email,
        password,
        imie,
        nazwisko,
      });
      alert("Rejestracja zakończona sukcesem! Możesz się teraz zalogować.");
      navigate("/login");
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-gray-50">
      <form onSubmit={onSubmit} className="w-full max-w-md bg-white p-6 rounded shadow">
        <h1 className="text-xl mb-4 font-semibold">Rejestracja</h1>

        <input
          className="border rounded w-full p-2 mb-3"
          value={imie}
          onChange={(e) => setImie(e.target.value)}
          placeholder="Imię"
          required
        />
        <input
          className="border rounded w-full p-2 mb-3"
          value={nazwisko}
          onChange={(e) => setNazwisko(e.target.value)}
          placeholder="Nazwisko"
          required
        />
        <input
          className="border rounded w-full p-2 mb-3"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-mail"
          type="email"
          required
        />
        <input
          className="border rounded w-full p-2 mb-3"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Hasło"
          required
        />

        {error && <p className="text-red-600 mb-3">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full px-3 py-2 rounded bg-black text-white disabled:opacity-60"
        >
          {loading ? "Rejestrowanie..." : "Zarejestruj się"}
        </button>

        <p className="text-center mt-4 text-sm">
          Masz już konto?{" "}
          <Link to="/login" className="text-blue-600 hover:underline">
            Zaloguj się
          </Link>
        </p>
      </form>
    </div>
  );
}
