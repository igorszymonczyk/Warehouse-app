import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { ArrowUpDown, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import ConfirmationModal from "./ConfirmationModal";

// ZMIANA: first_name / last_name
type User = {
  id: number;
  email: string;
  role: string;
  first_name?: string;
  last_name?: string;
};

type PaginatedUsers = {
  items: User[];
  total: number;
  page: number;
  page_size: number;
};

const isValidRole = (role: string): role is "admin" | "salesman" | "customer" | "warehouse" => {
  return ["admin", "salesman", "customer", "warehouse"].includes(role);
}

export default function UsersPage() {
  const [data, setData] = useState<PaginatedUsers | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Filtry
  const [q, setQ] = useState(""); // Email filter
  const [lastNameFilter, setLastNameFilter] = useState(""); // ZMIANA: Filtr nazwiska
  const [role, setRole] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  
  // ZMIANA: Nowe klucze sortowania
  const [sortBy, setSortBy] = useState<"id" | "email" | "role" | "first_name" | "last_name">("id");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  const pageSize = 10;

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get<PaginatedUsers>("/users", {
        params: {
          q: q || undefined,
          last_name: lastNameFilter || undefined, // Przekazujemy nazwisko
          role: role || undefined,
          page,
          page_size: pageSize,
          sort_by: sortBy,
          order,
        },
      });
      setData(res.data);
    } catch (err) {
      console.error(err);
      setError("Nie udało się pobrać użytkowników");
      toast.error("Nie udało się pobrać użytkowników"); 
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      setPage(1);
      load();
    }, 300);
    return () => clearTimeout(timeout);
  }, [q, lastNameFilter, role, sortBy, order]); // Dodano lastNameFilter do zależności

  useEffect(() => {
    load();
  }, [page]);

  const toggleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setOrder("asc");
    }
  };

  const changeRole = async (id: number, newRole: string) => {
    if (!isValidRole(newRole)) {
      toast.error("Nieznana rola");
      return;
    }

    if (!window.confirm(`Czy na pewno zmienić rolę użytkownika na "${newRole}"?`)) {
       load(); 
       return;
    }
    
    try {
      await api.put(`/users/${id}/role`, { role: newRole });
      toast.success("Rola została zaktualizowana!");
      load(); 
    } catch {
      toast.error("Błąd przy zmianie roli użytkownika");
    }
  };

  const deleteUser = async () => {
    if (!userToDelete) return;

    setDeleteLoading(true);
    try {
      await api.delete(`/users/${userToDelete.id}`);
      toast.success(`Użytkownik ${userToDelete.email} usunięty!`);
      setUserToDelete(null);
      load(); 
    } catch {
      toast.error("Błąd przy usuwaniu użytkownika");
    } finally {
      setDeleteLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Zarządzanie użytkownikami</h1>

      {/* Filtry */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-sm text-gray-700 mb-1">Szukaj po e-mailu</label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="email"
            className="border px-3 py-2 rounded w-64"
          />
        </div>
        {/* ZMIANA: Filtr nazwiska po prawej od emaila */}
        <div>
          <label className="block text-sm text-gray-700 mb-1">Szukaj po nazwisku</label>
          <input
            value={lastNameFilter}
            onChange={(e) => setLastNameFilter(e.target.value)}
            placeholder="nazwisko"
            className="border px-3 py-2 rounded w-64"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Rola</label>
          <select
            value={role || ""}
            onChange={(e) => setRole(e.target.value || undefined)}
            className="border px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Wszystkie</option>
            <option value="customer">customer</option>
            <option value="salesman">salesman</option>
            <option value="admin">admin</option>
            <option value="warehouse">warehouse</option>
          </select>
        </div>
      </div>

      {loading && <p>Ładowanie…</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && data && (
        <>
          <div className="overflow-x-auto border rounded bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th
                    className="p-3 border-b text-left cursor-pointer select-none hover:bg-gray-200 w-20"
                    onClick={() => toggleSort("id")}
                  >
                    <div className="flex items-center gap-1">
                      ID
                      <ArrowUpDown
                        size={14}
                        className={
                          sortBy === "id"
                            ? order === "desc"
                              ? "text-black"
                              : "rotate-180 text-black"
                            : "text-gray-400"
                        }
                      />
                    </div>
                  </th>
                  {/* ZMIANA: Kolumny Imię i Nazwisko */}
                  <th className="p-3 border-b text-left" onClick={() => toggleSort("first_name")}>
                    <div className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded">
                        Imię <ArrowUpDown size={14} className={sortBy === "first_name" ? (order === "asc" ? "rotate-180 text-black" : "text-black") : "text-gray-400"} />
                    </div>
                  </th>
                  <th className="p-3 border-b text-left" onClick={() => toggleSort("last_name")}>
                    <div className="flex items-center gap-1 cursor-pointer hover:bg-gray-200 p-1 rounded">
                        Nazwisko <ArrowUpDown size={14} className={sortBy === "last_name" ? (order === "asc" ? "rotate-180 text-black" : "text-black") : "text-gray-400"} />
                    </div>
                  </th>
                  <th
                    className="p-3 border-b text-left cursor-pointer select-none hover:bg-gray-200"
                    onClick={() => toggleSort("email")}
                  >
                    <div className="flex items-center gap-1">
                      Email
                      <ArrowUpDown
                        size={14}
                        className={
                          sortBy === "email"
                            ? order === "asc"
                              ? "rotate-180 text-black"
                              : "text-black"
                            : "text-gray-400"
                        }
                      />
                    </div>
                  </th>
                  <th
                    className="p-3 border-b text-left cursor-pointer select-none hover:bg-gray-200"
                    onClick={() => toggleSort("role")}
                  >
                    <div className="flex items-center gap-1">
                      Rola
                      <ArrowUpDown
                        size={14}
                        className={
                          sortBy === "role"
                            ? order === "asc"
                              ? "rotate-180 text-black"
                              : "text-black"
                            : "text-gray-400"
                        }
                      />
                    </div>
                  </th>
                  <th className="p-3 border-b text-center w-24">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((u) => (
                  <tr key={u.id} className="border-b hover:bg-gray-50 transition-colors">
                    <td className="p-3 font-mono text-gray-600">{u.id}</td>
                    <td className="p-3 text-gray-800">{u.first_name || "-"}</td>
                    <td className="p-3 text-gray-800">{u.last_name || "-"}</td>
                    {/* ZMIANA: E-mail bez niebieskiego koloru */}
                    <td className="p-3 text-gray-900">{u.email}</td>
                    <td className="p-3">
                        <select
                          value={u.role}
                          onChange={(e) => changeRole(u.id, e.target.value)}
                          className="border border-gray-300 rounded px-2 py-1 text-sm bg-white hover:border-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer w-full max-w-[120px]"
                        >
                          <option value="customer">customer</option>
                          <option value="salesman">salesman</option>
                          <option value="admin">admin</option>
                          <option value="warehouse">warehouse</option>
                        </select>
                    </td>
                    <td className="p-3 text-center">
                        <button
                          onClick={() => setUserToDelete(u)}
                          className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                          title="Usuń użytkownika"
                        >
                          <Trash2 size={18} />
                        </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-center gap-4">
            <button
              className="px-4 py-2 border rounded hover:bg-gray-50 disabled:opacity-50 text-sm"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Poprzednia
            </button>
            <span className="text-sm font-medium">
              Strona {page} z {totalPages}
            </span>
            <button
              className="px-4 py-2 border rounded hover:bg-gray-50 disabled:opacity-50 text-sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Następna
            </button>
          </div>
        </>
      )}

      {/* Modal potwierdzenia usunięcia */}
      <ConfirmationModal
        isOpen={!!userToDelete}
        onClose={() => setUserToDelete(null)}
        onConfirm={deleteUser}
        isLoading={deleteLoading}
        title="Potwierdź usunięcie"
        confirmText="Usuń"
        confirmVariant="danger"
      >
        <p>Czy na pewno chcesz usunąć użytkownika <strong>{userToDelete?.email}</strong>?</p>
        <p className="text-sm text-gray-500 mt-2">Tej akcji nie można cofnąć.</p>
      </ConfirmationModal>
    </div>
  );
}