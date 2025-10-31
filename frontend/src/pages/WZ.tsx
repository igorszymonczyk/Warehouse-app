import { useEffect, useState } from "react";
import { api } from "../lib/api";

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

  // paginacja
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [total, setTotal] = useState(0);

  async function load() {
    try {
      setLoading(true);
      setError("");
      const res = await api.get("/warehouse-documents", {
        params: { page, page_size: pageSize },
      });
      setRows(res.data.items ?? []);
      setTotal(res.data.total ?? 0);
    } catch {
      setError("Nie udało się pobrać WZ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [page]);

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
      // nic – prosto i szybko; można dorobić toast
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">Wydania zewnętrzne (WZ)</h1>

      {loading && <div>Ładowanie…</div>}
      {error && <div className="text-red-600 mb-2">{error}</div>}

      <table className="min-w-full text-sm border">
        <thead className="bg-gray-100">
          <tr>
            <th className="p-2 border">ID</th>
            <th className="p-2 border">Odbiorca</th>
            <th className="p-2 border">Status</th>
            <th className="p-2 border">Utworzono</th>
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
              <td className="p-2 border">
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
              <td className="p-2 border" colSpan={5}>
                Brak danych
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Paginacja */}
      <div className="mt-4 flex items-center gap-3">
        <button
          className="border rounded px-3 py-1 disabled:opacity-50"
          disabled={page === 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Prev
        </button>
        <span>
          Strona {page} / {Math.max(1, Math.ceil(total / pageSize))}
        </span>
        <button
          className="border rounded px-3 py-1 disabled:opacity-50"
          disabled={page * pageSize >= total}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
