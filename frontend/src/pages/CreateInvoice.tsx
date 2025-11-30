import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Trash2, Plus, ArrowLeft, Save, Search, Sparkles } from "lucide-react";
import { useForm, useFieldArray, type SubmitHandler } from "react-hook-form";
import toast from "react-hot-toast"; 

// --- TYPY ---
type RecommendationRule = {
    product_in: string[];
    product_out: string[];
    confidence: string;
    lift: string;
};

type Product = {
  id: number;
  name: string;
  code: string;
  sell_price_net: number;
  tax_rate: number;
  stock_quantity: number;
  image_url?: string;
};

type InvoiceItem = {
  product_id: number;
  name: string;
  quantity: number;
  price_net: number;
  tax_rate: number;
};

type InvoiceFormInputs = {
  buyer_name: string;
  buyer_nip: string;
  buyer_address: string;
  items: InvoiceItem[];
};

export default function CreateInvoice() {
  const navigate = useNavigate();

  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Stan rekomendacji
  const [recommendations, setRecommendations] = useState<Product[]>([]);
  const [loadingRecs, setLoadingRecs] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<InvoiceFormInputs>({
    defaultValues: {
      buyer_name: "",
      buyer_nip: "",
      buyer_address: "",
      items: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "items",
    keyName: "keyId",
  });

  const watchedItems = watch("items");
  const itemNamesJson = JSON.stringify(watchedItems.map(i => i.name));

  // 1. Ładowanie produktów do wyszukiwarki
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const res = await api.get<{ items: Product[] }>("/products?page_size=10000");
        const list = res.data.items || [];
        setAllProducts(list);
      } catch (err) {
        console.error("Błąd pobierania produktów:", err);
      }
    };
    fetchProducts();
  }, []);

  // 2. LOGIKA REKOMENDACJI
  useEffect(() => {
    const currentNames: string[] = itemNamesJson ? JSON.parse(itemNamesJson) : [];

    if (currentNames.length === 0) {
        setRecommendations([]);
        return;
    }

    const loadRecommendations = async () => {
      setLoadingRecs(true);
      try {
        // Krok A: Reguły
        const recsRes = await api.get<RecommendationRule[]>("/salesman/recommendations");
        
        // Krok B: Dopasowanie
        const relevantRecs = recsRes.data.filter(rule => 
            rule.product_in.some(name => currentNames.includes(name))
        );
        
        // Krok C: Unikalne nazwy
        const productsToSuggest = new Set<string>();
        relevantRecs.forEach(rule => {
            rule.product_out.forEach(name => productsToSuggest.add(name));
        });

        if (productsToSuggest.size > 0) {
            // Krok D: Detale z bazy
            const detailsRes = await api.post("/products/details", { 
                product_names: Array.from(productsToSuggest) 
            });
            
            // Krok E: Filtracja (bez tych co już są)
            const currentNameSet = new Set(currentNames);
            const filteredDetails = detailsRes.data.filter((p: Product) => !currentNameSet.has(p.name));
            
            setRecommendations(filteredDetails);
        } else {
            setRecommendations([]);
        }
      } catch (err) {
        console.error("Błąd ładowania rekomendacji:", err);
      } finally {
        setLoadingRecs(false);
      }
    };

    const timer = setTimeout(loadRecommendations, 300);
    return () => clearTimeout(timer);

  }, [itemNamesJson]); 


  const filteredProducts = allProducts.filter((p) => {
    const matchesSearch = 
      p.name.toLowerCase().includes(search.toLowerCase()) || 
      p.code.toLowerCase().includes(search.toLowerCase());
    const notAdded = !watchedItems.some((item) => item.product_id === p.id);
    return matchesSearch && notAdded;
  });

  const handleAddProduct = (product: Product) => {
    if (product.stock_quantity <= 0) {
        toast.error("Brak towaru w magazynie!");
        return;
    }
    append({
      product_id: product.id,
      name: product.name,
      quantity: 1,
      price_net: product.sell_price_net,
      tax_rate: product.tax_rate ?? 23,
    });
    setSearch(""); 
    setFocused(false);
    inputRef.current?.blur();
  };

  const onSubmit: SubmitHandler<InvoiceFormInputs> = async (data) => {
    if (data.items.length === 0) {
      toast.error("Dodaj przynajmniej jeden produkt do faktury.");
      return;
    }
    setIsSubmitting(true);
    try {
      await api.post("/invoices", data);
      toast.success("Faktura została utworzona");
      navigate("/invoices");
    } catch (err) {
      console.error(err);
      toast.error("Błąd przy tworzeniu faktury.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (watchedItems.length > 0 || watch("buyer_name")) {
      if (confirm("Anulować? Zmiany zostaną utracone.")) navigate("/invoices");
    } else {
      navigate("/invoices");
    }
  };

  const totalNet = watchedItems.reduce((sum, i) => sum + i.price_net * i.quantity, 0);
  const totalVat = watchedItems.reduce((sum, i) => sum + i.price_net * i.quantity * (i.tax_rate / 100), 0);
  const totalGross = totalNet + totalVat;

  return (
    <div className="p-6 max-w-7xl mx-auto flex gap-6 items-start">
      
      {/* LEWA KOLUMNA: Formularz */}
      <div className="flex-1 min-w-0">
        <form onSubmit={handleSubmit(onSubmit)}>
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-2xl font-semibold">Nowa faktura</h1>
                <button type="button" onClick={() => navigate("/invoices")} className="text-gray-500 hover:text-black flex items-center">
                    <ArrowLeft size={18} className="mr-1" /> Powrót
                </button>
            </div>

            <div className="bg-white p-6 rounded shadow-sm border mb-6 grid gap-4">
                <h2 className="font-medium border-b pb-2 text-gray-700">Dane Nabywcy</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="text-sm text-gray-600 block mb-1">Nazwa *</label>
                        <input
                            className={`border rounded p-2 w-full ${errors.buyer_name ? 'border-red-500' : ''}`}
                            {...register("buyer_name", { required: "Wymagane" })}
                        />
                        {errors.buyer_name && <p className="text-red-500 text-xs">{errors.buyer_name.message}</p>}
                    </div>
                    <div>
                        <label className="text-sm text-gray-600 block mb-1">NIP</label>
                        <input className="border rounded p-2 w-full" {...register("buyer_nip")} />
                    </div>
                    <div className="md:col-span-2">
                        <label className="text-sm text-gray-600 block mb-1">Adres</label>
                        <input className="border rounded p-2 w-full" {...register("buyer_address")} />
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded shadow-sm border mb-6">
                <h2 className="font-medium border-b pb-2 text-gray-700 mb-4">Pozycje faktury</h2>

                <div className="relative mb-6">
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
                        <input
                            ref={inputRef}
                            className="border rounded p-2 pl-10 w-full focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="Wpisz nazwę lub kod produktu..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onFocus={() => setFocused(true)}
                            onBlur={() => setTimeout(() => setFocused(false), 200)}
                        />
                    </div>
                    {focused && search.length >= 1 && (
                        <ul className="absolute z-20 bg-white border rounded mt-1 shadow-xl max-h-60 overflow-auto w-full">
                            {filteredProducts.length > 0 ? (
                                filteredProducts.slice(0, 20).map((p) => (
                                    <li
                                        key={p.id}
                                        onMouseDown={() => handleAddProduct(p)}
                                        className={`px-4 py-2 hover:bg-blue-50 cursor-pointer flex justify-between items-center border-b last:border-none ${p.stock_quantity <= 0 ? 'opacity-50' : ''}`}
                                    >
                                        <div>
                                            <div className="font-medium text-gray-800">{p.name}</div>
                                            <div className="text-xs text-gray-500">{p.code}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="font-bold text-gray-700">{p.sell_price_net.toFixed(2)} zł</div>
                                            <div className={`text-xs ${p.stock_quantity > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                Stan: {p.stock_quantity}
                                            </div>
                                        </div>
                                    </li>
                                ))
                            ) : (
                                <li className="px-4 py-3 text-gray-500 text-center">Brak wyników</li>
                            )}
                        </ul>
                    )}
                </div>

                <table className="min-w-full text-sm mb-4">
                    <thead className="bg-gray-50 text-gray-500">
                        <tr>
                            <th className="p-3 text-left font-normal">Produkt</th>
                            <th className="p-3 text-right font-normal w-24">Cena</th>
                            <th className="p-3 text-right font-normal w-20">Ilość</th>
                            <th className="p-3 text-right font-normal w-20">VAT</th>
                            <th className="p-3 text-right font-normal">Wartość</th>
                            <th className="p-3 text-center w-10"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {fields.map((item, index) => {
                            const price = watch(`items.${index}.price_net`);
                            const qty = watch(`items.${index}.quantity`);
                            const tax = watch(`items.${index}.tax_rate`);
                            const val = (price * qty * (1 + tax / 100)) || 0;

                            return (
                                <tr key={item.keyId} className="border-b last:border-none hover:bg-gray-50">
                                    <td className="p-3 font-medium">{item.name}</td>
                                    <td className="p-3 text-right">
                                        <input type="number" step="0.01" className="w-20 text-right border rounded p-1" {...register(`items.${index}.price_net`, { valueAsNumber: true })} />
                                    </td>
                                    <td className="p-3 text-right">
                                        <input type="number" className="w-16 text-right border rounded p-1" {...register(`items.${index}.quantity`, { valueAsNumber: true })} />
                                    </td>
                                    <td className="p-3 text-right">
                                        <input type="number" className="w-16 text-right border rounded p-1" {...register(`items.${index}.tax_rate`, { valueAsNumber: true })} />
                                    </td>
                                    <td className="p-3 text-right font-bold">{val.toFixed(2)}</td>
                                    <td className="p-3 text-center">
                                        <button type="button" onClick={() => remove(index)} className="text-red-500 hover:bg-red-50 p-1 rounded"><Trash2 size={16}/></button>
                                    </td>
                                </tr>
                            );
                        })}
                        {fields.length === 0 && (
                            <tr><td colSpan={6} className="p-8 text-center text-gray-400 border-dashed border-2 rounded">Dodaj produkty powyżej</td></tr>
                        )}
                    </tbody>
                </table>

                <div className="flex justify-end pt-4 border-t">
                    <div className="text-right w-48">
                        <div className="flex justify-between text-gray-600 mb-1"><span>Netto:</span> <span>{totalNet.toFixed(2)} zł</span></div>
                        <div className="flex justify-between text-gray-600 mb-2"><span>VAT:</span> <span>{totalVat.toFixed(2)} zł</span></div>
                        <div className="flex justify-between text-xl font-bold text-gray-800 pt-2 border-t"><span>Razem:</span> <span>{totalGross.toFixed(2)} zł</span></div>
                    </div>
                </div>
            </div>

            <div className="flex justify-end gap-4">
                <button type="button" onClick={handleCancel} className="px-6 py-2 border rounded hover:bg-gray-50 text-gray-700">Anuluj</button>
                <button type="submit" disabled={isSubmitting} className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded shadow-md disabled:opacity-50 flex items-center gap-2">
                    <Save size={18}/> {isSubmitting ? "Zapisywanie..." : "Wystaw Fakturę"}
                </button>
            </div>
        </form>
      </div>

      {/* PRAWA KOLUMNA: Rekomendacje */}
      <div className="w-80 shrink-0">
        <div className="bg-gradient-to-br from-blue-50 to-white border border-blue-100 p-4 rounded-lg shadow-sm sticky top-6">
            <h3 className="font-semibold text-blue-800 flex items-center gap-2 mb-3">
                <Sparkles size={18} />
                Sugerowane produkty
            </h3>
            
            {loadingRecs ? (
                <div className="text-center py-8 text-blue-400 text-sm animate-pulse">Szukam propozycji...</div>
            ) : recommendations.length > 0 ? (
                <div className="space-y-3">
                    {recommendations.map(rec => (
                        <div key={rec.id} className="bg-white p-3 rounded border border-blue-100 hover:shadow-md transition-shadow group relative">
                            {/* ZMIANA: Usunięto sekcję obrazka */}
                            <div className="text-sm font-medium text-gray-800 leading-tight mb-1">{rec.name}</div>
                            <div className="text-xs text-gray-500 mb-2">{rec.code}</div>
                            <div className="flex justify-between items-center">
                                <span className="font-bold text-gray-700">{rec.sell_price_net.toFixed(2)} zł</span>
                                <button 
                                    type="button" 
                                    onClick={() => handleAddProduct(rec)}
                                    disabled={rec.stock_quantity <= 0}
                                    className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Plus size={12}/> {rec.stock_quantity > 0 ? 'Dodaj' : 'Brak'}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-8 text-gray-400 text-sm italic">
                    {watchedItems.length === 0 
                        ? "Dodaj produkty, aby zobaczyć sugestie." 
                        : "Brak dodatkowych sugestii."}
                </div>
            )}
        </div>
      </div>

    </div>
  );
}