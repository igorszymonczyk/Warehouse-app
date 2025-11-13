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
import CartPage from "./pages/Cart"; 
import CheckoutPage from "./pages/Checkout"; // 1. ZMIANA: Import nowej strony

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <Register /> },
  {
    path: "/",
    element: (
      <Protected>
        <Layout />
      </Protected>
    ),
    children: [
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
      
      // Admin, Salesman, Warehouse
      {
        path: "wz",
        element: (
          <Protected allowedRoles={["admin", "salesman", "warehouse"]}>
            <WZPage />
          </Protected>
        ),
      },
      {
        path: "products",
        element: (
          <Protected allowedRoles={["admin", "salesman", "warehouse"]}>
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
      
      // Tylko Customer
      {
        path: "cart",
        element: (
          <Protected allowedRoles={["customer"]}>
            <CartPage />
          </Protected>
        ),
      },

      // 2. ZMIANA: Dodanie trasy /checkout
      {
        path: "checkout",
        element: (
          <Protected allowedRoles={["customer"]}>
            <CheckoutPage />
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