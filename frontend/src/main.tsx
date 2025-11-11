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
import { Toaster } from "react-hot-toast";
import CreateInvoice from "./pages/CreateInvoice";
import ProductsPage from "./pages/Products";
import UsersPage from "./pages/Users";
import Register from "./pages/Register";

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <Register /> },
  {
    path: "/",
    element: (
      // Ten główny <Protected> sprawdza tylko, CZY jesteś zalogowany
      <Protected>
        <Layout />
      </Protected>
    ),
    // Poszczególne trasy sprawdzają, JAKĄ masz rolę
    children: [
      // Każdy zalogowany użytkownik widzi Pulpit
      { index: true, element: <Dashboard /> },

      // Admin i Salesman
      {
        path: "invoices",
        element: (
          <Protected allowedRoles={["admin", "salesman"]}>
            <InvoicesPage />
          </Protected>
        ),
      },
      {
        path: "invoices/create",
        element: (
          <Protected allowedRoles={["admin", "salesman"]}>
            <CreateInvoice />
          </Protected>
        ),
      },
      {
        path: "wz",
        element: (
          <Protected allowedRoles={["admin", "salesman"]}>
            <WZPage />
          </Protected>
        ),
      },
      {
        path: "products",
        element: (
          <Protected allowedRoles={["admin", "salesman"]}>
            <ProductsPage />
          </Protected>
        ),
      },

      // Tylko Admin
      {
        path: "users",
        element: (
          <Protected allowedRoles={["admin"]}>
            <UsersPage />
          </Protected>
        ),
      },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
      <Toaster position="top-center" />
    </AuthProvider>
  </React.StrictMode>
);