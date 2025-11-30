import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Trash2 } from "lucide-react";
import { useForm, useFieldArray, type SubmitHandler } from "react-hook-form";
import toast from "react-hot-toast"; 

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

type InvoiceFormInputs = {
  buyer_name: string;
  buyer_nip: string;
  buyer_address: string;
  items: InvoiceItem[];
};

export default function CreateInvoice() {
  const navigate = useNavigate();

  // --- ZMIANA 1: Przechowujemy WSZYSTKIE produkty do filtrowania lokalnego ---
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  // --- ZMIANA 2: Pobieramy produkty raz przy załadowaniu (limit 10000) ---
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const res = await api.get<{ items: Product[] }>("/products?page_size=10000");
        const list = res.data.items || [];
        setAllProducts(list);
      } catch (err) {
        console.error("Błąd pobierania produktów:", err);
        toast.error("Nie udało się załadować listy produktów");
      }
    };

    fetchProducts();
  }, []);

  const watchedItems = watch("items");
  const totalNet = watchedItems.reduce((sum, i) => sum + i.price_net * i.quantity, 0);
  const totalVat = watchedItems.reduce(
    (sum, i) => sum + i.price_net * i.quantity * (i.tax_rate / 100),
    0
  );
  const totalGross = totalNet + totalVat;

  // --- ZMIANA 3: Filtrowanie lokalne (Search w React) ---
  // Filtrujemy 'allProducts' na podstawie wpisanego tekstu ORAZ usuwamy te już dodane
  const filteredProducts = allProducts.filter((p) => {
    // 1. Warunek wyszukiwania (nazwa lub kod)
    const matchesSearch = 
      p.name.toLowerCase().includes(search.toLowerCase()) || 
      p.code.toLowerCase().includes(search.toLowerCase());
    
    // 2. Warunek: nie ma go jeszcze na liście
    const notAdded = !watchedItems.some((item) => item.product_id === p.id);

    return matchesSearch && notAdded;
  });

  const handleAddProduct = (product: Product) => {
    append({
      product_id: product.id,
      name: product.name,
      quantity: 1,
      price_net: product.sell_price_net,
      tax_rate: product.tax_rate ?? 23,
    });
    setSearch(""); // Czyścimy pole wyszukiwania
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
      toast.error("Błąd przy tworzeniu faktury. Spróbuj ponownie.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (watchedItems.length > 0 || watch("buyer_name")) {
      if (confirm("Czy na pewno chcesz anulować? Wprowadzone zmiany zostaną utracone.")) {
        navigate("/invoices");
      }
    } else {
      navigate("/invoices");
    }
  };

  return (
    <form className="p-6" onSubmit={handleSubmit(onSubmit)}>
      <h1 className="text-2xl font-semibold mb-4">Nowa faktura</h1>

      <div className="grid gap-4 max-w-2xl mb-6">
        <div>
          <input
            className={`border rounded p-2 w-full ${errors.buyer_name ? 'border-red-500' : ''}`}
            placeholder="Nazwa nabywcy *"
            {...register("buyer_name", {
              required: "Nazwa nabywcy jest wymagana",
            })}
          />
          {errors.buyer_name && (
            <p className="text-red-500 text-sm mt-1">{errors.buyer_name.message}</p>
          )}
        </div>
        <input
          className="border rounded p-2 w-full"
          placeholder="NIP nabywcy (opcjonalnie)"
          {...register("buyer_nip")}
        />
        <input
          className="border rounded p-2 w-full"
          placeholder="Adres nabywcy"
          {...register("buyer_address")}
        />
      </div>

      <h2 className="text-lg font-semibold mt-6 mb-2">Produkty</h2>

      {/* --- AUTOCOMPLETE --- */}
      <div className="relative mb-4 max-w-md">
        <input
          ref={inputRef}
          className="border rounded p-2 w-full"
          placeholder="Wpisz min. 2 znaki nazwy lub kodu..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
        />
        {focused && search.length >= 2 && (
          <ul className="absolute z-10 bg-white border rounded mt-1 shadow max-h-60 overflow-auto w-full">
            {filteredProducts.length > 0 ? (
              filteredProducts.slice(0, 50).map((p) => ( // Limit wyświetlania w drop-downie dla wydajności
                <li
                  key={p.id}
                  onMouseDown={() => handleAddProduct(p)}
                  className="px-3 py-2 hover:bg-gray-100 cursor-pointer flex justify-between items-center border-b last:border-none"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-gray-500 text-xs">Kod: {p.code}</span>
                  </div>
                  <div className="text-right">
                     <span className="text-gray-800 font-semibold text-sm">
                        {p.sell_price_net.toFixed(2)} zł
                     </span>
                     <div className="text-xs text-gray-400">Stan: {p.stock_quantity}</div>
                  </div>
                </li>
              ))
            ) : (
              <li className="px-3 py-2 text-gray-500">Brak pasujących produktów</li>
            )}
          </ul>
        )}
        {focused && search && search.length < 2 && (
             <div className="absolute z-10 bg-white border rounded mt-1 shadow w-full px-3 py-2 text-gray-400 text-sm">
                 Wpisz więcej znaków...
             </div>
        )}
      </div>

      {/* --- TABELA POZYCJI --- */}
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
          {fields.map((item, index) => {
            const price = watch(`items.${index}.price_net`);
            const qty = watch(`items.${index}.quantity`);
            const tax = watch(`items.${index}.tax_rate`);
            const rowGross = (price * qty * (1 + tax / 100)) || 0;

            return (
              <tr key={item.keyId}>
                <td className="p-2 border">{item.name}</td>
                <td className="p-2 border text-right">
                  <input
                    type="number"
                    className="border rounded p-1 w-24 text-right"
                    min={0}
                    step={0.01}
                    {...register(`items.${index}.price_net`, {
                      valueAsNumber: true,
                      min: { value: 0.01, message: "Cena > 0" },
                    })}
                  />
                </td>
                <td className="p-2 border text-right">
                  <input
                    type="number"
                    className="border rounded p-1 w-20 text-right"
                    min={1}
                    step={1}
                    {...register(`items.${index}.quantity`, {
                      valueAsNumber: true,
                      min: { value: 1, message: "Ilość > 0" },
                    })}
                  />
                </td>
                <td className="p-2 border text-right">
                  <input
                    type="number"
                    className="border rounded p-1 w-20 text-right"
                    min={0}
                    step={1}
                    {...register(`items.${index}.tax_rate`, {
                      valueAsNumber: true,
                      min: { value: 0, message: "VAT >= 0" },
                    })}
                  />
                </td>
                <td className="p-2 border text-right">{rowGross.toFixed(2)}</td>
                <td className="p-2 border text-center">
                  <button
                    type="button"
                    className="text-red-500 hover:text-red-700"
                    onClick={() => remove(index)}
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            );
          })}
          {fields.length === 0 && (
            <tr>
              <td colSpan={6} className="text-center text-gray-500 p-3">
                Brak pozycji. Wyszukaj i dodaj produkt powyżej.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* --- PODSUMOWANIE --- */}
      <div className="text-right mb-6 max-w-xs ml-auto p-4 bg-gray-50 rounded">
        <p>Suma netto: <strong>{totalNet.toFixed(2)} zł</strong></p>
        <p>VAT: <strong>{totalVat.toFixed(2)} zł</strong></p>
        <hr className="my-1" />
        <p className="text-lg">Suma brutto: <strong>{totalGross.toFixed(2)} zł</strong></p>
      </div>

      {/* --- PRZYCISKI --- */}
      <div className="flex gap-3">
        {/* Zmieniony kolor przycisku na zielony */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
        >
          {isSubmitting ? "Zapisywanie..." : "Utwórz fakturę"}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          className="px-4 py-2 border rounded hover:bg-gray-100"
        >
          Anuluj
        </button>
      </div>
    </form>
  );
}