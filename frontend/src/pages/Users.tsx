import { useEffect, useState } from "react";
import { api } from "../lib/api";

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

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const pageSize = 10;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<PaginatedUsers>("/admin/users", {
        params: { page, page_size: pageSize },
      });
      setUsers(res.data.items);
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

  const changeRole = async (id: number, newRole: string) => {
    if (!window.confirm(`Czy na pewno zmienić rolę użytkownika na "${newRole}"?`)) return;
    try {
      await api.put(`/admin/users/${id}/role`, { role: newRole });
      load();
    } catch (err) {
      console.error(err);
      alert("Błąd przy zmianie roli użytkownika");
    }
  };

  const deleteUser = async (id: number) => {
    if (!window.confirm("Czy na pewno chcesz usunąć to konto?")) return;
    try {
      await api.delete(`/admin/users/${id}`);
      load();
    } catch (err) {
      console.error(err);
      alert("Błąd przy usuwaniu użytkownika");
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Zarządzanie użytkownikami</h1>

      {loading && <p>Ładowanie danych...</p>}
      {error && <p className="text-red-500">{error}</p>}

      {!loading && !error && (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full border bg-white text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-2 border text-left">ID</th>
                  <th className="p-2 border text-left">Email</th>
                  <th className="p-2 border text-left">Rola</th>
                  <th className="p-2 border text-center">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {users.length > 0 ? (
                  users.map((u) => (
                    <tr key={u.id} className="border-t">
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

          {/* Paginacja */}
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
