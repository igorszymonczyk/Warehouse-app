import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { api } from "../lib/api";
import { ArrowUp, ArrowDown, Trash2, Edit, X, Upload } from "lucide-react";
import axios, { type AxiosError } from "axios";
import toast from "react-hot-toast";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../store/auth"; 

type Product = {
  id: number;
  name: string;
  code: string;
  description?: string;
  category?: string;
  supplier?: string;
  buy_price?: number;
  sell_price_net: number;
  tax_rate?: number;
  stock_quantity: number;
  location?: string;
  comment?: string;
  created_at?: string;
  image_url?: string;
};

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

const isValidSortKey = (key: string | null): key is SortKey => {
  return ["id", "name", "code", "sell_price_net", "stock_quantity"].includes(key as string);
};
const isValidSortOrder = (order: string | null): order is SortOrder => {
  return ["asc", "desc"].includes(order as string);
};

type ApiError = {
  detail?: string | { msg: string; type: string }[];
  message?: string;
};

function getErrorMessage(err: unknown, fallback = "Wystąpił błąd") {
    if (axios.isAxiosError(err)) {
        const ax = err as AxiosError<ApiError>;
        const data = ax.response?.data;
        if (data?.detail) {
            if (typeof data.detail === 'string') {
                return data.detail;
            }
            if (Array.isArray(data.detail)) {
                return data.detail.map(d => `${d.msg} (${d.type})`).join(', ');
            }
        }
        return data?.message ?? ax.message ?? fallback;
    }
    if (err instanceof Error) return err.message || fallback;
    try { return JSON.stringify(err); } catch { return fallback; }
}

const ConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  isLoading,
  title,
  children,
  confirmText = "Potwierdź",
  confirmVariant = "primary",
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
  title: string;
  children: React.ReactNode;
  confirmText?: string;
  confirmVariant?: "primary" | "danger";
}) => {
  if (!isOpen) return null;

  const colors = {
    primary: "bg-blue-600 hover:bg-blue-700",
    danger: "bg-red-600 hover:bg-red-700",
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg p-6 w-full max-w-sm shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold mb-4">{title}</h2>
        <div className="text-gray-700 mb-6">{children}</div>
        <div className="flex justify-end gap-3">
          <button
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
            onClick={onClose}
            disabled={isLoading}
          >
            Anuluj
          </button>
          <button
            className={`px-4 py-2 text-white rounded ${
              colors[confirmVariant]
            } disabled:opacity-50`}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? "Ładowanie..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default function ProductsPage() {
  const { role } = useAuth();
  
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
  const [editImageFile, setEditImageFile] = useState<File | null>(null);

  const [nameFilter, setNameFilter] = useState("");
  const [codeFilter, setCodeFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [allSuppliers, setAllSuppliers] = useState<string[]>([]);
  const [allLocations, setAllLocations] = useState<string[]>([]);
  
  const [debouncedNameFilter, setDebouncedNameFilter] = useState(nameFilter);
  const [debouncedCodeFilter, setDebouncedCodeFilter] = useState(codeFilter);
  
  useEffect(() => {
    const tName = setTimeout(() => setDebouncedNameFilter(nameFilter), 500);
    const tCode = setTimeout(() => setDebouncedCodeFilter(codeFilter), 500);
    return () => { 
        clearTimeout(tName);
        clearTimeout(tCode);
    }
  }, [nameFilter, codeFilter]);

  const [searchParams, setSearchParams] = useSearchParams();
  const urlSortKey = searchParams.get("sort_by");
  const urlSortOrder = searchParams.get("order");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  
  const [sortKey, setSortKey] = useState<SortKey>(
    isValidSortKey(urlSortKey) ? urlSortKey : "id"
  );
  const [sortOrder, setSortOrder] = useState<SortOrder>(
    isValidSortOrder(urlSortOrder) ? urlSortOrder : "asc"
  );
  
  const [selected, setSelected] = useState<Product | null>(null);
  const [editData, setEditData] = useState<Partial<Product>>({});
  const [editing, setEditing] = useState(false);
  
  useEffect(() => {
    const fetchUniqueValues = async () => {
        try {
            const [catRes, suppRes, locRes] = await Promise.all([
                api.get<string[]>("/products/unique/categories"),
                api.get<string[]>("/products/unique/suppliers"),
                api.get<string[]>("/products/unique/locations"),
            ]);
            setAllCategories(catRes.data);
            setAllSuppliers(suppRes.data);
            setAllLocations(locRes.data);
        } catch (err) {
            console.error("Failed to load unique filters", err);
        }
    };
    fetchUniqueValues();
  }, []); 
  

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<PaginatedProducts>("/products", {
        params: {
          page,
          page_size: pageSize,
          name: debouncedNameFilter || undefined,
          code: debouncedCodeFilter || undefined,
          supplier: supplierFilter || undefined,
          category: categoryFilter || undefined,
          location: locationFilter || undefined,
          sort_by: sortKey,
          order: sortOrder,
        },
      });
      setProducts(res.data.items);
      setTotal(res.data.total);
    } catch (err) {
      console.error(err);
      const msg = getErrorMessage(err, "Nie udało się pobrać listy produktów");
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedNameFilter, debouncedCodeFilter, supplierFilter, categoryFilter, locationFilter, sortKey, sortOrder]); 
  
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (page > 1) params.set("page", String(page));
    params.set("sort_by", sortKey);
    params.set("order", sortOrder);
    if (debouncedNameFilter) params.set("name", debouncedNameFilter);
    if (debouncedCodeFilter) params.set("code", debouncedCodeFilter);
    if (supplierFilter) params.set("supplier", supplierFilter);
    if (categoryFilter) params.set("category", categoryFilter);
    if (locationFilter) params.set("location", locationFilter);
    
    setSearchParams(params, { replace: true });
  }, [page, sortKey, sortOrder, debouncedNameFilter, debouncedCodeFilter, supplierFilter, categoryFilter, locationFilter, setSearchParams]);

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
  
  const closeDetails = () => {
    setSelected(null);
    setEditing(false);
    setEditImageFile(null);
  };

  const saveProduct = async () => {
    if (!selected) return;

    const changedData: { [key: string]: string | number | null | undefined } = {};

    Object.keys(editData).forEach(keyStr => {
      const key = keyStr as keyof Product;
      if (editData[key] !== selected[key]) {
        changedData[key] = editData[key];
      }
    });
    
    if (changedData.sell_price_net !== undefined && Number(changedData.sell_price_net) <= 0) {
      toast.error("Cena musi być większa od 0"); return;
    }
    if (changedData.stock_quantity !== undefined && Number(changedData.stock_quantity) < 0) {
      toast.error("Stan magazynowy nie może być ujemny"); return;
    }
    if (changedData.name !== undefined && !String(changedData.name).trim()) {
      toast.error("Nazwa nie może być pusta"); return;
    }
    if (changedData.code !== undefined && !String(changedData.code).trim()) {
      toast.error("Kod nie może być pusty"); return;
    }

    if (Object.keys(changedData).length === 0 && !editImageFile) {
        toast.success("Brak zmian do zapisania.");
        setEditing(false);
        return;
    }

    const formData = new FormData();
    for (const key in changedData) {
        if (Object.prototype.hasOwnProperty.call(changedData, key)) {
            const value = changedData[key];
            if (value !== null && value !== undefined) {
                 formData.append(key, String(value));
            }
        }
    }
    if (editImageFile) {
        formData.append("file", editImageFile);
    }

    try {
      await api.patch(`/products/${selected.id}/edit`, formData);
      await load();
      toast.success("Produkt zaktualizowany!");
      closeDetails();
    } catch (err: unknown) {
      const msg = getErrorMessage(err, "Nie udało się zaktualizować produktu");
      toast.error(msg);
      console.error(err);
    }    
  };

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
      toast.error("Błąd podczas usuwania produktu");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 5 * 1024 * 1024) { 
        toast.error("Plik jest za duży! Maksymalny rozmiar to 5MB.");
        return;
      }
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        toast.error("Nieprawidłowy format pliku. Dozwolone: JPEG, PNG, WebP.");
        return;
      }
      setImageFile(file);
    }
  };

  const handleEditFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
       if (file.size > 5 * 1024 * 1024) {
        toast.error("Plik jest za duży! Maksymalny rozmiar to 5MB.");
        return;
      }
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        toast.error("Nieprawidłowy format pliku. Dozwolone: JPEG, PNG, WebP.");
        return;
      }
      setEditImageFile(file);
    } else {
      setEditImageFile(null);
    }
  };

  const createProduct = async () => {
    if (!addForm.name.trim() || !addForm.code.trim()) {
      toast.error("Wymagane: nazwa i kod");
      return;
    }
    // Walidacja ceny tylko jeśli to nie jest magazynier
    if (role !== "warehouse" && addForm.sell_price_net <= 0) {
      toast.error("Cena musi być większa od 0");
      return;
    }
    if (addForm.stock_quantity < 0) {
      toast.error("Stan magazynowy nie może być ujemny");
      return;
    }

    const formData = new FormData();
    formData.append("name", addForm.name);
    formData.append("code", addForm.code.trim().toUpperCase());
    formData.append("sell_price_net", String(addForm.sell_price_net));
    formData.append("stock_quantity", String(addForm.stock_quantity));
    if (addForm.buy_price) formData.append("buy_price", String(addForm.buy_price));
    if (addForm.tax_rate) formData.append("tax_rate", String(addForm.tax_rate));
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
      <h1 className="text-2xl font-semibold mb-4">Zarządzanie Produktami</h1>
      
      {/* NOWY KONTENER STYLU LOGI */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          
          <input
            type="text"
            placeholder="Filtruj po nazwie"
            className="border rounded px-3 py-2 w-48"
            value={nameFilter}
            onChange={(e) => {setNameFilter(e.target.value); setPage(1);}}
          />
          <input
            type="text"
            placeholder="Filtruj po kodzie"
            className="border rounded px-3 py-2 w-32"
            value={codeFilter}
            onChange={(e) => {setCodeFilter(e.target.value); setPage(1);}}
          />
          
          <select
            className="border rounded px-3 py-2 w-32"
            value={supplierFilter}
            onChange={(e) => {setSupplierFilter(e.target.value || ""); setPage(1);}}
          >
            <option value="">-- Dostawca --</option>
            {allSuppliers.map(val => (<option key={val} value={val}>{val}</option>))}
          </select>
          
          <select
            className="border rounded px-3 py-2 w-32"
            value={categoryFilter}
            onChange={(e) => {setCategoryFilter(e.target.value || ""); setPage(1);}}
          >
            <option value="">-- Kategoria --</option>
            {allCategories.map(val => (<option key={val} value={val}>{val}</option>))}
          </select>
          
          <select
            className="border rounded px-3 py-2 w-32"
            value={locationFilter}
            onChange={(e) => {setLocationFilter(e.target.value || ""); setPage(1);}}
          >
            <option value="">-- Lokalizacja --</option>
            {allLocations.map(val => (<option key={val} value={val}>{val}</option>))}
          </select>
          
          <button
            className="ml-auto bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
            onClick={() => setShowAdd(true)}
          >
            Dodaj Produkt
          </button>
        </div>
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
                  
                  {/* Warunkowe wyświetlannie tabeli*/}
                  {role !== "warehouse" ? (
                    <th className="p-2 border text-right cursor-pointer" onClick={() => toggleSort("sell_price_net")}>
                      Cena Netto {renderSortIcon("sell_price_net")}
                    </th>
                  ) : (
                    <th className="p-2 border text-right">
                      Lokalizacja
                    </th>
                  )}

                  <th className="p-2 border text-right cursor-pointer" onClick={() => toggleSort("stock_quantity")}>
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
                      <td className="p-2 border font-medium">{p.name}</td>
                      <td className="p-2 border">{p.code}</td>
                      
                      {/*warunkowa zawartosc tabeli*/}
                      {role !== "warehouse" ? (
                        <td className="p-2 border text-right">{p.sell_price_net.toFixed(2)} zł</td>
                      ) : (
                        <td className="p-2 border text-right">{p.location || "-"}</td>
                      )}

                      <td className="p-2 border text-right">{p.stock_quantity}</td>
                      <td className="p-2 border text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => openDetails(p)}
                          className="px-2 py-1 text-blue-600 hover:text-blue-800"
                          aria-label={`Edytuj ${p.name}`}
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => setProductToDelete(p)}
                          className="px-2 py-1 text-red-600 hover:text-red-800"
                          aria-label={`Usuń ${p.name}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-gray-500">
                      Nie znaleziono produktów
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
              Poprz.
            </button>
            <span>
              Strona {page} z {totalPages}
            </span>
            <button
              className="border rounded px-3 py-1 disabled:opacity-50"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Nast.
            </button>
          </div>
        </>
      )}

      {selected && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-[500px] max-h-[80vh] overflow-y-auto shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">
                {editing ? "Edycja Produktu" : "Szczegóły Produktu"}
              </h2>
              <button onClick={closeDetails}>
                <X size={20} />
              </button>
            </div>

            {editing ? (
              <>
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
                
                {/* ukrywanie pol cenowych przed magazynierem*/}
                {role !== "warehouse" && (
                  <>
                    <label className="block mb-2">
                      Cena Netto:
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
                      Cena Zakupu:
                      <input
                        type="number"
                        className="border w-full p-2 rounded mt-1"
                        value={editData.buy_price ?? 0}
                        onChange={(e) =>
                          setEditData({
                            ...editData,
                            buy_price: parseFloat(e.target.value),
                          })
                        }
                      />
                    </label>
                  </>
                )}

                <label className="block mb-2">
                  Stan Magazynowy:
                  <input
                    type="number"
                    className="border w-full p-2 rounded mt-1"
                    value={editData.stock_quantity ?? ""}
                    onChange={(e) =>
                      setEditData({
                        ...editData,
                        stock_quantity: parseInt(e.target.value, 10),
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
                
                <label className="block mb-2">
                  <span className="text-sm">Zmień zdjęcie produktu</span>
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
                        onChange={handleEditFileChange}
                      />
                    </label>
                    {editImageFile ? (
                      <span className="text-sm text-gray-600">{editImageFile.name}</span>
                    ) : (
                      <span className="text-sm text-gray-500">Nie wybrano pliku</span>
                    )}
                  </div>
                </label>

                <button
                  onClick={saveProduct}
                  className="mt-4 w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
                >
                  Zapisz Zmiany
                </button>
              </>
            ) : (
              <>
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
                
                {/*ukrywanie pol cenowych w szczegolach dla magazyniera */}
                {role !== "warehouse" && (
                  <>
                    <p><strong>Cena Netto:</strong> {selected.sell_price_net.toFixed(2)} zł</p>
                    <p><strong>Cena Zakupu:</strong> {selected.buy_price ? selected.buy_price.toFixed(2) : "0.00"} zł</p>
                  </>
                )}

                <p><strong>Stan:</strong> {selected.stock_quantity}</p>
                <p><strong>Dostawca:</strong> {selected.supplier || "Brak"}</p>
                <p><strong>Kategoria:</strong> {selected.category || "Brak"}</p>
                <p><strong>Lokalizacja:</strong> {selected.location || "Brak"}</p>
                <p><strong>Opis:</strong> {selected.description || "Brak"}</p>
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

      {showAdd && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-[520px] max-h-[85vh] overflow-y-auto shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Dodaj Produkt</h2>
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
              
              {/*ukrywanie pol cenowych przy dodawaniu */}
              {role !== "warehouse" && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-sm">Cena Netto *</span>
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
                    <span className="text-sm">Cena Zakupu</span>
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
              )}

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
                  rows={2}
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
                {addLoading ? "Dodawanie..." : "Dodaj Produkt"}
              </button>
            </div>
          </div>
        </div>
      )}
      
      <ConfirmationModal
        isOpen={!!productToDelete}
        onClose={() => setProductToDelete(null)}
        onConfirm={deleteProduct}
        isLoading={deleteLoading}
        title="Potwierdzenie usunięcia"
        confirmText="Usuń"
        confirmVariant="danger"
      >
        <p>Czy na pewno chcesz usunąć ten produkt?</p>
        <p className="font-semibold mt-2">{productToDelete?.name}</p>
        <p className="text-sm text-gray-600">Tej operacji nie można cofnąć.</p>
      </ConfirmationModal>
    </div>
  );
}