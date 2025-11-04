import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

type Product = {
  id: number;
  name: string;
  code: string;
  sell_price_net: number;
  tax_rate: number;
  stock_quantity: number;
};

type InvoiceItem = {
  product_id: number;
  name: string;
  quantity: number;
  price_net: number;
  tax_rate: number;
};

export default function CreateInvoice() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [buyerName, setBuyerName] = useState("");
  const [buyerNip, setBuyerNip] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [focused, setFocused] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // --- SUMY ---
  const totalNet = items.reduce((sum, i) => sum + i.price_net * i.quantity, 0);
  const totalVat = items.reduce(
    (sum, i) => sum + i.price_net * i.quantity * (i.tax_rate / 100),
    0
  );
  const totalGross = totalNet + totalVat;

  // --- POBIERANIE PRODUKTÓW ---
  useEffect(() => {
    const loadProducts = async () => {
      try {
        const res = await api.get("/products");
        const data = res.data;
        const list = Array.isArray(data) ? data : data.items || [];
        setProducts(list);
      } catch (err) {
        console.error(err);
        setError("Nie udało się pobrać listy produktów");
        setProducts([]);
      }
    };
    loadProducts();
  }, []);

  // --- FILTR PRODUKTÓW ---
  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.code.toLowerCase().includes(search.toLowerCase())
  );

  // --- FUNKCJE ---
  const addItem = (product: Product) => {
    if (items.find((i) => i.product_id === product.id)) return;
    setItems((prev) => [
      ...prev,
      {
        product_id: product.id,
        name: product.name,
        quantity: 1,
        price_net: product.sell_price_net,
        tax_rate: product.tax_rate,
      },
    ]);
    setSearch("");
    setFocused(false);
    inputRef.current?.blur();
  };

  const updateItem = (id: number, field: keyof InvoiceItem, value: number) => {
    setItems((prev) =>
      prev.map((i) =>
        i.product_id === id ? { ...i, [field]: value } : i
      )
    );
  };

  const removeItem = (id: number) => {
    setItems((prev) => prev.filter((i) => i.product_id !== id));
  };

  const handleSubmit = async () => {
    if (!buyerName.trim()) {
      alert("Podaj nazwę nabywcy");
      return;
    }
    if (items.length === 0) {
      alert("Dodaj przynajmniej jeden produkt");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload = {
        buyer_name: buyerName,
        buyer_nip: buyerNip,
        buyer_address: buyerAddress,
        items: items.map((i) => ({
          product_id: i.product_id,
          quantity: i.quantity,
          price_net: i.price_net,
          tax_rate: i.tax_rate,
        })),
      };
      await api.post("/invoices", payload);
      alert(" Faktura została utworzona");
      navigate("/invoices");
    } catch (err) {
      console.error(err);
      setError("Błąd przy tworzeniu faktury");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (confirm("Czy na pewno chcesz anulować?")) {
      navigate("/invoices");
    }
  };

  // --- RENDER ---
  return (
    <div className="p-6 relative">
      <h1 className="text-2xl font-semibold mb-4">Nowa faktura</h1>

      {error && <p className="text-red-500 mb-3">{error}</p>}

      <div className="grid gap-4 max-w-2xl">
        <input
          className="border rounded p-2"
          placeholder="Nazwa nabywcy"
          value={buyerName}
          onChange={(e) => setBuyerName(e.target.value)}
        />
        <input
          className="border rounded p-2"
          placeholder="NIP nabywcy (opcjonalnie)"
          value={buyerNip}
          onChange={(e) => setBuyerNip(e.target.value)}
        />
        <input
          className="border rounded p-2"
          placeholder="Adres nabywcy"
          value={buyerAddress}
          onChange={(e) => setBuyerAddress(e.target.value)}
        />
      </div>

      <h2 className="text-lg font-semibold mt-6 mb-2">Produkty</h2>

      {/* Autocomplete – jedno pole */}
      <div className="relative mb-4 max-w-md">
        <input
          ref={inputRef}
          className="border rounded p-2 w-full"
          placeholder="Wpisz nazwę lub kod produktu..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
        />
        {focused && search && filteredProducts.length > 0 && (
          <ul className="absolute z-10 bg-white border rounded mt-1 shadow max-h-60 overflow-auto w-full">
            {filteredProducts.slice(0, 10).map((p) => (
              <li
                key={p.id}
                onMouseDown={() => addItem(p)}
                className="px-3 py-2 hover:bg-gray-100 cursor-pointer flex justify-between"
              >
                <span>
                  {p.name} <span className="text-gray-500">({p.code})</span>
                </span>
                <span className="text-gray-600 text-sm">
                  {p.sell_price_net.toFixed(2)} zł
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <table className="min-w-full border bg-white text-sm mb-4">
        <thead className="bg-gray-100">
          <tr>
            <th className="p-2 border text-left">Produkt</th>
            <th className="p-2 border text-right">Cena netto</th>
            <th className="p-2 border text-right">Ilość</th>
            <th className="p-2 border text-right">VAT %</th>
            <th className="p-2 border text-right">Wartość brutto</th>
            <th className="p-2 border text-center">Usuń</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.product_id}>
              <td className="p-2 border">{i.name}</td>
              <td className="p-2 border text-right">
                <input
                  type="number"
                  className="border rounded p-1 w-20 text-right"
                  value={i.price_net}
                  min={0}
                  step={0.01}
                  onChange={(e) =>
                    updateItem(i.product_id, "price_net", Number(e.target.value))
                  }
                />
              </td>
              <td className="p-2 border text-right">
                <input
                  type="number"
                  className="border rounded p-1 w-20 text-right"
                  value={i.quantity}
                  min={1}
                  onChange={(e) =>
                    updateItem(i.product_id, "quantity", Number(e.target.value))
                  }
                />
              </td>
              <td className="p-2 border text-right">
                <input
                  type="number"
                  className="border rounded p-1 w-20 text-right"
                  value={i.tax_rate}
                  min={0}
                  step={0.1}
                  onChange={(e) =>
                    updateItem(i.product_id, "tax_rate", Number(e.target.value))
                  }
                />
              </td>
              <td className="p-2 border text-right">
                {(i.price_net * i.quantity * (1 + i.tax_rate / 100)).toFixed(2)}
              </td>
              <td className="p-2 border text-center">
                <button
                  className="text-red-500"
                  onClick={() => removeItem(i.product_id)}
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={6} className="text-center text-gray-500 p-3">
                Brak pozycji
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="text-right mb-6">
        <p>Suma netto: <strong>{totalNet.toFixed(2)} zł</strong></p>
        <p>VAT: <strong>{totalVat.toFixed(2)} zł</strong></p>
        <p>Suma brutto: <strong>{totalGross.toFixed(2)} zł</strong></p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 disabled:opacity-50"
        >
          {loading ? "Zapisywanie..." : "Utwórz fakturę"}
        </button>
        <button
          onClick={handleCancel}
          className="px-4 py-2 border rounded hover:bg-gray-100"
        >
          Anuluj
        </button>
      </div>
    </div>
  );
}
