// src/pages/CreateInvoice.tsx

import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Trash2 } from "lucide-react";
import { useForm, useFieldArray, type SubmitHandler } from "react-hook-form";
import toast from "react-hot-toast"; // 1. Zaimportuj toast

// Definicja typu produktu (zostaje bez zmian)
type Product = {
  id: number;
  name: string;
  code: string;
  sell_price_net: number;
  tax_rate: number;
  stock_quantity: number;
};

// Definicja typu pozycji faktury
type InvoiceItem = {
  product_id: number;
  name: string;
  quantity: number;
  price_net: number;
  tax_rate: number;
};

// Definicja typów dla react-hook-form
type InvoiceFormInputs = {
  buyer_name: string;
  buyer_nip: string;
  buyer_address: string;
  items: InvoiceItem[];
};

export default function CreateInvoice() {
  const navigate = useNavigate();

  // --- Stany, które zostają ---
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 2. Usuwamy stan `submitError` - toasty zajmą się błędami
  // const [submitError, setSubmitError] = useState<string | null>(null);

  // --- SETUP REACT-HOOK-FORM ---
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

  // --- SETUP USEFIELDARRAY ---
  const { fields, append, remove } = useFieldArray({
    control,
    name: "items",
    keyName: "keyId",
  });

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
        toast.error("Nie udało się pobrać listy produktów"); // Możemy też tutaj!
        setProducts([]);
      }
    };
    loadProducts();
  }, []);

  // --- UŻYCIE 'WATCH' DO PRZELICZANIA SUM ---
  const watchedItems = watch("items");
  const totalNet = watchedItems.reduce((sum, i) => sum + i.price_net * i.quantity, 0);
  const totalVat = watchedItems.reduce(
    (sum, i) => sum + i.price_net * i.quantity * (i.tax_rate / 100),
    0
  );
  const totalGross = totalNet + totalVat;

  // --- FILTR PRODUKTÓW ---
  const filteredProducts = products.filter(
    (p) =>
      (p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.code.toLowerCase().includes(search.toLowerCase())) &&
      !watchedItems.some((item) => item.product_id === p.id)
  );

  // --- NOWA FUNKCJA DODAWANIA POZYCJI ---
  const handleAddProduct = (product: Product) => {
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

  // --- 3. ZAKTUALIZOWANA FUNKCJA SUBMIT ---
  const onSubmit: SubmitHandler<InvoiceFormInputs> = async (data) => {
    if (data.items.length === 0) {
      toast.error("Dodaj przynajmniej jeden produkt do faktury.");
      return;
    }

    setIsSubmitting(true);
    
    try {
      await api.post("/invoices", data);
      toast.success("Faktura została utworzona"); // Zamiast alert()
      navigate("/invoices");
    } catch (err) {
      console.error(err);
      toast.error("Błąd przy tworzeniu faktury. Spróbuj ponownie."); // Zamiast setSubmitError
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

  // --- RENDER ---
  return (
    <form className="p-6" onSubmit={handleSubmit(onSubmit)}>
      <h1 className="text-2xl font-semibold mb-4">Nowa faktura</h1>

      {/* 4. Usuwamy wyświetlanie błędu - toasty są globalne */}
      {/* {submitError && <p className="text-red-500 mb-3">{submitError}</p>} */}

      {/* --- SEKCJA NABYWCY --- */}
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
          placeholder="Wpisz nazwę lub kod produktu..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
        />
        {focused && search && (
          <ul className="absolute z-10 bg-white border rounded mt-1 shadow max-h-60 overflow-auto w-full">
            {filteredProducts.length > 0 ? (
              filteredProducts.slice(0, 10).map((p) => (
                <li
                  key={p.id}
                  onMouseDown={() => handleAddProduct(p)}
                  className="px-3 py-2 hover:bg-gray-100 cursor-pointer flex justify-between"
                >
                  <span>
                    {p.name} <span className="text-gray-500">({p.code})</span>
                  </span>
                  <span className="text-gray-600 text-sm">
                    {p.sell_price_net.toFixed(2)} zł
                  </span>
                </li>
              ))
            ) : (
              <li className="px-3 py-2 text-gray-500">Brak pasujących produktów</li>
            )}
          </ul>
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
                Brak pozycji
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
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 disabled:opacity-50"
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