// src/App.tsx

import { Routes, Route, Navigate } from "react-router-dom";
import Protected from "./components/Protected";
import Dashboard from "./pages/Dashboard";
import LoginPage from "./pages/Login";
import Register from "./pages/Register";

export default function App() {
  return (
    <Routes>
      {/* Protected Route: Dashboard (accessible only to logged-in users) */}
      <Route
        path="/"
        element={
          <Protected>
            <Dashboard />
          </Protected>
        }
      />
      
      {/* Public Routes */}
      <Route path="/register" element={<Register />} />
      <Route path="/login" element={<LoginPage />} />
      
      {/* Fallback Route: Redirect unknown paths to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}