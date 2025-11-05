import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { ArrowUp, ArrowDown, Trash2, Edit, X } from "lucide-react";

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
};

type PaginatedProducts = {
  items: Product[];
  total: number;
  page: number;
  page_size: number;
};

type SortKey = "id" | "name" | "code" | "sell_price_net" | "stock_quantity";
type SortOrder = "asc" | "desc";

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState(search);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(timer);
  }, [search]);

  const [sortKey, setSortKey] = useState<SortKey>("id");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  const [selected, setSelected] = useState<Product | null>(null);
  const [editData, setEditData] = useState<Partial<Product>>({});
  const [editing, setEditing] = useState(false);

  const load = async () => {
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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [page, debouncedSearch, sortKey, sortOrder]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
  };

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) return <span className="opacity-30">↕</span>;
    return sortOrder === "asc" ? (
      <ArrowUp size={14} className="inline ml-1" />
    ) : (
      <ArrowDown size={14} className="inline ml-1" />
    );
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const openDetails = (p: Product) => {
    setSelected(p);
    setEditData(p);
    setEditing(false);
  };

  const closeDetails = () => {
    setSelected(null);
    setEditing(false);
  };

  const saveProduct = async () => {
    if (!selected) return;
    try {
      await api.put(`/products/${selected.id}`, editData);
      await load();
      closeDetails();
    } catch (err) {
      console.error(err);
      alert("Nie udało się zaktualizować produktu");
    }
  };

  const deleteProduct = async (id: number) => {
    if (!window.confirm("Czy na pewno chcesz usunąć ten produkt?")) return;
    try {
      await api.delete(`/products/${id}`);
      await load();
    } catch (err) {
      console.error(err);
      alert("Błąd przy usuwaniu produktu");
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Zarządzanie produktami</h1>

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Szukaj po nazwie lub kodzie..."
          className="border rounded px-3 py-2 w-64"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
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
                          onClick={() => deleteProduct(p.id)}
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
            <span>Strona {page} / {totalPages}</span>
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
                    onChange={(e) => setEditData({ ...editData, code: e.target.value })}
                  />
                </label>
                <label className="block mb-2">
                  Cena netto:
                  <input
                    type="number"
                    className="border w-full p-2 rounded mt-1"
                    value={editData.sell_price_net ?? ""}
                    onChange={(e) =>
                      setEditData({ ...editData, sell_price_net: parseFloat(e.target.value) })
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
                      setEditData({ ...editData, stock_quantity: parseInt(e.target.value) })
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

                <button
                  onClick={saveProduct}
                  className="mt-4 w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
                >
                  Zapisz zmiany
                </button>
              </>
            ) : (
              <>
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
    </div>
  );
}
