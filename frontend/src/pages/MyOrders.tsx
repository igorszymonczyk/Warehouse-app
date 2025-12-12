import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../store/auth";
import toast from "react-hot-toast";
// 1. CHANGE: Import icons
import { ChevronDown, ChevronUp } from "lucide-react";

// 2. CHANGE: OrderItem type now includes name
type OrderItem = {
  product_id: number;
  product_name: string; // <-- ADDED
  qty: number;
  unit_price: number;
  line_total: number;
};

type Order = {
  id: number;
  status: string;
  total_amount: number;
  created_at: string; // ISO string
  items: OrderItem[];
};

type PaginatedOrders = {
  items: Order[];
  total: number;
  page: number;
  page_size: number;
};

// 3. CHANGE: OrderCard component now has state and product list
function OrderCard({ order }: { order: Order }) {
  const [isExpanded, setIsExpanded] = useState(false); // <-- Expansion state

  const formattedDate = new Date(order.created_at).toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const statusMap: { [key: string]: string } = {
    pending: "Oczekujące",
    pending_payment: "W trakcie realizacji",
    processing: "W trakcie realizacji",
    shipped: "Wysłane",
    cancelled: "Anulowane",
    CANCELLED: "Anulowane",
  };
  // Normalize status for display (handle different casing/whitespace)
  const normalize = (s?: string) => (s || "").toString().trim().toLowerCase();

  return (
    <div className="bg-white rounded-lg shadow-md border overflow-hidden">
      {/* Clickable Header Section */}
      <div
        className="p-4 cursor-pointer hover:bg-gray-50 transition"
        onClick={() => setIsExpanded(!isExpanded)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setIsExpanded(!isExpanded)}
      >
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-semibold">Zamówienie #{order.id}</h2>
          <span className="text-sm font-medium text-gray-600">{formattedDate}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
            normalize(order.status) === 'pending' ? 'bg-yellow-100 text-yellow-800' :
            normalize(order.status) === 'shipped' ? 'bg-green-100 text-green-800' :
            (normalize(order.status) === 'cancelled' || normalize(order.status) === 'CANCELLED') ? 'bg-red-100 text-red-800' :
            (normalize(order.status) === 'processing' || normalize(order.status) === 'pending_payment') ? 'bg-blue-100 text-blue-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            {statusMap[normalize(order.status)] || statusMap[order.status] || "Nieznany"}
          </span>
          <div className="flex items-center gap-4">
            <span className="text-xl font-bold">{order.total_amount.toFixed(2)} zł</span>
            {/* Arrow Icon */}
            {isExpanded ? <ChevronUp size={20} className="text-gray-500" /> : <ChevronDown size={20} className="text-gray-500" />}
          </div>
        </div>
      </div>

      {/* 4. CHANGE: Expandable product section */}
      {isExpanded && (
        <div className="bg-gray-50 p-4 border-t border-gray-200">
          <h4 className="text-sm font-semibold mb-3 text-gray-700">Produkty w zamówieniu:</h4>
          <ul className="divide-y divide-gray-200">
            {order.items.map((item) => (
              <li key={item.product_id} className="flex justify-between items-center py-2 text-sm">
                <div>
                  <span className="font-medium text-gray-800">{item.product_name}</span>
                  <span className="text-gray-500 ml-2">
                    ({item.qty} szt. x {item.unit_price.toFixed(2)} zł)
                  </span>
                </div>
                <span className="font-semibold text-gray-800">{item.line_total.toFixed(2)} zł</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Page Component
export default function MyOrdersPage() {
  const { role } = useAuth();
  const [data, setData] = useState<PaginatedOrders | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const loadOrders = async () => {
    setLoading(true);
    try {
      const res = await api.get<PaginatedOrders>("/orders", {
        params: { page, page_size: 10 },
      });
      setData(res.data);
    } catch (err) {
      console.error("Błąd ładowania zamówień:", err);
      toast.error("Nie udało się pobrać zamówień");
    } finally {
      setLoading(false);
    }
  };

  // Load once on mount / when page changes
  useEffect(() => {
    loadOrders();
  }, [page]);

  // Poll periodically so the page reflects changes (e.g. WZ -> RELEASED -> order shipped)
  useEffect(() => {
    const interval = setInterval(() => {
      loadOrders();
    }, 10000); // every 10 seconds
    return () => clearInterval(interval);
  }, [page]);

  if (role !== "customer") return <div>Brak dostępu</div>;

  if (loading && !data) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-4">Moje zamówienia</h1>
        <p>Ładowanie...</p>
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-4">Moje zamówienia</h1>
        <p>Nie złożyłeś jeszcze żadnych zamówień.</p>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.page_size));

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Moje zamówienia</h1>
      
      <div className="space-y-4">
        {data.items.map((order) => (
          <OrderCard key={order.id} order={order} />
        ))}
      </div>

      {/* Pagination */}
      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          className="border rounded px-3 py-1 disabled:opacity-50"
          disabled={page === 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Poprzednia
        </button>
        <span>
          Strona {page} / {totalPages}
        </span>
        <button
          className="border rounded px-3 py-1 disabled:opacity-50"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          Następna
        </button>
      </div>
    </div>
  );
}