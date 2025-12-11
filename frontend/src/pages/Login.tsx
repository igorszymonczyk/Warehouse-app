import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { toMessage } from "../lib/error";
import { useAuth } from "../store/auth";
import { Link } from "react-router-dom";
// Import icons
import { FaEye, FaEyeSlash } from "react-icons/fa";

export default function LoginPage() {
  const [email, setEmail] = useState("admin2@example.com");
  const [password, setPassword] = useState("Admin123!");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  // Add state to toggle password visibility
  const [showPassword, setShowPassword] = useState(false);

  const navigate = useNavigate();
  const { login } = useAuth();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.post("/login", { email, password });
      const token: string | undefined = res.data?.access_token;
      if (!token) throw new Error("No access_token in response");
      login(token); // Save via context
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
        <h1 className="text-xl mb-4">Login</h1>

        <input
          className="border rounded w-full p-2 mb-4"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-mail"
        />

    
        <div className="relative mb-4">
          <input
            className="border rounded w-full p-2 pr-10" // Added right padding
            type={showPassword ? "text" : "password"} // Dynamic type
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
          />
          <button
            type="button" // Important: prevent form submission
            onClick={() => setShowPassword(!showPassword)} // Toggle state
            className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 hover:text-gray-700"
          >
            {showPassword ? <FaEyeSlash /> : <FaEye />}
          </button>
        </div>

        {error && <p className="text-red-600 mb-3">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full px-3 py-2 rounded bg-black text-white disabled:opacity-60"
        >
          {loading ? "Logging in..." : "Login"}
        </button>
        <p className="text-center mt-4 text-sm">
          Don't have an account?{" "}
           <Link to="/register" className="text-blue-600 hover:underline">
          Register
           </Link>
        </p>
      </form>
    </div>
    
  );
}