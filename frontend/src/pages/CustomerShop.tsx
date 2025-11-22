import { useEffect, useState } from "react";
import { api } from "../lib/api";
import toast from "react-hot-toast";
import { Search, ShoppingCart, ArrowUpDown } from "lucide-react";
import { useAuth } from "../store/auth";

// === TYPY DANYCH ===
type Product = {
  id: number;
  name: string;
  code: string;
  description?: string;
  sell_price_net: number;
  tax_rate: number;
  stock_quantity: number;
  image_url?: string | null;
  category?: string | null;
};

type PaginatedProducts = {
  items: Product[];
  total: number;
  page: number;
  page_size: number;
};

// --- Komponent Karty Produktu ---
function ProductCard({ product }: { product: Product }) {
  const { setCart } = useAuth();
  const [isAdding, setIsAdding] = useState(false);

  const price_gross = product.sell_price_net * (1 + (product.tax_rate ?? 23) / 100);

  const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
  
  // Logika URL zdjęcia (obsługa linków zewnętrznych)
  const fullImageUrl = product.image_url 
    ? (product.image_url.startsWith('http') || product.image_url.startsWith('https')
         ? product.image_url 
         : `${API_URL}${product.image_url}`)
    : null;
    
  const handleAddToCart = async () => {
    setIsAdding(true);
    try {
      const res = await api.post("/cart/add", {
        product_id: product.id,
        qty: 1,
      });
      setCart(res.data);
      toast.success(`Dodano do koszyka: ${product.name}`);
    } catch (err: unknown) {
      console.error(err);
      let msg = "Nie udało się dodać produktu"; 
      if (typeof err === 'object' && err !== null && 'response' in err) {
        const response = (err as { response?: { data?: { detail?: string } } }).response;
        if (response?.data?.detail) {
          msg = response.data.detail;
        }
      }
      toast.error(msg);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="bg-white shadow rounded-lg overflow-hidden flex flex-col hover:shadow-md transition">
      <div className="h-48 bg-gray-200 flex items-center justify-center relative">
        {fullImageUrl ? (
          <img
            src={fullImageUrl}
            alt={product.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <span className="text-gray-400 text-sm">Brak zdjęcia</span>
        )}
      </div>
      
      <div className="p-4 flex flex-col flex-grow">
        <h3 className="text-md font-semibold text-gray-800 line-clamp-2 h-12 mb-1" title={product.name}>
          {product.name}
        </h3>
        <p className="text-xs text-gray-500 mb-1">Kod: {product.code}</p>
        <div className="flex justify-between items-center mb-3">
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${product.stock_quantity > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {product.stock_quantity > 0 ? 'Dostępny' : 'Niedostępny'}
            </span>
            <span className="text-xs text-gray-400">Stan: {product.stock_quantity}</span>
        </div>

        <div className="mt-auto">
          <p className="text-xl font-bold text-gray-900 mb-3">
            {price_gross.toFixed(2)} zł
            <span className="text-xs font-normal text-gray-500 ml-1">brutto</span>
          </p>

          <button
            onClick={handleAddToCart}
            disabled={isAdding || product.stock_quantity <= 0}
            className="w-full flex items-center justify-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            <ShoppingCart size={16} className="mr-2" />
            {product.stock_quantity <= 0
              ? "Brak towaru"
              : isAdding
              ? "Dodawanie..."
              : "Dodaj do koszyka"}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Główny komponent sklepu ---
export default function CustomerShop() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  
  // Stany filtrów
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>(undefined);
  const [sortBy, setSortBy] = useState<"name" | "sell_price_net" | "stock_quantity">("name");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [categoryLoading, setCategoryLoading] = useState(false);

  // 1. Ładowanie Kategorii
  useEffect(() => {
    const fetchCategories = async () => {
      setCategoryLoading(true);
      try {
        const res = await api.get<string[]>("/shop/categories");
        // Filtrujemy puste kategorie
        setAllCategories(res.data.filter(c => c));
      } catch (err) {
        console.error("Failed to fetch categories", err);
      } finally {
        setCategoryLoading(false);
      }
    };
    fetchCategories();
  }, []);
  
  // 2. Ładowanie Produktów
  useEffect(() => {
    const loadProducts = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get<PaginatedProducts>("/shop/products", {
          params: {
            page: page,
            page_size: 12,
            q: search || undefined,
            category: categoryFilter || undefined,
            sort_by: sortBy,
            order: order,
          },
        });
        setProducts(res.data.items);
        setTotalPages(Math.ceil(res.data.total / res.data.page_size));
      } catch (err) {
        console.error(err);
        setError("Nie udało się załadować produktów.");
        toast.error("Błąd ładowania sklepu.");
      } finally {
        setLoading(false);
      }
    };
    
    // Debounce dla wyszukiwania
    const timeoutId = setTimeout(loadProducts, 300);
    return () => clearTimeout(timeoutId);
  }, [search, page, categoryFilter, sortBy, order]);

  // Helper do zmiany sortowania
  const toggleSort = (field: typeof sortBy) => {
    setPage(1); 
    if (sortBy === field) {
      setOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setOrder("asc");
    }
  };

  return (
    <div className="mt-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Katalog produktów</h2>
        <span className="text-sm text-gray-500">Znaleziono stron: {totalPages}</span>
      </div>
      
      {/* PANEL FILTRÓW */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-8">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            
            {/* Grupa lewa: Szukaj + Kategoria */}
            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto flex-grow">
                <div className="relative flex-grow max-w-md">
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => {
                            setPage(1); 
                            setSearch(e.target.value);
                        }}
                        placeholder="Szukaj po nazwie..."
                        className="border border-gray-300 rounded-md w-full py-2 pl-10 pr-3 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                </div>

                <div className="min-w-[200px]">
                    <select
                        value={categoryFilter || ""}
                        onChange={(e) => {
                            setPage(1); 
                            setCategoryFilter(e.target.value || undefined);
                        }}
                        disabled={categoryLoading}
                        className="border border-gray-300 px-3 py-2 rounded-md w-full focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                    >
                        <option value="">Wszystkie kategorie</option>
                        {allCategories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Grupa prawa: Sortowanie */}
            <div className="flex gap-2 w-full md:w-auto justify-end">
                <span className="text-sm text-gray-500 self-center mr-1">Sortuj:</span>
                <button
                    onClick={() => toggleSort("name")}
                    className={`flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium transition ${sortBy === "name" ? "bg-blue-100 text-blue-700 border border-blue-300" : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"}`}
                >
                    Nazwa
                    {sortBy === "name" && <ArrowUpDown size={14} className={order === 'desc' ? 'rotate-180' : ''} />}
                </button>
                <button
                    onClick={() => toggleSort("sell_price_net")}
                    className={`flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium transition ${sortBy === "sell_price_net" ? "bg-blue-100 text-blue-700 border border-blue-300" : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"}`}
                >
                    Cena
                    {sortBy === "sell_price_net" && <ArrowUpDown size={14} className={order === 'desc' ? 'rotate-180' : ''} />}
                </button>
            </div>
          </div>
      </div>

      {/* TREŚĆ */}
      {loading && <div className="text-center py-10 text-gray-500">Ładowanie produktów...</div>}
      {error && <div className="text-center py-10 text-red-500 bg-red-50 rounded-lg">{error}</div>}

      {!loading && !error && (
        <>
          {products.length === 0 ? (
             <div className="text-center py-16 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                <p className="text-gray-500 text-lg">Nie znaleziono produktów spełniających kryteria.</p>
                <button 
                    onClick={() => {setSearch(""); setCategoryFilter(undefined);}}
                    className="mt-4 text-blue-600 hover:underline"
                >
                    Wyczyść filtry
                </button>
             </div>
          ) : (
            <>
              {/* Siatka produktów */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>

              {/* Paginacja */}
              <div className="mt-10 flex items-center justify-center gap-4">
                <button
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Poprzednia
                </button>
                <span className="text-sm text-gray-600 font-medium">
                  Strona {page} z {totalPages}
                </span>
                <button
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Następna
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}