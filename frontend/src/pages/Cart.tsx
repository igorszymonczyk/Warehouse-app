import { useEffect, useState } from "react"; // Upewnij się, że useState jest zaimportowany
import { useAuth } from "../store/auth";
import type { Cart } from "../store/auth";
import { api } from "../lib/api";
import toast from "react-hot-toast";
import { Link } from "react-router-dom"; // useNavigate jest używany wewnątrz body funkcji
import { Trash2, Plus, Minus, Lightbulb } from "lucide-react"; // Lightbulb jest używany

// === TYPY DANYCH DLA REKOMENDACJI ===

// Typ produktu pobierany dla rekomendacji (bazuje na modelu Product)
type RecommendedProduct = {
  id: number;
  name: string;
  code: string;
  sell_price_net: number;
  image_url?: string | null;
  stock_quantity: number; 
};

// Typ reguły zwracanej z /salesman/recommendations
type RecommendationRule = {
    product_in: string[]; // Nazwa Produktu w Koszyku (warunek)
    product_out: string[]; // Nazwa Sugerowanego Produktu (sugestia)
    confidence: string;
    lift: string;
};

function RecommendationCard({ product, setCart }: { product: RecommendedProduct, setCart: (cart: Cart | null) => void }) {  const [isAdding, setIsAdding] = useState(false); // Stan do przycisku
  
  const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
  
  // Logika budowania URL dla zdjęć (bez zmian)
  const fullImageUrl = product.image_url 
    ? (product.image_url.startsWith('http') || product.image_url.startsWith('https')
         ? product.image_url 
         : `${API_URL}${product.image_url}`)
    : null;

  const price_gross = product.sell_price_net * (1 + 23 / 100); 

  // 2. ZMIANA: Nowa funkcja do dodawania produktu do koszyka
  const handleAddToCart = async () => {
      setIsAdding(true);
      try {
          const res = await api.post("/cart/add", {
              product_id: product.id,
              qty: 1, // Zawsze dodajemy jedną sztukę z rekomendacji
          });
          setCart(res.data); // Aktualizujemy globalny stan koszyka
          toast.success(`Dodano: ${product.name}`);
      } catch (err: unknown) { 
          console.error(err);
          toast.error("Błąd: Nie udało się dodać produktu");
      } finally {
          setIsAdding(false);
      }
  };
  
  return (
      <div className="bg-white shadow rounded-lg overflow-hidden flex flex-col hover:shadow-lg transition">
          <div className="h-24 bg-gray-200 flex items-center justify-center">
              {fullImageUrl ? (
                  <img src={fullImageUrl} alt={product.name} className="w-full h-full object-cover" />
              ) : (
                  <span className="text-gray-400 text-xs">Brak zdjęcia</span>
              )}
          </div>
          <div className="p-2 flex flex-col justify-between flex-grow">
              <div>
                  <h4 className="text-sm font-semibold text-gray-800 line-clamp-2 h-10">{product.name}</h4>
                  <p className="text-xs font-bold text-green-700 mt-1">
                      {price_gross.toFixed(2)} zł
                  </p>
              </div>
              {/* 3. ZMIANA: Przycisk dodawania */}
              <button
                  onClick={handleAddToCart}
                  disabled={isAdding || product.stock_quantity <= 0}
                  className="mt-2 w-full text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
              >
                  {product.stock_quantity <= 0 ? "Brak" : (isAdding ? "Dodawanie..." : "Dodaj do koszyka")}
              </button>
          </div>
      </div>
  );
}

