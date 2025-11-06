import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import { ArrowUpDown } from "lucide-react";

type WzItem = {
  id: number;
  buyer_name: string | null;
  status: "NEW" | "IN_PROGRESS" | "RELEASED" | "CANCELLED";
  created_at: string;
};

export default function WZPage() {
  const [rows, setRows] = useState<WzItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [buyer, setBuyer] = useState("");
  const [status, setStatus] = useState("");
  const [fromDt, setFromDt] = useState("");
  const [toDt, setToDt] = useState("");

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 10;

  const [sortBy, setSortBy] = useState<"created_at" | "status" | "buyer_name">("created_at");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  const toggleSort = (field: typeof sortBy) => {
    if (sortBy === field) setOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    else {
      setSortBy(field);
      setOrder("asc");
    }
  };

  const load = useCallback(async () => {
    if (fromDt && toDt && new Date(toDt) < new Date(fromDt)) {
      setError("Data 'do' nie może być wcześniejsza niż 'od'");
      return;
    }

    try {
      setLoading(true);
      setError("");
      const res = await api.get("/warehouse-documents", {
        params: {
          buyer: buyer || undefined,
          status: status || undefined,
          from_dt: fromDt || undefined,
          to_dt: toDt || undefined,
          page,
          page_size: pageSize,
          sort_by: sortBy,
          order,
        },
      });
      setRows(res.data.items ?? []);
      setTotal(res.data.total ?? 0);
    } catch {
      setError("Nie udało się pobrać dokumentów WZ");
    } finally {
      setLoading(false);
    }
  }, [buyer, status, fromDt, toDt, page, pageSize, sortBy, order]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setPage(1);
      load();
    }, 300);
    return () => clearTimeout(timeout);
  }, [buyer, status, fromDt, toDt, sortBy, order, load]);

  useEffect(() => { load(); }, [page, load]);

  async function genPdf(id: number) {
    await api.post(`/warehouse-documents/${id}/pdf`);
    const base = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
    window.open(`${base}/warehouse-documents/${id}/download`, "_blank");
  }

  async function changeStatus(id: number, status: WzItem["status"]) {
    try {
      await api.patch(`/warehouse-documents/${id}/status`, { status });
      setRows((r) => r.map((x) => (x.id === id ? { ...x, status } : x)));
    } catch {
      setError("Nie udało się zmienić statusu");
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">Wydania zewnętrzne (WZ)</h1>

      {/* FILTRY */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-sm text-gray-700 mb-1">Odbiorca</label>
          <input
            value={buyer}
            onChange={(e) => setBuyer(e.target.value)}
            placeholder="Nazwa odbiorcy"
            className="border px-3 py-2 rounded w-64"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="border px-3 py-2 rounded"
          >
            <option value="">Wszystkie</option>
            <option value="NEW">NEW</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="RELEASED">RELEASED</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Data od</label>
          <input
            type="date"
            value={fromDt}
            onChange={(e) => setFromDt(e.target.value)}
            className="border px-3 py-2 rounded"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Data do</label>
          <input
            type="date"
            value={toDt}
            onChange={(e) => setToDt(e.target.value)}
            className="border px-3 py-2 rounded"
          />
        </div>
      </div>

      {error && <div className="text-red-600 mb-2">{error}</div>}
      {loading && <div>Ładowanie…</div>}

      {/* TABELA */}
      <div className="overflow-x-auto border rounded">
        <table className="min-w-full text-sm bg-white">
          <thead className="bg-gray-100">
            <tr>
              <th
                className="p-2 border cursor-pointer"
                onClick={() => toggleSort("created_at")}
              >
                <div className="flex items-center gap-1 justify-center">
                  ID
                  <ArrowUpDown
                    size={16}
                    className={
                      sortBy === "created_at"
                        ? order === "asc"
                          ? "rotate-180 text-black"
                          : "text-black"
                        : "text-gray-400"
                    }
                  />
                </div>
              </th>
              <th
                className="p-2 border cursor-pointer"
                onClick={() => toggleSort("buyer_name")}
              >
                <div className="flex items-center gap-1 justify-center">
                  Odbiorca
                  <ArrowUpDown
                    size={16}
                    className={
                      sortBy === "buyer_name"
                        ? order === "asc"
                          ? "rotate-180 text-black"
                          : "text-black"
                        : "text-gray-400"
                    }
                  />
                </div>
              </th>
              <th
                className="p-2 border cursor-pointer"
                onClick={() => toggleSort("status")}
              >
                <div className="flex items-center gap-1 justify-center">
                  Status
                  <ArrowUpDown
                    size={16}
                    className={
                      sortBy === "status"
                        ? order === "asc"
                          ? "rotate-180 text-black"
                          : "text-black"
                        : "text-gray-400"
                    }
                  />
                </div>
              </th>
              <th className="p-2 border">Data</th>
              <th className="p-2 border">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="p-2 border">{r.id}</td>
                <td className="p-2 border">{r.buyer_name ?? "-"}</td>
                <td className="p-2 border">
                  <select
                    className="border rounded px-2 py-1"
                    value={r.status}
                    onChange={(e) =>
                      changeStatus(r.id, e.target.value as WzItem["status"])
                    }
                  >
                    <option value="NEW">NEW</option>
                    <option value="IN_PROGRESS">IN_PROGRESS</option>
                    <option value="RELEASED">RELEASED</option>
                    <option value="CANCELLED">CANCELLED</option>
                  </select>
                </td>
                <td className="p-2 border">
                  {new Date(r.created_at).toLocaleString()}
                </td>
                <td className="p-2 border text-center">
                  <button
                    className="px-2 py-1 border rounded"
                    onClick={() => genPdf(r.id)}
                  >
                    PDF
                  </button>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-gray-500">
                  Brak danych
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* PAGINACJA */}
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
    </div>
  );
}
