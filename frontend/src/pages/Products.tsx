// src/pages/Products.tsx
import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { api } from "../lib/api";
import { ArrowUp, ArrowDown, Trash2, Edit, X, Upload } from "lucide-react";
import axios, { type AxiosError } from "axios";
import ConfirmationModal from "../components/ConfirmationModal";
import toast from "react-hot-toast";
import { useSearchParams } from "react-router-dom";

type Product = {
  id: number;
  name: string;
  code: string;
  description?: string;
  category?: string;
  supplier?: string;
  sell_price_net: number;
  tax_rate?: number;
  stock_quantity: number;
  location?: string;
  comment?: string;
  created_at?: string;
  image_url?: string;
};

// ... (typy PaginatedProducts, ProductCreate, SortKey, SortOrder bez zmian) ...
type PaginatedProducts = {
  items: Product[];
  total: number;
  page: number;
  page_size: number;
};

type ProductCreate = {
  name: string;
  code: string;
  sell_price_net: number;
  stock_quantity: number;
  buy_price?: number;
  description?: string;
  category?: string;
  supplier?: string;
  tax_rate?: number;
  location?: string;
  comment?: string;
};

type SortKey = "id" | "name" | "code" | "sell_price_net" | "stock_quantity";
type SortOrder = "asc" | "desc";

// ... (funkcje isValidSortKey, isValidSortOrder, getErrorMessage bez zmian) ...
const isValidSortKey = (key: string | null): key is SortKey => {
  return ["id", "name", "code", "sell_price_net", "stock_quantity"].includes(key as string);
};
const isValidSortOrder = (order: string | null): order is SortOrder => {
  return ["asc", "desc"].includes(order as string);
};

type ApiError = {
  detail?: string;
  message?: string;
};

function getErrorMessage(err: unknown, fallback = "Wystąpił błąd") {
  if (axios.isAxiosError(err)) {
    const ax = err as AxiosError<ApiError>;
    return (
      ax.response?.data?.detail ??
      ax.response?.data?.message ??
      ax.message ??
      fallback
    );
  }
  if (err instanceof Error) return err.message || fallback;
  try { return JSON.stringify(err); } catch { return fallback; }
}


