// src/App.tsx
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Protected from "./components/Protected";
import Dashboard from "./pages/Dashboard";
import LoginPage from "./pages/Login";


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
      <Route path="/login" element={<LoginPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
