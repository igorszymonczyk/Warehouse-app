// src/App.tsx

import { Routes, Route, Navigate } from "react-router-dom";
import Protected from "./components/Protected";
import Dashboard from "./pages/Dashboard";
import LoginPage from "./pages/Login";
import Register from "./pages/Register";

export default function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <Protected>
            <Dashboard />
          </Protected>
        }
      />
      <Route path="/register" element={<Register />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
