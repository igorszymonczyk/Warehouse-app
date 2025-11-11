// frontend/src/components/CustomerShop.tsx
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import toast from "react-hot-toast";
import { Search, ShoppingCart } from "lucide-react";

// 1. ZMIANA: Zaktualizuj typ, aby zawierał image_url
type Product = {
  id: number;
  name: string;
  code: string;
  description?: string;
  sell_price_net: number;
  tax_rate: number;
  stock_quantity: number;
  image_url?: string | null; // <-- DODANE
};

type PaginatedProducts = {
  items: Product[];
  total: number;
  page: number;
  page_size: number;
};

// --- Komponent Karty Produktu ---
function ProductCard({ product }: { product: Product }) {
  const price_gross = product.sell_price_net * (1 + (product.tax_rate ?? 23) / 100);

  // 2. ZMIANA: Budujemy pełny adres URL do zdjęcia
  const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
  const fullImageUrl = product.image_url ? `${API_URL}${product.image_url}` : null;

  const handleAddToCart = () => {
    // TODO: Zaimplementować logikę koszyka
    toast.success(`Dodano do koszyka: ${product.name}`);
  };

  return (
    <div className="bg-white shadow rounded-lg overflow-hidden flex flex-col">
      {/* 3. ZMIANA: Logika wyświetlania zdjęcia */}
      <div className="h-48 bg-gray-200 flex items-center justify-center relative">
        {fullImageUrl ? (
          <img
            src={fullImageUrl}
            alt={product.name}
            className="w-full h-full object-cover" // object-cover zapewni, że zdjęcie wypełni pole
          />
        ) : (
          <span className="text-gray-400">Brak zdjęcia</span>
        )}
      </div>
      <div className="p-4 flex flex-col flex-grow">
        <h3 className="text-lg font-semibold text-gray-800 h-14">
          {product.name}
        </h3>
        <p className="text-sm text-gray-500 mb-2">Kod: {product.code}</p>
        <p className="text-sm text-gray-500 mb-4">
          Na stanie: {product.stock_quantity} szt.
        </p>

        <div className="mt-auto">
          <p className="text-2xl font-bold text-gray-900 mb-3">
            {price_gross.toFixed(2)} zł
            <span className="text-sm font-normal text-gray-500"> /szt. (brutto)</span>
          </p>
          <button
            onClick={handleAddToCart}
            className="w-full flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            <ShoppingCart size={18} className="mr-2" />
            Dodaj do koszyka
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
  
  // ... (stany i logika useEffect bez zmian) ...
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