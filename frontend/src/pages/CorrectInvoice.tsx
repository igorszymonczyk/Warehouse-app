import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { Trash2, Plus, ArrowLeft, Save } from "lucide-react";
import toast from "react-hot-toast";

interface Product {
  id: number;
  name: string;
  sell_price_net: number;
  tax_rate: number;
  stock_quantity: number;
  code: string;
}

interface InvoiceItemRow {
  product_id: number;
  product_name: string;
  quantity: number;
  price_net: number; // Teraz edytowalne
  tax_rate: number;  // Teraz edytowalne
  current_stock?: number; 
}

export default function CorrectInvoicePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  
  const [buyerName, setBuyerName] = useState("");
  const [buyerNip, setBuyerNip] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  
  const [items, setItems] = useState<InvoiceItemRow[]>([]);
  const [availableProducts, setAvailableProducts] = useState<Product[]>([]);
  const [selectedProductToAdd, setSelectedProductToAdd] = useState<string>("");

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const prodRes = await api.get<{ items: Product[] }>("/products?page_size=10000"); // Zwiększony limit
      setAvailableProducts(prodRes.data.items);

      const invRes = await api.get(`/invoices/${id}`);
      const inv = invRes.data;

      setBuyerName(inv.buyer_name);
      setBuyerNip(inv.buyer_nip || "");
      setBuyerAddress(inv.buyer_address || "");
      
      const mappedItems = inv.items.map((it: any) => ({
        product_id: it.product_id,
        product_name: it.product_name,
        quantity: it.quantity,
        price_net: it.price_net,
        tax_rate: it.tax_rate,
        current_stock: 999 
      }));
      setItems(mappedItems);
      
      setLoading(false);
    } catch (err) {
      console.error(err);
      toast.error("Błąd ładowania danych faktury");
      navigate("/invoices");
    }
  };

  const handleAddItem = () => {
    if (!selectedProductToAdd) return;
    const prodId = parseInt(selectedProductToAdd);
    const prod = availableProducts.find((p) => p.id === prodId);
    if (!prod) return;

    if (items.find((i) => i.product_id === prod.id)) {
      toast.error("Produkt już jest na liście");
      return;
    }

    setItems([
      ...items,
      {
        product_id: prod.id,
        product_name: prod.name,
        quantity: 1,
        price_net: prod.sell_price_net,
        tax_rate: prod.tax_rate,
        current_stock: prod.stock_quantity
      },
    ]);
    setSelectedProductToAdd("");
  };

  const handleRemoveItem = (index: number) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    setItems(newItems);
  };

  // Uniwersalna funkcja zmiany pól w wierszu (ilość, cena, vat)
  const handleItemChange = (index: number, field: keyof InvoiceItemRow, value: number) => {
    const newItems = [...items];
    // Walidacja ujemnych wartości
    if (value < 0) value = 0;
    
    // @ts-ignore - prosty update pola
    newItems[index][field] = value;
    setItems(newItems);
  };

  const handleSubmit = async () => {
    if (!buyerName) return toast.error("Nazwa nabywcy jest wymagana");
    if (items.length === 0) return toast.error("Lista pozycji nie może być pusta");
    if (!correctionReason) return toast.error("Podaj przyczynę korekty");

    const payload = {
      buyer_name: buyerName,
      buyer_nip: buyerNip,
      buyer_address: buyerAddress,
      correction_reason: correctionReason,
      items: items.map((i) => ({
        product_id: i.product_id,
        quantity: i.quantity,
        price_net: i.price_net,
        tax_rate: i.tax_rate
      })),
    };

    try {
      await api.post(`/invoices/${id}/correction`, payload);
      toast.success("Korekta wystawiona pomyślnie");
      navigate("/invoices");
    } catch (err) {
      console.error(err);
      toast.error("Błąd podczas wystawiania korekty");
    }
  };

  const totalGross = items.reduce((sum, i) => {
    const grossItem = i.quantity * i.price_net * (1 + i.tax_rate / 100);
    return sum + grossItem;
  }, 0);

  if (loading) return <div className="p-6">Ładowanie...</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <button onClick={() => navigate("/invoices")} className="flex items-center text-gray-600 mb-4 hover:text-black">
        <ArrowLeft size={18} className="mr-1" /> Powrót
      </button>

      <div className="bg-yellow-50 border border-yellow-200 p-4 rounded mb-6">
        <h1 className="text-2xl font-bold text-yellow-800">Wystawianie Korekty</h1>
        <p className="text-sm text-yellow-700">Możesz edytować nabywcę, ilości, ceny oraz stawki VAT.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white p-4 rounded shadow-sm border">
          <h2 className="font-semibold mb-4 border-b pb-2">Dane Nabywcy (Edycja)</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Nazwa nabywcy *</label>
              <input className="w-full border p-2 rounded" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">NIP</label>
              <input className="w-full border p-2 rounded" value={buyerNip} onChange={(e) => setBuyerNip(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Adres</label>
              <input className="w-full border p-2 rounded" value={buyerAddress} onChange={(e) => setBuyerAddress(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded shadow-sm border">
          <h2 className="font-semibold mb-4 border-b pb-2">Szczegóły Korekty</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Przyczyna korekty *</label>
            <textarea
              className="w-full border p-2 rounded h-32 focus:ring-2 focus:ring-yellow-500 outline-none"
              placeholder="np. Zwrot towaru, Zmiana ceny, Błąd..."
              value={correctionReason}
              onChange={(e) => setCorrectionReason(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="bg-white p-4 rounded shadow-sm border mb-6">
        <h2 className="font-semibold mb-4 border-b pb-2">Pozycje faktury (Stan PO korekcie)</h2>
        
        <div className="flex gap-2 mb-4">
          <select
            className="border p-2 rounded flex-1"
            value={selectedProductToAdd}
            onChange={(e) => setSelectedProductToAdd(e.target.value)}
          >
            <option value="">-- Dodaj produkt do listy (opcjonalnie) --</option>
            {availableProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} - {p.sell_price_net} zł
              </option>
            ))}
          </select>
          <button onClick={handleAddItem} className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded flex items-center gap-1">
            <Plus size={16} /> Dodaj
          </button>
        </div>

        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 text-left">Produkt</th>
              <th className="p-2 text-right w-32">Cena Netto</th>
              <th className="p-2 text-right w-24">VAT %</th>
              <th className="p-2 text-right w-24">Ilość</th>
              <th className="p-2 text-right">Wartość Brutto</th>
              <th className="p-2 text-center w-16">Usuń</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((item, idx) => {
              const itemGross = item.quantity * item.price_net * (1 + item.tax_rate / 100);
              return (
                <tr key={idx}>
                  <td className="p-2">{item.product_name}</td>
                  
                  {/* Edycja Ceny Netto */}
                  <td className="p-2 text-right">
                    <input
                      type="number" step="0.01" min="0"
                      className="border rounded w-28 text-right p-1 focus:ring-1 focus:ring-blue-500 outline-none"
                      value={item.price_net}
                      onChange={(e) => handleItemChange(idx, 'price_net', parseFloat(e.target.value) || 0)}
                    />
                  </td>

                  {/* Edycja VAT */}
                  <td className="p-2 text-right">
                    <input
                      type="number" step="1" min="0" max="100"
                      className="border rounded w-20 text-right p-1 focus:ring-1 focus:ring-blue-500 outline-none"
                      value={item.tax_rate}
                      onChange={(e) => handleItemChange(idx, 'tax_rate', parseFloat(e.target.value) || 0)}
                    />
                  </td>

                  {/* Edycja Ilości */}
                  <td className="p-2 text-right">
                    <input
                      type="number" min="1"
                      className="border rounded w-20 text-right p-1 focus:ring-1 focus:ring-blue-500 outline-none"
                      value={item.quantity}
                      onChange={(e) => handleItemChange(idx, 'quantity', parseFloat(e.target.value) || 0)}
                    />
                  </td>

                  <td className="p-2 text-right font-medium">{itemGross.toFixed(2)}</td>
                  <td className="p-2 text-center">
                    <button onClick={() => handleRemoveItem(idx)} className="text-red-500 hover:text-red-700">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        
        <div className="mt-4 text-right text-lg font-bold">
          Razem Brutto (PO korekcie): {totalGross.toFixed(2)} PLN
        </div>
      </div>

      <div className="text-right">
        <button
          onClick={handleSubmit}
          className="bg-blue-600 text-white px-6 py-3 rounded hover:bg-blue-700 flex items-center gap-2 ml-auto shadow"
        >
          <Save size={20} />
          Zatwierdź Korektę
        </button>
      </div>
    </div>
  );
}