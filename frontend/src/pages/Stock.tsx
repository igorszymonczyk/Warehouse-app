import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Search, PackageMinus, PackagePlus, X, AlertTriangle, Trash2 } from "lucide-react"; // Usunięto History
import toast from "react-hot-toast";
import { useForm, type SubmitHandler } from "react-hook-form";

// Typy
type StockMovement = {
  id: number;
  created_at: string;
  product_name: string;
  product_code: string;
  qty: number;
  reason: string;
  user_email: string;
  type: string;
  supplier?: string;
};

type PaginatedStock = {
  items: StockMovement[];
  total: number;
  page: number;
  page_size: number;
};

type ProductSimple = {
  id: number;
  name: string;
  code: string;
  stock_quantity: number;
};

type AdjustmentForm = {
  product_id: number;
  quantity: number;
  reason: string;
};

type DeliveryItem = {
    product: ProductSimple;
    quantity: number;
};

export default function StockPage() {
  const [data, setData] = useState<PaginatedStock | null>(null);
  const [loading, setLoading] = useState(false);
  
  const [showLossModal, setShowLossModal] = useState(false);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [supplierFilter, setSupplierFilter] = useState(""); 
  const pageSize = 10;

  const [allProducts, setAllProducts] = useState<ProductSimple[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [foundProducts, setFoundProducts] = useState<ProductSimple[]>([]); 
  const [selectedProduct, setSelectedProduct] = useState<ProductSimple | null>(null);

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<AdjustmentForm>();

  const [deliveryItems, setDeliveryItems] = useState<DeliveryItem[]>([]);
  const [deliveryQty, setDeliveryQty] = useState(1);
  const [deliverySupplier, setDeliverySupplier] = useState("");

  const loadMovements = async () => {
    setLoading(true);
    try {
      const res = await api.get<PaginatedStock>("/stock", {
        params: {
          page, page_size: pageSize, q: q || undefined, 
          type: type || undefined, 
          supplier: supplierFilter || undefined, 
          sort_by: "created_at", order: "desc"
        }
      });
      setData(res.data);
    } catch (err) {
      console.error(err);
      toast.error("Błąd pobierania historii");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchAllProducts = async () => {
        try {
            const res = await api.get<{ items: ProductSimple[] }>("/products?page_size=10000");
            setAllProducts(res.data.items || []);
        } catch (err) { console.error("Błąd ładowania produktów", err); }
    };
    fetchAllProducts();
  }, []);

  useEffect(() => { loadMovements(); }, [page, q, type, supplierFilter]);

  const filteredProducts = allProducts.filter(p => {
      if (!productSearch) return false;
      const term = productSearch.toLowerCase();
      return p.name.toLowerCase().includes(term) || p.code.toLowerCase().includes(term);
  });

  const selectProductForLoss = (p: ProductSimple) => {
      setSelectedProduct(p);
      setValue("product_id", p.id);
      setProductSearch("");
  };

  const onSubmitLoss: SubmitHandler<AdjustmentForm> = async (formData) => {
      if (!selectedProduct) return;
      if (formData.quantity > selectedProduct.stock_quantity) {
          toast.error("Zbyt duża ilość (brak na stanie)");
          return;
      }
      try {
          await api.post("/stock/adjust", {
              product_id: formData.product_id,
              quantity_change: -Math.abs(formData.quantity),
              reason: formData.reason,
              type: "LOSS"
          });
          toast.success("Strata zapisana");
          setShowLossModal(false);
          reset();
          setSelectedProduct(null);
          loadMovements();
      } catch { toast.error("Błąd zapisu"); }
  };

  const addToDeliveryList = (p: ProductSimple) => {
      if (deliveryItems.find(i => i.product.id === p.id)) {
          toast.error("Ten produkt jest już na liście");
          setProductSearch("");
          return;
      }
      if (deliveryQty <= 0) { toast.error("Ilość musi być > 0"); return; }

      setDeliveryItems([...deliveryItems, { product: p, quantity: deliveryQty }]);
      setProductSearch("");
      setDeliveryQty(1);
  };

  const removeFromDeliveryList = (idx: number) => {
      const copy = [...deliveryItems];
      copy.splice(idx, 1);
      setDeliveryItems(copy);
  };

  const submitDelivery = async () => {
      if (deliveryItems.length === 0) return;
      try {
          const payload = {
              items: deliveryItems.map(i => ({ product_id: i.product.id, quantity: i.quantity })),
              reason: "Dostawa towaru",
              supplier: deliverySupplier || null
          };
          await api.post("/stock/delivery", payload);
          toast.success("Dostawa przyjęta pomyślnie!");
          setShowDeliveryModal(false);
          setDeliveryItems([]);
          setDeliverySupplier("");
          loadMovements();
      } catch (err) {
          console.error(err);
          toast.error("Błąd podczas zapisywania dostawy");
      }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">
             Ruchy Magazynowe
        </h1>
        <div className="flex gap-3">
            <button 
                onClick={() => setShowDeliveryModal(true)}
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 flex items-center gap-2 shadow-sm"
            >
                <PackagePlus size={20} /> Przyjęcie dostawy
            </button>
            <button 
                onClick={() => setShowLossModal(true)}
                className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 flex items-center gap-2 shadow-sm"
            >
                <PackageMinus size={20} /> Zgłoś stratę
            </button>
        </div>
      </div>

      {/* FILTRY */}
      <div className="flex gap-4 mb-4 bg-white p-4 rounded shadow-sm border flex-wrap">
          <div className="relative">
              <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
              <input 
                  className="pl-10 border rounded p-2 w-64 focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Szukaj produktu..."
                  value={q}
                  onChange={e => setQ(e.target.value)}
              />
          </div>
          <div className="relative">
              <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
              <input 
                  className="pl-10 border rounded p-2 w-64 focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Szukaj dostawcy..."
                  value={supplierFilter}
                  onChange={e => setSupplierFilter(e.target.value)}
              />
          </div>
          <select 
            className="border rounded p-2"
            value={type}
            onChange={e => setType(e.target.value)}
          >
              <option value="">Wszystkie typy</option>
              <option value="IN">Dostawa (IN)</option>
              <option value="LOSS">Strata/Uszkodzenie (LOSS)</option>
          </select>
      </div>

      {/* TABELA */}
      {loading ? <p>Ładowanie...</p> : (
          <div className="bg-white rounded border shadow-sm overflow-hidden">
              <table className="min-w-full text-sm">
                  <thead className="bg-gray-100 text-gray-700">
                      <tr>
                          <th className="p-3 text-left">Data</th>
                          <th className="p-3 text-left">Produkt</th>
                          <th className="p-3 text-right">Ilość</th>
                          <th className="p-3 text-left pl-8">Dostawca</th>
                          <th className="p-3 text-left">Powód / Typ</th>
                          <th className="p-3 text-left">Użytkownik</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y">
                      {data?.items.map((move) => (
                          <tr key={move.id} className="hover:bg-gray-50">
                              <td className="p-3 text-gray-600">
                                  {new Date(move.created_at).toLocaleString("pl-PL")}
                              </td>
                              <td className="p-3">
                                  <div className="font-medium text-gray-900">{move.product_name}</div>
                                  <div className="text-xs text-gray-500">{move.product_code}</div>
                              </td>
                              
                              <td className="p-3 text-right">
                                   <span className={`font-bold px-2 py-0.5 rounded ${move.qty > 0 ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}`}>
                                      {move.qty > 0 ? "+" : ""}{move.qty} szt.
                                   </span>
                              </td>
                              
                              <td className="p-3 pl-8 text-gray-800 font-medium">
                                  {move.supplier || "-"}
                              </td>
                              <td className="p-3 text-gray-800">
                                  <div>{move.reason || "-"}</div>
                                  <div className="text-xs text-gray-500 uppercase tracking-wider">{move.type}</div>
                              </td>
                              <td className="p-3 text-gray-600">{move.user_email}</td>
                          </tr>
                      ))}
                      {data?.items.length === 0 && (
                          <tr><td colSpan={6} className="p-6 text-center text-gray-500">Brak historii ruchów.</td></tr>
                      )}
                  </tbody>
              </table>
          </div>
      )}

      {/* Paginacja */}
      {data && (
          <div className="mt-4 flex justify-center gap-4 items-center">
              <button disabled={page===1} onClick={() => setPage(p=>p-1)} className="px-3 py-1 border rounded disabled:opacity-50">Poprzednia</button>
              <span className="text-sm">Strona {page} z {Math.ceil(data.total / pageSize)}</span>
              <button disabled={page >= Math.ceil(data.total/pageSize)} onClick={() => setPage(p=>p+1)} className="px-3 py-1 border rounded disabled:opacity-50">Następna</button>
          </div>
      )}

      {/* MODAL - PRZYJĘCIE DOSTAWY */}
      {showDeliveryModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-lg shadow-xl w-full max-w-lg h-[80vh] flex flex-col">
                  <div className="flex justify-between items-center p-4 border-b bg-green-50">
                      <h3 className="font-bold text-green-800 flex items-center gap-2">
                          <PackagePlus size={20} /> Przyjęcie dostawy
                      </h3>
                      <button onClick={() => setShowDeliveryModal(false)}><X size={20} className="text-gray-500 hover:text-black"/></button>
                  </div>
                  
                  <div className="p-4 bg-gray-50 border-b">
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Dostawca (Opcjonalnie)</label>
                      <input 
                          className="w-full border rounded p-2 focus:ring-2 focus:ring-green-500 outline-none bg-white"
                          placeholder="Np. Hurtownia ABC..."
                          value={deliverySupplier}
                          onChange={e => setDeliverySupplier(e.target.value)}
                      />
                  </div>
                  
                  <div className="p-4 border-b bg-gray-50 flex gap-2 items-end pt-0">
                      <div className="flex-1 relative">
                          <label className="text-xs font-semibold text-gray-500">Produkt</label>
                          <input 
                              className="w-full border rounded p-2 focus:ring-2 focus:ring-green-500 outline-none"
                              placeholder="Wpisz nazwę/kod..."
                              value={productSearch}
                              onChange={e => setProductSearch(e.target.value)}
                          />
                          {productSearch.length > 0 && (
                              <ul className="absolute z-10 w-full bg-white border rounded mt-1 shadow-lg max-h-40 overflow-y-auto">
                                  {filteredProducts.slice(0, 20).map(p => (
                                      <li key={p.id} onClick={() => addToDeliveryList(p)} className="p-2 hover:bg-green-50 cursor-pointer border-b last:border-none text-sm">
                                          <div className="font-medium">{p.name}</div>
                                          <div className="text-xs text-gray-500 flex justify-between">
                                              <span>{p.code}</span>
                                              <span>Obecnie: {p.stock_quantity}</span>
                                          </div>
                                      </li>
                                  ))}
                                  {filteredProducts.length === 0 && (
                                      <li className="p-2 text-gray-400 text-center text-xs">Brak wyników</li>
                                  )}
                              </ul>
                          )}
                      </div>
                      <div className="w-24">
                          <label className="text-xs font-semibold text-gray-500">Ilość</label>
                          <input 
                              type="number" min="1"
                              className="w-full border rounded p-2 text-right"
                              value={deliveryQty}
                              onChange={e => setDeliveryQty(parseInt(e.target.value) || 1)}
                          />
                      </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4">
                      {deliveryItems.length === 0 ? (
                          <div className="text-center text-gray-400 mt-10">
                              Wyszukaj produkt i dodaj go do listy przyjęcia.
                          </div>
                      ) : (
                          <table className="w-full text-sm">
                              <thead className="text-gray-500 border-b">
                                  <tr>
                                      <th className="text-left py-2">Produkt</th>
                                      <th className="text-right py-2">Ilość</th>
                                      <th className="w-10"></th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y">
                                  {deliveryItems.map((item, idx) => (
                                      <tr key={idx}>
                                          <td className="py-2">
                                              <div className="font-medium">{item.product.name}</div>
                                              <div className="text-xs text-gray-400">{item.product.code}</div>
                                          </td>
                                          <td className="py-2 text-right font-bold text-green-700">
                                              +{item.quantity}
                                          </td>
                                          <td className="py-2 text-center">
                                              <button onClick={() => removeFromDeliveryList(idx)} className="text-red-500 hover:bg-red-50 p-1 rounded">
                                                  <Trash2 size={16} />
                                              </button>
                                          </td>
                                      </tr>
                                  ))}
                              </tbody>
                          </table>
                      )}
                  </div>

                  <div className="p-4 border-t flex justify-end">
                      <button 
                          onClick={submitDelivery}
                          disabled={deliveryItems.length === 0}
                          className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700 disabled:opacity-50 font-medium"
                      >
                          Zatwierdź dostawę ({deliveryItems.length} poz.)
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* MODAL - STRATA */}
      {showLossModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                  <div className="flex justify-between items-center p-4 border-b bg-red-50">
                      <h3 className="font-bold text-red-800 flex items-center gap-2"><AlertTriangle size={20}/> Zgłoś stratę</h3>
                      <button onClick={() => setShowLossModal(false)}><X size={20}/></button>
                  </div>
                  <form onSubmit={handleSubmit(onSubmitLoss)} className="p-6 space-y-4">
                      <div>
                          <label className="block text-sm font-medium mb-1">Produkt</label>
                          {selectedProduct ? (
                              <div className="p-2 border rounded bg-gray-50 flex justify-between items-center">
                                  <span className="text-sm font-medium truncate w-48">{selectedProduct.name}</span>
                                  <button type="button" onClick={() => setSelectedProduct(null)} className="text-xs text-red-500 underline">Zmień</button>
                              </div>
                          ) : (
                              <div className="relative">
                                  <input 
                                      className="w-full border rounded p-2 focus:ring-2 focus:ring-red-500 outline-none"
                                      placeholder="Szukaj..."
                                      value={productSearch}
                                      onChange={e => setProductSearch(e.target.value)}
                                      autoFocus
                                  />
                                  {productSearch.length > 0 && (
                                      <ul className="absolute z-10 w-full bg-white border rounded mt-1 shadow-lg max-h-40 overflow-y-auto">
                                          {filteredProducts.slice(0, 10).map(p => (
                                              <li key={p.id} onClick={() => selectProductForLoss(p)} className="p-2 hover:bg-gray-100 cursor-pointer border-b text-sm">
                                                  <div className="font-medium">{p.name}</div>
                                                  <div className="text-xs text-gray-500 flex justify-between">
                                                      <span>{p.code}</span>
                                                      <span>Stan: {p.stock_quantity}</span>
                                                  </div>
                                              </li>
                                          ))}
                                      </ul>
                                  )}
                              </div>
                          )}
                      </div>
                      <div>
                          <label className="block text-sm font-medium mb-1">Ilość (strata)</label>
                          <input type="number" min="1" className="w-full border rounded p-2" {...register("quantity", {required: true, min: 1})} />
                      </div>
                      <div>
                          <label className="block text-sm font-medium mb-1">Powód</label>
                          <textarea className="w-full border rounded p-2" {...register("reason", {required: true})} />
                      </div>
                      <button className="w-full bg-red-600 text-white py-2 rounded">Zatwierdź</button>
                  </form>
              </div>
          </div>
      )}
    </div>
  );
}