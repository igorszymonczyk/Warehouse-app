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
import CheckoutPage from "./pages/Checkout";
import MyOrdersPage from "./pages/MyOrders";
import MyInvoicesPage from "./pages/MyInvoices";
import InvoiceDetailPage from "./pages/InvoiceDetail";
import LogsPage from "./pages/Logs"; // Import już tu był, teraz użyjemy go w routerze


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
      
      // --- Trasy Admina i Sprzedawcy ---
      {
        path: "invoices",
        element: (
          <Protected allowedRoles={["admin", "salesman"]}>
            <InvoicesPage />
          </Protected>
        ),
      },
      {
        path: "invoices/:id",
        element: (
          <Protected allowedRoles={["admin", "salesman"]}> 
            <InvoiceDetailPage />
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
      
      // --- Trasy Magazyniera (i Admin/Salesman) ---
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

      // --- Trasy Tylko dla Admina ---
      {
        path: "users",
        element: (
          <Protected allowedRoles={["admin"]}>
            <UsersPage />
          </Protected>
        ),
      },
      // 1. ZMIANA: Dodano trasę do logów
      {
        path: "logs",
        element: (
          <Protected allowedRoles={["admin"]}>
            <LogsPage />
          </Protected>
        ),
      },

      // --- Trasy Klienta ---
      {
        path: "cart",
        element: (
          <Protected allowedRoles={["customer"]}>
            <CartPage />
          </Protected>
        ),
      },
      {
        path: "checkout",
        element: (
          <Protected allowedRoles={["customer"]}>
            <CheckoutPage />
          </Protected>
        ),
      },
      {
        path: "my-orders",
        element: (
          <Protected allowedRoles={["customer"]}>
            <MyOrdersPage />
          </Protected>
        ),
      },
      {
        path: "my-invoices",
        element: (
          <Protected allowedRoles={["customer"]}>
            <MyInvoicesPage />
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