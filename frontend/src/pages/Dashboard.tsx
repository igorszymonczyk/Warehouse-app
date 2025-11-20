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
  Lightbulb,
  Package, // <-- NOWY IMPORT
  ListOrdered, // <-- NOWY IMPORT
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

// === TYPY DANYCH ===
type WzDoc = { // <-- NOWY TYP DANYCH
    id: number;
    buyer_name: string;
    status: 'NEW' | 'IN_PROGRESS' | 'RELEASED' | 'CANCELLED';
    created_at: string;
};

type RecommendationRule = {
    product_in: string[];
    product_out: string[];
    confidence: string;
    lift: string;
    message?: string;
};

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

// === KOMPONENTY WYKRESÓW I LIST (bez zmian) ===

function RevenueChart({ data }: { data: ChartDataPoint[] }) {
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

function TopProductsList({ products }: { products: TopProduct[] }) {
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

function RecommendationPanel({ rules }: { rules: RecommendationRule[] }) {
  if (rules.length === 1 && rules[0].message) {
      return (
          <div className="bg-orange-100 border border-orange-400 text-orange-700 p-4 rounded-lg shadow-md">
              <h3 className="text-lg font-semibold mb-2 flex items-center">
                  <Lightbulb size={20} className="mr-2" />
                  Wsparcie AI (Rekomendacje)
              </h3>
              <p className="text-sm">{rules[0].message}</p>
          </div>
      );
  }

  return (
      <div className="bg-white p-6 rounded-lg shadow-xl border border-blue-200">
          <h3 className="text-xl font-bold mb-4 flex items-center text-blue-800">
              <Lightbulb size={24} className="mr-3 text-blue-600" />
              Sugerowane Akcje Sprzedażowe (AI)
          </h3>
          <p className="text-sm text-gray-600 mb-4">
              Oparte na analizie transakcji historycznych (Apriori). **Użyj ich do tworzenia ofert i mailingu.**
          </p>
          
          <ol className="space-y-4"> 
              {rules.map((rule, index) => (
                  <li key={index} className="text-base border-b pb-2 last:border-b-0">
                      
                      <p className="mb-1">
                          <span className="font-semibold text-gray-700">Wzorzec:</span>
                          <span className="font-bold text-blue-700 ml-2 p-1 bg-blue-50 rounded-md">
                              {rule.product_in.join(' + ')}
                          </span>
                      </p>
                      
                      <p>
                          <span className="font-semibold text-gray-700">Zasugeruj dodatkowo:</span>
                          <span className="font-bold text-green-700 ml-2 p-1 bg-green-50 rounded-md">
                              {rule.product_out.join(' + ')}
                          </span>
                      </p>

                      <p className="text-xs text-gray-500 mt-1">
                          Pewność: <span className="font-medium">{rule.confidence}</span> | 
                          Wzrost (Lift): <span className="font-medium">{rule.lift}</span>
                      </p>
                  </li>
              ))}
          </ol>
      </div>
  );
}


// === PULPIT DLA MAGAZYNIERA === <---------------------------------- NOWY KOMPONENT
function WarehouseDashboard() {
    const [wzPending, setWzPending] = useState<WzDoc[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadWzData = async () => {
            try {
                setLoading(true);
                // 1. Pobieramy dokumenty WZ ze statusami NEW lub IN_PROGRESS
                const res = await api.get<{ items: WzDoc[], total: number }>("/warehouse-documents", {
                    params: {
                        status: ["NEW", "IN_PROGRESS"], // Filtr po wielu statusach
                        page_size: 20,
                    }
                });
                setWzPending(res.data.items);

                // 2. Opcjonalnie: możemy też pobrać statystyki low_stock
                
            } catch (err) {
                console.error(err);
                setError("Nie udało się załadować listy WZ.");
            } finally {
                setLoading(false);
            }
        };
        loadWzData();
    }, []);

    if (loading) return <p>Ładowanie pulpitu magazynu...</p>;
    if (error) return <p className="text-red-500">{error}</p>;

    const wzCount = wzPending.length;

    return (
        <>
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <StatCard
                    title="WZ Oczekujące / W Trakcie"
                    value={wzCount}
                    icon={<ListOrdered size={24} />}
                    colorClass={wzCount > 0 ? "bg-red-600" : "bg-green-600"}
                    to="/wz"
                />
                {/* TUTAJ MOŻNA DODAĆ DRUGĄ KARTĘ np. Produkty na wyczerpaniu */}
                <StatCard
                    title="Całkowita liczba WZ (historia)"
                    value={"..."} 
                    icon={<Archive size={24} />}
                    colorClass={"bg-gray-500"}
                    to="/wz"
                />
            </dl>

            <div className="mt-6">
                <h2 className="text-xl font-semibold mb-3 flex items-center">
                    <Package size={20} className="mr-2 text-red-600" /> 
                    WZ do realizacji ({wzCount})
                </h2>
                {wzCount === 0 ? (
                    <div className="bg-green-100 p-4 rounded-lg text-green-700">Brak dokumentów do wydania.</div>
                ) : (
                    <div className="bg-white p-4 rounded-lg shadow-md">
                        {wzPending.map(doc => (
                            <Link 
                                to={`/wz?doc_id=${doc.id}`} // Zakładamy, że WZ przyjmuje ID w query
                                key={doc.id} 
                                className="block border-b p-2 hover:bg-gray-50 transition"
                            >
                                <div className="flex justify-between text-sm">
                                    <span className="font-medium text-gray-800">WZ #{doc.id} ({doc.status})</span>
                                    <span className="text-gray-600">{doc.buyer_name}</span>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}


// === PULPIT DLA ADMINA / SPRZEDAWCY (AI jest w tym komponencie) ===
function AdminSalesmanDashboard() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendationRule[]>([]);
  
  // 5. ZMIANA: Dodajemy stan na rekomendacje
  // ... (reszta stanów i logiki ładowania bez zmian) ...
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingAI, setLoadingAI] = useState(true); // Nowy stan dla ładowania AI

  useEffect(() => {
    const loadRecommendations = async () => {
      try {
        setLoadingAI(true);
        const aiRes = await api.get<RecommendationRule[]>("/salesman/recommendations");
        setRecommendations(aiRes.data);
      } catch (err) {
        console.error("Błąd ładowania AI:", err);
        setRecommendations([{ message: "Błąd serwera AI lub brak dostępu." } as RecommendationRule]);
      } finally {
        setLoadingAI(false);
      }
    };

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
    
    // Ładujemy dane statystyczne i rekomendacje równolegle
    loadDashboardData();
    loadRecommendations();
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
      {/* Panel AI widoczny tylko dla Admin/Salesman */}
      <div className="mb-6">
          {loadingAI ? (
            <p className="text-sm text-gray-500">Ładowanie analizy AI...</p>
          ) : (
            <RecommendationPanel rules={recommendations} />
          )}
      </div>

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
      ) : role === "warehouse" ? (
        <WarehouseDashboard /> // <-- ZMIANA: Nowy pulpit dla Magazyniera
      ) : (
        <CustomerDashboard />
      )}
    </div>
  );
}