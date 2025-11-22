import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { ArrowUpDown, Download } from "lucide-react";
import toast from "react-hot-toast";

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

  // Stan do śledzenia pobierania konkretnego pliku
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

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

  async function load() {
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
      toast.error("Błąd ładowania listy WZ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      setPage(1);
      load();
    }, 300);
    return () => clearTimeout(timeout);
  }, [buyer, status, fromDt, toDt, sortBy, order]);

  useEffect(() => { load(); }, [page]);

  // --- NOWA LOGIKA POBIERANIA ---
  async function downloadPdf(id: number) {
    if (downloadingId === id) return;
    
    setDownloadingId(id);
    const toastId = toast.loading("Generowanie i pobieranie WZ...");

    try {
      // 1. Generowanie PDF (jeśli nie istnieje)
      await api.post(`/warehouse-documents/${id}/pdf`);
      
      // 2. Pobieranie Bloba
      const res = await api.get(`/warehouse-documents/${id}/download`, {
        responseType: 'blob',
      });

      // 3. Tworzenie linku i kliknięcie
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `WZ-${id}.pdf`);
      document.body.appendChild(link);
      link.click();
      
      // Sprzątanie
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success("Dokument WZ pobrany!", { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error("Nie udało się pobrać pliku PDF", { id: toastId });
    } finally {
      setDownloadingId(null);
    }
  }
  // ------------------------------

  async function changeStatus(id: number, status: WzItem["status"]) {
    const toastId = toast.loading("Zmiana statusu...");
    try {
      await api.patch(`/warehouse-documents/${id}/status`, { status });
      setRows((r) => r.map((x) => (x.id === id ? { ...x, status } : x)));
      toast.success("Status zmieniony", { id: toastId });
    } catch {
      toast.error("Nie udało się zmienić statusu", { id: toastId });
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
            className="border px-3 py-2 rounded w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="border px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Wszystkie</option>
            <option value="NEW">Nowy</option>
            <option value="IN_PROGRESS">W trakcie realizacji</option>
            <option value="RELEASED">Wydane</option>
            <option value="CANCELLED">Anulowany</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Data od</label>
          <input
            type="date"
            value={fromDt}
            onChange={(e) => setFromDt(e.target.value)}
            className="border px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Data do</label>
          <input
            type="date"
            value={toDt}
            onChange={(e) => setToDt(e.target.value)}
            className="border px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {error && <div className="text-red-600 mb-2">{error}</div>}
      {loading && <div className="text-gray-500 mb-2">Ładowanie...</div>}

      {/* TABELA */}
      <div className="overflow-x-auto border rounded shadow-sm">
        <table className="min-w-full text-sm bg-white">
          <thead className="bg-gray-100 border-b">
            <tr>
              <th
                className="p-3 border-r cursor-pointer select-none hover:bg-gray-200"
                onClick={() => toggleSort("created_at")}
              >
                <div className="flex items-center gap-1 font-semibold text-gray-700">
                  ID
                  <ArrowUpDown
                    size={14}
                    className={
                      sortBy === "created_at" ? "text-blue-600" : "text-gray-400"
                    }
                  />
                </div>
              </th>
              <th
                className="p-3 border-r cursor-pointer select-none hover:bg-gray-200"
                onClick={() => toggleSort("buyer_name")}
              >
                <div className="flex items-center gap-1 font-semibold text-gray-700">
                  Odbiorca
                  <ArrowUpDown
                    size={14}
                    className={
                      sortBy === "buyer_name" ? "text-blue-600" : "text-gray-400"
                    }
                  />
                </div>
              </th>
              <th
                className="p-3 border-r cursor-pointer select-none hover:bg-gray-200"
                onClick={() => toggleSort("status")}
              >
                <div className="flex items-center gap-1 font-semibold text-gray-700">
                  Status
                  <ArrowUpDown
                    size={14}
                    className={
                      sortBy === "status" ? "text-blue-600" : "text-gray-400"
                    }
                  />
                </div>
              </th>
              <th className="p-3 border-r font-semibold text-gray-700">Data</th>
              <th className="p-3 font-semibold text-center text-gray-700">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b hover:bg-gray-50 transition-colors">
                <td className="p-3 border-r text-gray-900 font-medium">{r.id}</td>
                <td className="p-3 border-r text-gray-800">{r.buyer_name ?? "-"}</td>
                <td className="p-3 border-r">
                  <select
                    className={`border rounded px-2 py-1 text-xs font-medium
                      ${r.status === 'RELEASED' ? 'bg-green-50 text-green-700 border-green-200' : 
                        r.status === 'CANCELLED' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-white'}`}
                    value={r.status}
                    onChange={(e) =>
                      changeStatus(r.id, e.target.value as WzItem["status"])
                    }
                  >
                    <option value="NEW">Nowy</option>
                    <option value="IN_PROGRESS">W trakcie</option>
                    <option value="RELEASED">Wydane</option>
                    <option value="CANCELLED">Anulowany</option>
                  </select>
                </td>
                <td className="p-3 border-r text-gray-600">
                  {new Date(r.created_at).toLocaleString("pl-PL")}
                </td>
                <td className="p-3 text-center">
                  <button
                    onClick={() => downloadPdf(r.id)}
                    disabled={downloadingId === r.id}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 border rounded text-xs font-medium transition-colors
                      ${downloadingId === r.id 
                        ? "bg-gray-100 text-gray-400 cursor-not-allowed" 
                        : "bg-white text-gray-700 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200"
                      }`}
                    title="Pobierz PDF"
                  >
                    <Download size={14} />
                    {downloadingId === r.id ? "Pobieranie..." : "PDF"}
                  </button>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-gray-500">
                  Brak dokumentów spełniających kryteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* PAGINACJA */}
      <div className="mt-4 flex items-center justify-center gap-4">
        <button
          className="border rounded px-4 py-2 hover:bg-gray-100 disabled:opacity-50 disabled:hover:bg-white text-sm"
          disabled={page === 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Poprzednia
        </button>
        <span className="text-sm font-medium">
          Strona {page} z {totalPages}
        </span>
        <button
          className="border rounded px-4 py-2 hover:bg-gray-100 disabled:opacity-50 disabled:hover:bg-white text-sm"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          Następna
        </button>
      </div>
    </div>
  );
}