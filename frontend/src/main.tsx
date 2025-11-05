// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "./index.css";

import LoginPage from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import InvoicesPage from "./pages/Invoices";
import WZPage from "./pages/WZ";
import Layout from "./components/Layout";
import Protected from "./components/Protected";
import { AuthProvider } from "./store/auth";
import UsersPage from "./pages/Users";
import RegisterPage from "./pages/Register";
import CreateInvoice from "./pages/CreateInvoice";
import ProductsPage from "./pages/Products";

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterPage /> },
  {
    path: "/",
    element: (
      <Protected>
        <Layout />
      </Protected>
    ),
    children: [
      { index: true, element: <Dashboard /> },
      { path: "invoices", element: <InvoicesPage /> },
      { path: "wz", element: <WZPage /> },
      {path: "users", element: <UsersPage />},
      {path: "invoices/create", element: <CreateInvoice />},
      {path: "products", element: <ProductsPage />},

    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </React.StrictMode>
);
