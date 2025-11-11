// frontend/src/pages/Users.tsx
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { ArrowUpDown, Trash2 } from "lucide-react"; // Dodałem Trash2
import toast from "react-hot-toast"; // 1. ZMIANA: Import toast
import ConfirmationModal from "../components/ConfirmationModal"; // 2. ZMIANA: Import modala

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

// Pomocnicza funkcja do walidacji roli (na wszelki wypadek)
const isValidRole = (role: string): role is "admin" | "salesman" | "customer" => {
  return ["admin", "salesman", "customer"].includes(role);
}

export default function UsersPage() {
  const [data, setData] = useState<PaginatedUsers | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 3. ZMIANA: Stany dla modala usuwania
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // 🔹 Filtry i sortowanie
  const [q, setQ] = useState("");
  const [role, setRole] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<"id" | "email" | "role">("id");
  const [order, setOrder] = useState<"asc" | "desc">("asc");

  const pageSize = 10;

  // Pobieranie danych
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get<PaginatedUsers>("/users", {
        params: {
          q: q || undefined,
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
      toast.error("Nie udało się pobrać użytkowników"); // ZMIANA
    } finally {
      setLoading(false);
    }
  };

  // Debounce wyszukiwania
  useEffect(() => {
    const timeout = setTimeout(() => {
      setPage(1);
      load();
    }, 300);
    return () => clearTimeout(timeout);
  }, [q, role, sortBy, order]);

  // Zmiana strony
  useEffect(() => {
    load();
  }, [page]);

  // Sortowanie kolumn
  const toggleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setOrder("asc");
    }
  };

  // 4. ZMIANA: Zmiana roli z toastami
  const changeRole = async (id: number, newRole: string) => {
    if (!isValidRole(newRole)) {
      toast.error("Nieznana rola");
      return;
    }

    // Proste 'confirm' jest tutaj OK dla <select>
    if (!window.confirm(`Czy na pewno zmienić rolę użytkownika na "${newRole}"?`)) {
       // Jeśli anulujemy, musimy przeładować dane, aby <select> wrócił do poprzedniej wartości
       load(); 
       return;
    }
    
    try {
      await api.put(`/users/${id}/role`, { role: newRole });
      toast.success("Rola została zaktualizowana!");
      load(); // Przeładuj listę
    } catch {
      toast.error("Błąd przy zmianie roli użytkownika");
    }
  };

  // 5. ZMIANA: Usuwanie użytkownika z modalem i toastami
  const deleteUser = async () => {
    if (!userToDelete) return;

    setDeleteLoading(true);
    try {
      await api.delete(`/users/${userToDelete.id}`);
      toast.success(`Użytkownik ${userToDelete.email} usunięty!`);
      setUserToDelete(null);
      load(); // Przeładuj listę
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

      {/* 🔹 Filtry (bez zmian) */}
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
        <div>
          <label className="block text-sm text-gray-700 mb-1">Rola</label>
          <select
            value={role || ""}
            onChange={(e) => setRole(e.target.value || undefined)}
            className="border px-3 py-2 rounded"
          >
            <option value="">Wszystkie</option>
            <option value="customer">customer</option>
            <option value="salesman">salesman</option>
            <option value="admin">admin</option>
          </select>
        </div>
      </div>

      {loading && <p>Ładowanie…</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && data && (
        <>
          <div className="overflow-x-auto border rounded">
            <table className="min-w-full bg-white text-sm">
              <thead className="bg-gray-100">
                {/* ... (Nagłówki tabeli bez zmian) ... */}
                <tr>
                  <th
                    className="p-2 border text-left cursor-pointer select-none"
                    onClick={() => toggleSort("id")}
                  >
                    <div className="flex items-center gap-1">
                      ID
                      <ArrowUpDown
                        size={16}
                        className={
                          sortBy === "id"
                            ? order === "asc"
                              ? "rotate-180 text-black"
                              : "text-black"
                            : "text-gray-400"
                        }
                      />
                    </div>
                  </th>
                  <th
                    className="p-2 border text-left cursor-pointer select-none"
                    onClick={() => toggleSort("email")}
                  >
                    <div className="flex items-center gap-1">
                      Email
                      <ArrowUpDown
                        size={16}
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
                    className="p-2 border text-left cursor-pointer select-none"
                    onClick={() => toggleSort("role")}
                  >
                    <div className="flex items-center gap-1">
                      Rola
                      <ArrowUpDown
                        size={16}
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
                  <th className="p-2 border text-center">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((u) => (
                  <tr key={u.id} className="border-t hover:bg-gray-50">
                    <td className="p-2 border">{u.id}</td>
                    <td className="p-2 border">{u.email}</td>
                    <td className="p-2 border">{u.role}</td>
                    
                    {/* 6. ZMIANA: Aktualizacja sekcji Akcje */}
                    <td className="p-2 border text-center">
                      <div className="flex justify-center gap-2">
                        <select
                          value={u.role}
                          onChange={(e) => changeRole(u.id, e.target.value)}
                          // Zatrzymujemy propagację, aby kliknięcie nie robiło nic innego
                          onClick={(e) => e.stopPropagation()} 
                          className="border px-2 py-1 rounded"
                        >
                          <option value="customer">customer</option>
                          <option value="salesman">salesman</option>
                          <option value="admin">admin</option>
                        </select>
                        <button
                          onClick={(e) => {
                             e.stopPropagation(); // Zatrzymujemy propagację
                             setUserToDelete(u);
                          }}
                          className="px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {data.items.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-gray-500">
                      Brak użytkowników
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Paginacja (bez zmian) */}
          <div className="mt-4 flex items-center gap-3">
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

      {/* 7. ZMIANA: Dodanie modala potwierdzającego */}
      <ConfirmationModal
        isOpen={!!userToDelete}
        onClose={() => setUserToDelete(null)}
        onConfirm={deleteUser}
        isLoading={deleteLoading}
        title="Potwierdź usunięcie"
        confirmText="Usuń"
        confirmVariant="danger"
      >
        <p>Czy na pewno chcesz usunąć użytkownika?</p>
        <p className="font-semibold mt-2">{userToDelete?.email}</p>
        <p className="text-sm text-gray-600">Tej akcji nie można cofnąć.</p>
      </ConfirmationModal>
    </div>
  );
}