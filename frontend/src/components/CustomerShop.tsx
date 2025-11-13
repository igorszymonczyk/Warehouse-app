// frontend/src/components/CustomerShop.tsx
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import toast from "react-hot-toast";
import { Search, ShoppingCart } from "lucide-react";
import { useAuth } from "../store/auth"; // 1. ZMIANA: Import useAuth

// ... (typ Product i PaginatedProducts bez zmian) ...
type Product = {
  id: number;
  name: string;
  code: string;
  description?: string;
  sell_price_net: number;
  tax_rate: number;
  stock_quantity: number;
  image_url?: string | null;
};
type PaginatedProducts = {
  items: Product[];
  total: number;
  page: number;
  page_size: number;
};


// --- Komponent Karty Produktu ---
function ProductCard({ product }: { product: Product }) {
  // 2. ZMIANA: Pobieramy setCart i dodajemy stan ładowania
  const { setCart } = useAuth();
  const [isAdding, setIsAdding] = useState(false);

  const price_gross = product.sell_price_net * (1 + (product.tax_rate ?? 23) / 100);

  const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
  const fullImageUrl = product.image_url ? `${API_URL}${product.image_url}` : null;

  // 3. ZMIANA: Pełna implementacja handleAddToCart
  const handleAddToCart = async () => {
    setIsAdding(true);
    try {
      // Domyślnie dodajemy 1 sztukę
      const res = await api.post("/cart/add", {
        product_id: product.id,
        qty: 1,
      });
      setCart(res.data); // Aktualizuj globalny stan koszyka!
      toast.success(`Dodano do koszyka: ${product.name}`);
    } catch (err: unknown) { // <-- ZMIANA 1: Typ 'unknown' zamiast 'any'
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
    <div className="bg-white shadow rounded-lg overflow-hidden flex flex-col">
      {/* ... (logika wyświetlania zdjęcia bez zmian) ... */}
      <div className="h-48 bg-gray-200 flex items-center justify-center relative">
        {fullImageUrl ? (
          <img
            src={fullImageUrl}
            alt={product.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-gray-400">Brak zdjęcia</span>
        )}
      </div>
      
      <div className="p-4 flex flex-col flex-grow">
        {/* ... (dane produktu bez zmian) ... */}
        <h3 className="text-lg font-semibold text-gray-800 h-14">
          {product.name}
        </h3>
        <p className="text-sm text-gray-500 mb-2">Kod: {product.code}</p>
        <p className="text-sm text-gray-500 mb-4">
          Na stanie: {product.stock_quantity} szt.
        </p>

        <div className="mt-auto">
          {/* ... (cena bez zmian) ... */}
          <p className="text-2xl font-bold text-gray-900 mb-3">
            {price_gross.toFixed(2)} zł
            <span className="text-sm font-normal text-gray-500"> /szt. (brutto)</span>
          </p>

          {/* 4. ZMIANA: Aktualizacja przycisku */}
          <button
            onClick={handleAddToCart}
            disabled={isAdding || product.stock_quantity <= 0}
            className="w-full flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-400"
          >
            <ShoppingCart size={18} className="mr-2" />
            {product.stock_quantity <= 0
              ? "Brak na stanie"
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
  // ... (Cała reszta tego komponentu pozostaje bez zmian) ...
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

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
            sort_by: "name", 
            order: "asc",
          },
        });
        setProducts(res.data.items);
        setTotalPages(Math.ceil(res.data.total / res.data.page_size));
      } catch (err) {
        console.error(err);
        setError("Nie udało się załadować produktów.");
        toast.error("Nie udało się załadować produktów.");
      } finally {
        setLoading(false);
      }
    };
    const timeoutId = setTimeout(loadProducts, 300);
    return () => clearTimeout(timeoutId);
  }, [search, page]);


  return (
    <div className="mt-6">
      <h2 className="text-xl font-semibold mb-4">Katalog produktów</h2>
      
      {/* Wyszukiwarka */}
      <div className="relative mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Szukaj produktów po nazwie, kodzie..."
          className="border rounded-md w-full p-3 pl-10"
        />
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
      </div>

      {loading && <p>Ładowanie produktów...</p>}
      {error && <p className="text-red-500">{error}</p>}

      {!loading && !error && (
        <>
          {/* Siatka produktów */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>

          {/* Paginacja */}
          <div className="mt-8 flex items-center justify-center gap-3">
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
        </>
      )}
    </div>
  );
}