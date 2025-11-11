import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../lib/api";
import { toMessage } from "../lib/error";
import toast from "react-hot-toast";
import { FaEye, FaEyeSlash } from "react-icons/fa";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [imie, setImie] = useState("");
  const [nazwisko, setNazwisko] = useState("");
  const [loading, setLoading] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const navigate = useNavigate();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // --- SEKCJA WALIDACJI ---

    if (password.length < 8) {
      toast.error("Hasło musi mieć co najmniej 8 znaków.");
      setLoading(false);
      return;
    }
    // 1. ZMIANA: Sprawdzenie dużej litery
    if (!/[A-Z]/.test(password)) {
      toast.error("Hasło musi zawierać co najmniej jedną dużą literę.");
      setLoading(false);
      return;
    }
    // 2. ZMIANA: Sprawdzenie cyfry
    if (!/[0-9]/.test(password)) {
      toast.error("Hasło musi zawierać co najmniej jedną cyfrę.");
      setLoading(false);
      return;
    }
    // 3. ZMIANA: Sprawdzenie znaku specjalnego
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      toast.error("Hasło musi zawierać co najmniej jeden znak specjalny (np. !@#$).");
      setLoading(false);
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Hasła nie są zgodne.");
      setLoading(false);
      return;
    }
    // --- KONIEC WALIDACJI ---

    try {
      await api.post("/register", {
        email,
        password,
        imie,
        nazwisko,
      });
      toast.success("Rejestracja zakończona sukcesem! Możesz się teraz zalogować.");
      navigate("/login");
    } catch (err) {
      toast.error(toMessage(err));
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

        {/* Pole hasła */}
        <div className="relative mb-3">
          <input
            className="border rounded w-full p-2 pr-10"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            // 4. ZMIANA: Zaktualizowany placeholder
            placeholder="Hasło (min. 8 znaków, A-Z, 0-9, !@#)"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 hover:text-gray-700"
          >
            {showPassword ? <FaEyeSlash /> : <FaEye />}
          </button>
        </div>

        {/* Pole "Potwierdź hasło" */}
        <div className="relative mb-3">
          <input
            className="border rounded w-full p-2 pr-10"
            type={showConfirmPassword ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Potwierdź hasło"
            required
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 hover:text-gray-700"
          >
            {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
          </button>
        </div>

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