import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { ArrowUp, ArrowDown } from "lucide-react";

type User = {
  id: number;
  email: string;
  role: string;
};

type PaginatedUsers = {
  items: User[];
  total: number;
  page: number;
  page_size: number;
};

type SortKey = "id" | "email" | "role";
type SortOrder = "asc" | "desc";

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [filtered, setFiltered] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Filtry
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  // Sortowanie
  const [sortKey, setSortKey] = useState<SortKey>("id");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<PaginatedUsers>("/users", {
        params: { page, page_size: pageSize },
      });
      setUsers(res.data.items);
      setFiltered(res.data.items);
      setTotal(res.data.total);
    } catch (err) {
      console.error(err);
      setError("Nie udało się pobrać użytkowników");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [page]);

  // 🔍 Filtrowanie + sortowanie
  useEffect(() => {
    let data = [...users];

    if (roleFilter !== "all") {
      data = data.filter((u) => u.role === roleFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter((u) => u.email.toLowerCase().includes(q));
    }

    // Sortowanie
    data.sort((a, b) => {
      const dir = sortOrder === "asc" ? 1 : -1;
      if (sortKey === "id") return (a.id - b.id) * dir;
      return a[sortKey].localeCompare(b[sortKey]) * dir;
    });

    setFiltered(data);
  }, [users, search, roleFilter, sortKey, sortOrder]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
  };

  const changeRole = async (id: number, newRole: string) => {
    if (!window.confirm(`Czy na pewno zmienić rolę użytkownika na "${newRole}"?`)) return;
    try {
      await api.put(`/users/${id}/role`, { role: newRole });
      load();
    } catch (err) {
      console.error(err);
      alert("Błąd przy zmianie roli użytkownika");
    }
  };

  const deleteUser = async (id: number) => {
    if (!window.confirm("Czy na pewno chcesz usunąć to konto?")) return;
    try {
      await api.delete(`/users/${id}`);
      load();
    } catch (err) {
      console.error(err);
      alert("Błąd przy usuwaniu użytkownika");
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) return <span className="opacity-30">↕</span>;
    return sortOrder === "asc" ? (
      <ArrowUp size={14} className="inline ml-1" />
    ) : (
      <ArrowDown size={14} className="inline ml-1" />
    );
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Zarządzanie użytkownikami</h1>

      {/* 🔹 Filtry */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Szukaj po e-mailu..."
          className="border rounded px-3 py-2 w-64"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          className="border rounded px-3 py-2"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="all">Wszystkie role</option>
          <option value="customer">customer</option>
          <option value="salesman">salesman</option>
          <option value="admin">admin</option>
        </select>
      </div>

      {loading && <p>Ładowanie danych...</p>}
      {error && <p className="text-red-500">{error}</p>}

      {!loading && !error && (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full border bg-white text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th
                    className="p-2 border text-left cursor-pointer select-none"
                    onClick={() => toggleSort("id")}
                  >
                    ID {renderSortIcon("id")}
                  </th>
                  <th
                    className="p-2 border text-left cursor-pointer select-none"
                    onClick={() => toggleSort("email")}
                  >
                    Email {renderSortIcon("email")}
                  </th>
                  <th
                    className="p-2 border text-left cursor-pointer select-none"
                    onClick={() => toggleSort("role")}
                  >
                    Rola {renderSortIcon("role")}
                  </th>
                  <th className="p-2 border text-center">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length > 0 ? (
                  filtered.map((u) => (
                    <tr key={u.id} className="border-t hover:bg-gray-50">
                      <td className="p-2 border">{u.id}</td>
                      <td className="p-2 border">{u.email}</td>
                      <td className="p-2 border">{u.role}</td>
                      <td className="p-2 border text-center flex justify-center gap-2">
                        <select
                          value={u.role}
                          onChange={(e) => changeRole(u.id, e.target.value)}
                          className="border px-2 py-1 rounded"
                        >
                          <option value="customer">customer</option>
                          <option value="salesman">salesman</option>
                          <option value="admin">admin</option>
                        </select>
                        <button
                          onClick={() => deleteUser(u.id)}
                          className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                        >
                          Usuń
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-gray-500">
                      Brak użytkowników
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 🔹 Paginacja */}
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
    </div>
  );
}
