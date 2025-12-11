import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import toast from "react-hot-toast";
import { useAuth } from "../store/auth";
import CustomerShop from "./CustomerShop";
import WZPage from "./WZ"; // <--- 1. IMPORT WZ PAGE

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

// === DATA TYPES ===
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

// === CARD COMPONENTS ===
type StatCardProps = {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  colorClass: string;
  to?: string;
};

function StatCard({ title, value, icon, colorClass, to }: StatCardProps) {
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

// === CHART AND LIST COMPONENTS ===

function RevenueChart({ data }: { data: ChartDataPoint[] }) {
  return (
    <div className="bg-white p-6 rounded-lg shadow-md h-full">
      <h3 className="text-lg font-semibold mb-4">Revenue (last 7 days)</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          <XAxis dataKey="date" stroke="#6b7280" />
          <YAxis stroke="#6b7280" />
          <Tooltip
            formatter={(value: number) => [`${value.toFixed(2)} PLN`, "Revenue"]}
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
            name="Revenue"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function TopProductsList({ products }: { products: TopProduct[] }) {
  return (
    <div className="bg-white p-6 rounded-lg shadow-md h-full">
      <h3 className="text-lg font-semibold mb-4 flex items-center">
        <TrendingUp size={20} className="mr-2 text-blue-600" />
        Top 5 Products (this month)
      </h3>
      {products.length === 0 ? (
        <p className="text-gray-500 text-sm">No sales data for this month.</p>
      ) : (
        <ol className="list-decimal list-inside space-y-3">
          {products.map((product) => (
            <li key={product.product_id} className="text-sm">
              <span className="font-medium text-gray-800">
                {product.product_name}
              </span>
              <span className="text-gray-500 ml-2">
                ({product.total_quantity_sold} pcs.)
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// === ADMIN / SALESMAN DASHBOARD ===
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
        
        const validatedChartData = chartRes.data.data.map(item => ({
            ...item,
            revenue: Number(item.revenue) || 0,
        }));
        
        setChartData(validatedChartData);
        setTopProducts(topProductsRes.data.data);
      } catch (err) {
        console.error(err);
        const errorMsg = "Failed to load dashboard data";
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
        <h1 className="text-2xl font-semibold mb-4">Dashboard</h1>
        <p>Loading data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-4">Dashboard</h1>
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <>
      {stats && (
        <dl className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <StatCard
            title="Total Revenue"
            value={`${stats.total_revenue.toFixed(2)} PLN`}
            icon={<DollarSign size={24} />}
            colorClass="bg-green-600"
          />
          <StatCard
            title="Invoices this month"
            value={stats.invoices_this_month}
            icon={<Receipt size={24} />}
            colorClass="bg-blue-600"
            to="/invoices"
          />
          <StatCard
            title="Low stock products"
            value={stats.low_stock_products}
            icon={<PackageX size={24} />}
            colorClass="bg-red-600"
            to="/products?sort_by=stock_quantity&order=asc"
          />
          <StatCard
            title="Total Invoices"
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
      <CustomerShop />
    </>
  );
}

// === MAIN DASHBOARD COMPONENT ===
export default function Dashboard() {
  const { role } = useAuth();

  // 2. CHANGE: For warehouse role, display WZ page immediately
  if (role === "warehouse") {
      return <WZPage />;
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Dashboard</h1>
      
      {role === "admin" || role === "salesman" ? (
        <AdminSalesmanDashboard />
      ) : (
        <CustomerDashboard />
      )}
    </div>
  );
}