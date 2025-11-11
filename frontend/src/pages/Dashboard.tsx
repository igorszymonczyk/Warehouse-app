// frontend/src/pages/Dashboard.tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import toast from "react-hot-toast";
import { useAuth } from "../store/auth";
import CustomerShop from "../components/CustomerShop";

import {
  DollarSign,
  Receipt,
  PackageX,
  Archive,
  TrendingUp,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
// Usunąłem zduplikowany import useAuth stąd

// === TYPY DANYCH ===
type StatsData = {
  total_revenue: number;
  total_invoices: number;
  invoices_this_month: number;
  low_stock_products: number;
};

type ChartDataPoint = {
  date: string;
  revenue: number;
};

type TopProduct = {
  product_id: number;
  product_name: string;
  total_quantity_sold: number;
};

// === KOMPONENTY KART ===
type StatCardProps = {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  colorClass: string;
  to?: string;
};

function StatCard({ title, value, icon, colorClass, to }: StatCardProps) {
  // ... (bez zmian) ...
  const cardContent = (
    <div
      className={`bg-white p-6 rounded-lg shadow-md flex items-center gap-4 transition-shadow duration-200 ${
        to ? "hover:shadow-lg cursor-pointer" : ""
      }`}
    >
      <div
        className={`p-3 rounded-full flex items-center justify-center text-white ${colorClass}`}
      >
        {icon}
      </div>
      <div>
        <dt className="text-sm font-medium text-gray-500 truncate">{title}</dt>
        <dd className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">
          {value}
        </dd>
      </div>
    </div>
  );

  if (to) {
    return (
      <Link
        to={to}
        className="focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg"
      >
        {cardContent}
      </Link>
    );
  }
  return cardContent;
}

// === KOMPONENT WYKRESU ===
function RevenueChart({ data }: { data: ChartDataPoint[] }) {
  // ... (bez zmian) ...
  return (
    <div className="bg-white p-6 rounded-lg shadow-md h-full">
      <h3 className="text-lg font-semibold mb-4">Przychód (ostatnie 7 dni)</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          <XAxis dataKey="date" stroke="#6b7280" />
          <YAxis stroke="#6b7280" />
          <Tooltip
            formatter={(value: number) => [`${value.toFixed(2)} zł`, "Przychód"]}
            labelStyle={{ color: "#333" }}
            itemStyle={{ color: "#0d9488" }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="revenue"
            stroke="#0d9488"
            strokeWidth={2}
            activeDot={{ r: 8 }}
            name="Przychód"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// === KOMPONENT LISTY "Top 5 Produktów" ===
function TopProductsList({ products }: { products: TopProduct[] }) {
  // ... (bez zmian) ...
  return (
    <div className="bg-white p-6 rounded-lg shadow-md h-full">
      <h3 className="text-lg font-semibold mb-4 flex items-center">
        <TrendingUp size={20} className="mr-2 text-blue-600" />
        Top 5 produktów (ten miesiąc)
      </h3>
      {products.length === 0 ? (
        <p className="text-gray-500 text-sm">Brak danych o sprzedaży w tym miesiącu.</p>
      ) : (
        <ol className="list-decimal list-inside space-y-3">
          {products.map((product) => (
            <li key={product.product_id} className="text-sm">
              <span className="font-medium text-gray-800">
                {product.product_name}
              </span>
              <span className="text-gray-500 ml-2">
                ({product.total_quantity_sold} szt.)
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// === KOMPONENT GŁÓWNY (Z PODZIAŁEM NA ROLE) ===

function AdminSalesmanDashboard() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [statsRes, chartRes, topProductsRes] = await Promise.all([
          api.get<StatsData>("/stats/summary"),
          api.get<{ data: ChartDataPoint[] }>("/stats/daily-revenue"),
          api.get<{ data: TopProduct[] }>("/stats/top-products"),
        ]);
        setStats(statsRes.data);
        
        // ZMIANA: Konwersja pola revenue na liczbę (Number())
        const validatedChartData = chartRes.data.data.map(item => ({
            ...item,
            // Number(null) daje 0, ale Number(undefined) daje NaN, stąd || 0
            revenue: Number(item.revenue) || 0,
        }));
        
        setChartData(validatedChartData);
        setTopProducts(topProductsRes.data.data);
      } catch (err) {
        console.error(err);
        const errorMsg = "Nie udało się załadować danych dashboardu";
        setError(errorMsg);
        toast.error(errorMsg);
      } finally {
        setLoading(false);
      }
    };
    loadDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-4">Pulpit</h1>
        <p>Ładowanie danych...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-4">Pulpit</h1>
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <>
      {stats && (
        <dl className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <StatCard
            title="Całkowity przychód"
            value={`${stats.total_revenue.toFixed(2)} zł`}
            icon={<DollarSign size={24} />}
            colorClass="bg-green-600"
          />
          <StatCard
            title="Faktury w tym miesiącu"
            value={stats.invoices_this_month}
            icon={<Receipt size={24} />}
            colorClass="bg-blue-600"
            to="/invoices"
          />
          <StatCard
            title="Produkty na wyczerpaniu"
            value={stats.low_stock_products}
            icon={<PackageX size={24} />}
            colorClass="bg-red-600"
            to="/products?sort_by=stock_quantity&order=asc"
          />
          <StatCard
            title="Wszystkie faktury"
            value={stats.total_invoices}
            icon={<Archive size={24} />}
            colorClass="bg-gray-500"
            to="/invoices"
          />
        </dl>
      )}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {chartData.length > 0 && <RevenueChart data={chartData} />}
        </div>
        <div className="lg:col-span-1">
          {topProducts && <TopProductsList products={topProducts} />}
        </div>
      </div>
    </>
  );
}

function CustomerDashboard() {
  return (
    <>
      {/* Wstawiamy komponent sklepu zamiast tekstu */}
      <CustomerShop />
      {/* TODO: Dodać listę "Moje Zamówienia" i "Moje Faktury" */}
    </>
  );
}

// === GŁÓWNY KOMPONENT DASHBOARD (Router) ===
export default function Dashboard() {
  // Pobieramy rolę
  const { role } = useAuth();

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Pulpit</h1>
      
      {/* Renderujemy odpowiedni pulpit na podstawie roli */}
      {role === "admin" || role === "salesman" ? (
        <AdminSalesmanDashboard />
      ) : (
        <CustomerDashboard />
      )}
    </div>
  );
}