export default function CartPage() {
  const { cart, setCart, role } = useAuth();
  // 1. ZMIANA: Zmienne dla logiki rekomendacji
  const [recommendedProducts, setRecommendedProducts] = useState<RecommendedProduct[]>([]);
  const [loadingRecs, setLoadingRecs] = useState(true);
  
  // Usunięto deklarację 'navigate' ponieważ nie była używana w tej funkcji
  
  const handleUpdateQty = async (itemId: number, newQty: number) => {
  
    if (newQty < 1) {
      handleDeleteItem(itemId);
      return;
    }

    try {
      const res = await api.put(`/cart/items/${itemId}`, { qty: newQty });
      setCart(res.data);
      toast.success("Zaktualizowano ilość");
    } catch {
      toast.error("Błąd: Nie udało się zaktualizować koszyka");
    }
  };

  const handleDeleteItem = async (itemId: number) => {
    if (!window.confirm("Czy na pewno chcesz usunąć ten produkt z koszyka?")) {
      return;
    }
    try {
      const res = await api.delete(`/cart/items/${itemId}`);
      setCart(res.data);
      toast.success("Produkt usunięty z koszyka");
    } catch {
      toast.error("Błąd: Nie udało się usunąć produktu");
    }
  };
  
  // 2. ZMIANA: Efekt do ładowania rekomendacji (Używa wszystkich zmiennych stanów)
  useEffect(() => {
    if (!cart || cart.items.length === 0) return;

    const loadRecommendations = async () => {
      setLoadingRecs(true);
      
      try {
        // Krok 1: Pobierz reguły Apriori
        const recsRes = await api.get<RecommendationRule[]>("/salesman/recommendations");

        // Krok 2: Znajdź produkty sugerowane (product_out)
        const cartProductNames = cart.items.map(item => item.name);
        
        // Zastosuj filtry: znajdź reguły, w których produkt_in jest już w koszyku
        const relevantRecs = recsRes.data.filter(rule => 
            rule.product_in.some(name => cartProductNames.includes(name))
        );
        
        // Zbierz wszystkie unikalne nazwy produktów do zasugerowania
        const productsToSuggest = new Set<string>();
        relevantRecs.forEach(rule => {
            rule.product_out.forEach(name => productsToSuggest.add(name));
        });

        if (productsToSuggest.size > 0) {
            // Krok 3: Pobierz szczegóły produktów po nazwie (POST /products/details)
            const detailsRes = await api.post("/products/details", { 
                product_names: Array.from(productsToSuggest) 
            });
            
            // Krok 4: Filtruj, aby uniknąć sugerowania czegoś, co już jest w koszyku
            const currentCartNames = new Set(cart.items.map(i => i.name));
            const filteredDetails = detailsRes.data.filter((p: RecommendedProduct) => !currentCartNames.has(p.name));
            
            setRecommendedProducts(filteredDetails as RecommendedProduct[]); // Użycie zmiennej 'recommendedProducts'
        }
      } catch (err) {
        console.error("Błąd ładowania rekomendacji:", err);
      } finally {
        setLoadingRecs(false);
      }
    };
    
    loadRecommendations();
  }, [cart]); // Uruchom przy każdej zmianie koszyka

  // Zabezpieczenie na wypadek, gdyby ktoś inny niż klient tu wszedł
  if (role !== "customer") {
    return <div>Brak dostępu</div>;
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-4">Mój koszyk</h1>
        <div className="bg-white p-6 rounded-lg shadow-md text-center">
          <p className="text-gray-600">Twój koszyk jest pusty.</p>
          <Link
            to="/"
            className="mt-4 inline-block bg-blue-600 text-white px-5 py-2 rounded hover:bg-blue-700 transition"
          >
            Wróć do sklepu
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Mój koszyk</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Lewa kolumna: Lista produktów w koszyku */}
        <div className="md:col-span-2 bg-white p-6 rounded-lg shadow-md">
          <ul className="divide-y divide-gray-200">
            {cart.items.map((item) => (
              <li key={item.id} className="flex items-center justify-between py-4">
                <div className="flex-grow">
                  <p className="font-semibold text-gray-800">{item.name}</p>
                  <p className="text-sm font-medium text-gray-500">
                    Cena: {item.unit_price.toFixed(2)} zł
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleUpdateQty(item.id, item.qty - 1)}
                    className="p-1 rounded bg-gray-200 hover:bg-gray-300"
                  >
                    <Minus size={16} />
                  </button>
                  <span className="w-10 text-center font-medium">{item.qty}</span>
                  <button
                    onClick={() => handleUpdateQty(item.id, item.qty + 1)}
                    className="p-1 rounded bg-gray-200 hover:bg-gray-300"
                  >
                    <Plus size={16} />
                  </button>
                </div>
                <p className="w-24 text-right font-semibold">
                  {item.line_total.toFixed(2)} zł
                </p>
                <button
                  onClick={() => handleDeleteItem(item.id)}
                  className="ml-4 p-2 text-red-500 hover:text-red-700"
                >
                  <Trash2 size={20} />
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Prawa kolumna: Podsumowanie */}
        <div className="md:col-span-1">
          <div className="bg-white p-6 rounded-lg shadow-md sticky top-6">
            <h2 className="text-lg font-semibold mb-4">Podsumowanie</h2>
            <div className="flex justify-between text-xl font-bold mb-4">
              <span>Suma:</span>
              <span>{cart.total.toFixed(2)} zł</span>
            </div>
            <Link
              to="/checkout"
              className="block text-center w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition"
            >
              Przejdź do kasy
            </Link>
          </div>
        </div>
      </div>
      
      {/* 3. ZMIANA: Sekcja Rekomendacji (Pełna szerokość) */}
      {loadingRecs ? (
          <p className="mt-8 text-center text-sm text-gray-500">Analizowanie wzorców zakupowych...</p>
      ) : (
          recommendedProducts.length > 0 && (
              <div className="mt-8">
                  <h2 className="text-xl font-semibold mb-4 flex items-center text-blue-700">
                      Inni klienci często wybierają:
                      <Lightbulb size={20} className="ml-2" />
                  </h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {recommendedProducts.map(product => (
                          <RecommendationCard key={product.id} product={product} setCart={setCart}/>
                      ))}
                  </div>
              </div>
          )
      )}
    </div>
  );
}