export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [addForm, setAddForm] = useState<ProductCreate>({
    name: "",
    code: "",
    sell_price_net: 0,
    buy_price: 0,
    stock_quantity: 0,
    description: "",
    category: "",
    supplier: "",
    tax_rate: 23,
    location: "",
    comment: "",
  });
  
  const [imageFile, setImageFile] = useState<File | null>(null);
  // 1. ZMIANA: Dodajemy stan dla pliku w formularzu edycji
  const [editImageFile, setEditImageFile] = useState<File | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  // ... (stany searchParams, page, search, sortKey, sortOrder bez zmian) ...
  const urlSortKey = searchParams.get("sort_by");
  const urlSortOrder = searchParams.get("order");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(t);
  }, [search]);
  const [sortKey, setSortKey] = useState<SortKey>(
    isValidSortKey(urlSortKey) ? urlSortKey : "id"
  );
  const [sortOrder, setSortOrder] = useState<SortOrder>(
    isValidSortOrder(urlSortOrder) ? urlSortOrder : "asc"
  );
  
  const [selected, setSelected] = useState<Product | null>(null);
  const [editData, setEditData] = useState<Partial<Product>>({});
  const [editing, setEditing] = useState(false);

  // ... (funkcja load bez zmian) ...
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<PaginatedProducts>("/products", {
        params: {
          page,
          page_size: pageSize,
          q: debouncedSearch || undefined,
          sort_by: sortKey,
          order: sortOrder,
        },
      });
      setProducts(res.data.items);
      setTotal(res.data.total);
    } catch (err) {
      console.error(err);
      setError("Nie udało się pobrać listy produktów");
      toast.error("Nie udało się pobrać listy produktów");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, sortKey, sortOrder]);
  
  // ... (useEffect-y bez zmian) ...
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("sort_by", sortKey);
    params.set("order", sortOrder);
    setSearchParams(params, { replace: true });
  }, [sortKey, sortOrder, setSearchParams]);

  // ... (toggleSort, renderSortIcon bez zmian) ...
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortOrder((p) => (p === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortOrder("asc");
    }
  };
  const renderSortIcon = (key: SortKey) =>
    sortKey !== key ? (
      <span className="opacity-30">↕</span>
    ) : sortOrder === "asc" ? (
      <ArrowUp size={14} className="inline ml-1" />
    ) : (
      <ArrowDown size={14} className="inline ml-1" />
    );
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const openDetails = (p: Product) => {
    setSelected(p);
    setEditData(p);
    setEditing(false);
  };
  
  // 2. ZMIANA: Resetujemy stan pliku edycji przy zamykaniu
  const closeDetails = () => {
    setSelected(null);
    setEditing(false);
    setEditImageFile(null); // Resetuj plik edycji
  };

  // 3. ZMIANA: Całkowicie przepisujemy funkcję saveProduct
  const saveProduct = async () => {
    if (!selected) return;

    // Używamy FormData, aby wysłać plik (tak jak w createProduct)
    const formData = new FormData();

    // Walidacje
    if (editData.sell_price_net !== undefined && Number(editData.sell_price_net) <= 0) {
      toast.error("Cena netto musi być > 0"); return;
    }
    if (editData.stock_quantity !== undefined && Number(editData.stock_quantity) < 0) {
      toast.error("Stan nie może być ujemny"); return;
    }
    if (editData.name !== undefined && !editData.name.trim()) {
      toast.error("Nazwa nie może być pusta"); return;
    }
    if (editData.code !== undefined && !editData.code.trim()) {
      toast.error("Kod nie może być pusty"); return;
    }

    // Dodajemy wszystkie pola z formularza edycji do FormData
    // Backend (PATCH) zaktualizuje tylko te pola, które nie są 'None'
    if (editData.name !== undefined) formData.append("name", editData.name);
    if (editData.code !== undefined) formData.append("code", editData.code.trim().toUpperCase());
    if (editData.sell_price_net !== undefined) formData.append("sell_price_net", String(editData.sell_price_net));
    if (editData.stock_quantity !== undefined) formData.append("stock_quantity", String(editData.stock_quantity));
    
    // Wysyłamy pusty string, jeśli użytkownik wyczyścił pole
    if (editData.supplier !== undefined) formData.append("supplier", editData.supplier ?? "");
    if (editData.category !== undefined) formData.append("category", editData.category ?? "");
    if (editData.location !== undefined) formData.append("location", editData.location ?? "");
    if (editData.description !== undefined) formData.append("description", editData.description ?? "");
    
    // Dodaj plik, jeśli został wybrany w formularzu edycji
    if (editImageFile) {
      formData.append("file", editImageFile);
    }

    try {
      // Wysyłamy FormData za pomocą api.patch
      // (Wymaga to zmian w backendzie, aby akceptował FormData)
      await api.patch(`/products/${selected.id}/edit`, formData); 
      await load();
      toast.success("Produkt zaktualizowany!");
      closeDetails(); // To zresetuje też editImageFile
    } catch (err: unknown) {
      const msg = getErrorMessage(err, "Nie udało się zaktualizować produktu");
      toast.error(msg);
      console.error(err);
    }    
  };

  // ... (funkcja deleteProduct bez zmian) ...
  const deleteProduct = async () => {
    if (!productToDelete) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/products/${productToDelete.id}`);
      await load();
      setProductToDelete(null);
      toast.success("Produkt usunięty!");
    } catch (err) {
      console.error(err);
      toast.error("Błąd przy usuwaniu produktu");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        toast.error("Plik jest za duży! Maksymalny rozmiar to 5MB.");
        return;
      }
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        toast.error("Niewłaściwy format pliku. Dozwolone: JPEG, PNG, WebP.");
        return;
      }
      setImageFile(file);
    }
  };

  // 4. ZMIANA: Dodajemy handler dla inputu pliku w formularzu edycji
  const handleEditFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        toast.error("Plik jest za duży! Maksymalny rozmiar to 5MB.");
        return;
      }
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        toast.error("Niewłaściwy format pliku. Dozwolone: JPEG, PNG, WebP.");
        return;
      }
      setEditImageFile(file);
    } else {
      setEditImageFile(null);
    }
  };

  // ... (funkcja createProduct bez zmian) ...
  const createProduct = async () => {
    if (!addForm.name.trim() || !addForm.code.trim()) {
      toast.error("Wymagane: nazwa i kod");
      return;
    }
    if (addForm.sell_price_net <= 0) {
      toast.error("Cena netto musi być > 0");
      return;
    }
    if (addForm.stock_quantity < 0) {
      toast.error("Stan nie może być ujemny");
      return;
    }

    const formData = new FormData();
    formData.append("name", addForm.name);
    formData.append("code", addForm.code.trim().toUpperCase());
    formData.append("sell_price_net", String(addForm.sell_price_net));
    formData.append("stock_quantity", String(addForm.stock_quantity));
    formData.append("buy_price", String(addForm.buy_price || 0));
    formData.append("tax_rate", String(addForm.tax_rate || 23));
    
    if (addForm.description) formData.append("description", addForm.description);
    if (addForm.category) formData.append("category", addForm.category);
    if (addForm.supplier) formData.append("supplier", addForm.supplier);
    if (addForm.location) formData.append("location", addForm.location);
    if (addForm.comment) formData.append("comment", addForm.comment);

    if (imageFile) {
      formData.append("file", imageFile);
    }

    try {
      setAddLoading(true);
      await api.post(`/products`, formData); 
      
      setShowAdd(false);
      setAddForm({
        name: "", code: "", sell_price_net: 0, buy_price: 0, stock_quantity: 0,
        description: "", category: "", supplier: "",
        tax_rate: 23, location: "", comment: "",
      });
      setImageFile(null);
      await load();
      toast.success("Produkt dodany pomyślnie!");
    } catch (err: unknown) {
      const msg = getErrorMessage(err, "Nie udało się dodać produktu");
      toast.error(msg);
      console.error(err);
    } finally {      
      setAddLoading(false);
    }
  };


  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Zarządzanie produktami</h1>
      {/* ... (Wyszukiwarka, przycisk "Dodaj", tabela, paginacja - bez zmian) ... */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="Szukaj po nazwie lub kodzie..."
          className="border rounded px-3 py-2 w-64"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          className="ml-auto bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          onClick={() => setShowAdd(true)}
        >
          Dodaj produkt
        </button>
      </div>

      {loading && <p>Ładowanie danych...</p>}
      {error && <p className="text-red-500">{error}</p>}

      {!loading && !error && (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full border bg-white text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-2 border text-left cursor-pointer" onClick={() => toggleSort("id")}>
                    ID {renderSortIcon("id")}
                  </th>
                  <th className="p-2 border text-left cursor-pointer" onClick={() => toggleSort("name")}>
                    Nazwa {renderSortIcon("name")}
                  </th>
                  <th className="p-2 border text-left cursor-pointer" onClick={() => toggleSort("code")}>
                    Kod {renderSortIcon("code")}
                  </th>
                  <th className="p-2 border text-left cursor-pointer" onClick={() => toggleSort("sell_price_net")}>
                    Cena netto {renderSortIcon("sell_price_net")}
                  </th>
                  <th className="p-2 border text-left cursor-pointer" onClick={() => toggleSort("stock_quantity")}>
                    Stan {renderSortIcon("stock_quantity")}
                  </th>
                  <th className="p-2 border text-center">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {products.length > 0 ? (
                  products.map((p) => (
                    <tr
                      key={p.id}
                      className="border-t hover:bg-gray-50 cursor-pointer"
                      onClick={() => openDetails(p)}
                    >
                      <td className="p-2 border">{p.id}</td>
                      <td className="p-2 border">{p.name}</td>
                      <td className="p-2 border">{p.code}</td>
                      <td className="p-2 border">{p.sell_price_net.toFixed(2)} zł</td>
                      <td className="p-2 border">{p.stock_quantity}</td>
                      <td className="p-2 border text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => openDetails(p)}
                          className="px-2 py-1 text-blue-600 hover:text-blue-800"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation(); 
                            setProductToDelete(p);
                          }}
                          className="px-2 py-1 text-red-600 hover:text-red-800"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-gray-500">
                      Brak produktów
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              className="border rounded px-3 py-1 disabled:opacity-50"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Prev
            </button>
            <span>
              Strona {page} / {totalPages}
            </span>
            <button
              className="border rounded px-3 py-1 disabled:opacity-50"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}

      {/* Modal: Szczegóły / Edycja */}
      {selected && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-[500px] max-h-[80vh] overflow-y-auto shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">
                {editing ? "Edytuj produkt" : "Szczegóły produktu"}
              </h2>
              <button onClick={closeDetails}>
                <X size={20} />
              </button>
            </div>

            {editing ? (
              <>
                {/* ... (inputy Nazwa, Kod, Cena, Stan, Dostawca, Kategoria, Lokalizacja, Opis BEZ ZMIAN) ... */}
                <label className="block mb-2">
                  Nazwa:
                  <input
                    className="border w-full p-2 rounded mt-1"
                    value={editData.name || ""}
                    onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                  />
                </label>
                <label className="block mb-2">
                  Kod:
                  <input
                    className="border w-full p-2 rounded mt-1"
                    value={editData.code || ""}
                    onChange={(e) =>
                      setEditData({ ...editData, code: e.target.value.toUpperCase() })
                    }
                  />
                </label>
                <label className="block mb-2">
                  Cena netto:
                  <input
                    type="number"
                    className="border w-full p-2 rounded mt-1"
                    value={editData.sell_price_net ?? ""}
                    onChange={(e) =>
                      setEditData({
                        ...editData,
                        sell_price_net: parseFloat(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="block mb-2">
                  Stan magazynowy:
                  <input
                    type="number"
                    className="border w-full p-2 rounded mt-1"
                    value={editData.stock_quantity ?? ""}
                    onChange={(e) =>
                      setEditData({
                        ...editData,
                        stock_quantity: parseInt(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="block mb-2">
                  Dostawca:
                  <input
                    className="border w-full p-2 rounded mt-1"
                    value={editData.supplier || ""}
                    onChange={(e) => setEditData({ ...editData, supplier: e.target.value })}
                  />
                </label>
                <label className="block mb-2">
                  Kategoria:
                  <input
                    className="border w-full p-2 rounded mt-1"
                    value={editData.category || ""}
                    onChange={(e) => setEditData({ ...editData, category: e.target.value })}
                  />
                </label>
                <label className="block mb-2">
                  Lokalizacja:
                  <input
                    className="border w-full p-2 rounded mt-1"
                    value={editData.location || ""}
                    onChange={(e) => setEditData({ ...editData, location: e.target.value })}
                  />
                </label>
                <label className="block mb-2">
                  Opis:
                  <input
                    className="border w-full p-2 rounded mt-1"
                    value={editData.description || ""}
                    onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                  />
                </label>
                
                {/* 5. ZMIANA: Dodajemy input pliku (skopiowany z modala 'Dodaj produkt') */}
                <label className="block mb-2">
                  <span className="text-sm">Zmień zdjęcie produktu</span>
                  {/* Podgląd obecnego zdjęcia */}
                  {editData.image_url && !editImageFile && (
                     <img 
                      src={`${import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"}${editData.image_url}`} 
                      alt={editData.name} 
                      className="w-full h-auto max-h-32 object-contain rounded-md bg-gray-100 my-2"
                    />
                  )}
                  <div className="mt-1 flex items-center gap-3">
                    <label className="cursor-pointer border rounded px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                      <Upload size={16} />
                      <span>Wybierz plik</span>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/png, image/jpeg, image/webp"
                        onChange={handleEditFileChange} // Używamy nowego handlera
                      />
                    </label>
                    {editImageFile ? (
                      <span className="text-sm text-gray-600">{editImageFile.name}</span> // Używamy nowego stanu
                    ) : (
                      <span className="text-sm text-gray-500">Nie wybrano pliku</span>
                    )}
                  </div>
                </label>

                <button
                  onClick={saveProduct}
                  className="mt-4 w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
                >
                  Zapisz zmiany
                </button>
              </>
            ) : (
              <>
                {/* ... (Widok szczegółów bez zmian) ... */}
                {selected.image_url && (
                  <div className="mb-4">
                    <img 
                      src={`${import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"}${selected.image_url}`} 
                      alt={selected.name} 
                      className="w-full h-auto max-h-48 object-contain rounded-md bg-gray-100"
                    />
                  </div>
                )}
                <p><strong>ID:</strong> {selected.id}</p>
                <p><strong>Nazwa:</strong> {selected.name}</p>
                <p><strong>Kod:</strong> {selected.code}</p>
                <p><strong>Cena netto:</strong> {selected.sell_price_net} zł</p>
                <p><strong>Stan:</strong> {selected.stock_quantity}</p>
                <p><strong>Dostawca:</strong> {selected.supplier}</p>
                <p><strong>Kategoria:</strong> {selected.category}</p>
                <p><strong>Lokalizacja:</strong> {selected.location}</p>
                <p><strong>Opis:</strong> {selected.description}</p>
                <button
                  onClick={() => setEditing(true)}
                  className="mt-4 w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
                >
                  Edytuj
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal: Dodaj produkt (bez zmian) */}
      {showAdd && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          {/* ... (Cała zawartość modala dodawania bez zmian) ... */}
          <div className="bg-white rounded-2xl p-6 w-[520px] max-h-[85vh] overflow-y-auto shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Dodaj produkt</h2>
              <button onClick={() => setShowAdd(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="grid gap-3">
              <label className="block">
                <span className="text-sm">Nazwa *</span>
                <input
                  className="border w-full p-2 rounded mt-1"
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="text-sm">Kod *</span>
                <input
                  className="border w-full p-2 rounded mt-1"
                  value={addForm.code}
                  onChange={(e) =>
                    setAddForm({ ...addForm, code: e.target.value.toUpperCase() })
                  }
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm">Cena netto *</span>
                  <input
                    type="number"
                    step="0.01"
                    className="border w-full p-2 rounded mt-1"
                    value={addForm.sell_price_net}
                    onChange={(e) =>
                      setAddForm({ ...addForm, sell_price_net: Number(e.target.value) })
                    }
                  />
                </label>
                <label className="block">
                  <span className="text-sm">Cena zakupu</span>
                  <input
                    type="number"
                    step="0.01"
                    className="border w-full p-2 rounded mt-1"
                    value={addForm.buy_price ?? 0}
                    onChange={(e) =>
                      setAddForm({ ...addForm, buy_price: Number(e.target.value) })
                    }
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm">Stan *</span>
                  <input
                    type="number"
                    className="border w-full p-2 rounded mt-1"
                    value={addForm.stock_quantity}
                    onChange={(e) =>
                      setAddForm({ ...addForm, stock_quantity: Number(e.target.value) })
                    }
                  />
                </label>
                <label className="block">
                  <span className="text-sm">Stawka VAT (%)</span>
                  <input
                    type="number"
                    className="border w-full p-2 rounded mt-1"
                    value={addForm.tax_rate ?? 23}
                    onChange={(e) =>
                      setAddForm({ ...addForm, tax_rate: Number(e.target.value) })
                    }
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-sm">Kategoria</span>
                <input
                  className="border w-full p-2 rounded mt-1"
                  value={addForm.category ?? ""}
                  onChange={(e) =>
                    setAddForm({ ...addForm, category: e.target.value })
                  }
                />
              </label>
              <label className="block">
                <span className="text-sm">Dostawca</span>
                <input
                  className="border w-full p-2 rounded mt-1"
                  value={addForm.supplier ?? ""}
                  onChange={(e) =>
                    setAddForm({ ...addForm, supplier: e.target.value })
                  }
                />
              </label>
              <label className="block">
                <span className="text-sm">Lokalizacja</span>
                <input
                  className="border w-full p-2 rounded mt-1"
                  value={addForm.location ?? ""}
                  onChange={(e) =>
                    setAddForm({ ...addForm, location: e.target.value })
                  }
                />
              </label>
              <label className="block">
                <span className="text-sm">Opis</span>
                <textarea
                  className="border w-full p-2 rounded mt-1"
                  rows={3}
                  value={addForm.description ?? ""}
                  onChange={(e) =>
                    setAddForm({ ...addForm, description: e.target.value })
                  }
                />
              </label>

              <label className="block">
                <span className="text-sm">Zdjęcie produktu</span>
                <div className="mt-1 flex items-center gap-3">
                  <label className="cursor-pointer border rounded px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                    <Upload size={16} />
                    <span>Wybierz plik</span>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/png, image/jpeg, image/webp"
                      onChange={handleFileChange}
                    />
                  </label>
                  {imageFile ? (
                    <span className="text-sm text-gray-600">{imageFile.name}</span>
                  ) : (
                    <span className="text-sm text-gray-500">Nie wybrano pliku</span>
                  )}
                </div>
              </label>

              <button
                onClick={createProduct}
                disabled={addLoading}
                className="mt-2 w-full bg-green-600 text-white py-2 rounded hover:bg-green-700 disabled:opacity-60"
              >
                {addLoading ? "Dodaję..." : "Dodaj produkt"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal potwierdzający (bez zmian) */}
      <ConfirmationModal
        isOpen={!!productToDelete}
        onClose={() => setProductToDelete(null)}
        onConfirm={deleteProduct}
        isLoading={deleteLoading}
        title="Potwierdź usunięcie"
        confirmText="Usuń"
        confirmVariant="danger"
      >
        <p>Czy na pewno chcesz usunąć ten produkt?</p>
        <p className="font-semibold mt-2">{productToDelete?.name}</p>
        <p className="text-sm text-gray-600">Tej akcji nie można cofnąć.</p>
      </ConfirmationModal>
    </div>
  );
}