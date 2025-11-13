import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { ArrowUpDown } from "lucide-react";
import type { Invoice, Page } from "../lib/types";

export default function InvoicesPage() {
  const [data, setData] = useState<Page<Invoice> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dateError, setDateError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<"id" | "created_at" | "buyer_name" | "total_gross">("created_at");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  const pageSize = 10;
  const navigate = useNavigate();

  // ======================
  // Pobieranie faktur
  // ======================
  const load = async () => {
    if (dateError) return;
    setLoading(true);
    setError(null);

    try {
      const res = await api.get<Page<Invoice>>("/invoices", {
        params: {
          q: q || undefined,
          page,
          page_size: pageSize,
          sort_by: sortBy === "id" ? "created_at" : sortBy,
          order,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
        },
      });
      setData(res.data);
    } catch (err: any) {
      console.error("Błąd przy pobieraniu faktur:", err);
      setError("Nie udało się pobrać listy faktur.");
    } finally {
      setLoading(false);
    }
  };

  // ======================
  // Walidacja dat
  // ======================
  useEffect(() => {
    if (dateFrom && dateTo && new Date(dateTo) < new Date(dateFrom)) {
      setDateError("Data 'do' nie może być wcześniejsza niż 'od'");
    } else {
      setDateError(null);
    }
  }, [dateFrom, dateTo]);

  // ======================
  // Debounce wyszukiwania
  // ======================
  useEffect(() => {
    const timeout = setTimeout(() => {
      setPage(1);
      if (!dateError) load();
    }, 300);
    return () => clearTimeout(timeout);
  }, [q, dateFrom, dateTo, sortBy, order]);

  // ======================
  // Zmiana strony
  // ======================
  useEffect(() => {
    if (!dateError) load();
  }, [page]);

  // ======================
  // Sortowanie
  // ======================
  const toggleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setOrder("asc");
    }
  };

  // ======================
  // Pobieranie PDF
  // ======================
  const downloadPdf = async (id: number) => {
    try {
      await api.post(`/invoices/${id}/pdf`);
      const base = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
      window.open(`${base}/invoices/${id}/download`, "_blank");
    } catch (err) {
      console.error("Błąd generowania PDF:", err);
      alert("Nie udało się wygenerować pliku PDF.");
    }
  };

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));

  // ======================
  // Render
  // ======================
  return (
    <div className="p-6">
      {/* Nagłówek */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">Faktury</h1>
        <button
          onClick={() => navigate("/invoices/create")}
          className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 transition"
        >
          + Nowa faktura
        </button>
      </div>

      {/* Wyszukiwanie i filtry */}
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div>
          <label className="block text-sm text-gray-700 mb-1">Szukaj klienta / NIP</label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nazwa klienta lub NIP"
            className="border px-3 py-2 rounded w-64"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Data od</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border px-3 py-2 rounded"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Data do</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className={`border px-3 py-2 rounded ${dateError ? "border-red-500" : ""}`}
          />
        </div>
        {dateError && <p className="text-red-600 text-sm font-medium">{dateError}</p>}
      </div>

      {/* Stan ładowania / błędu */}
      {loading && <p>Ładowanie danych...</p>}
      {error && <p className="text-red-600">{error}</p>}

      {/* Tabela faktur */}
      {!loading && data && (
        <>
          <div className="overflow-x-auto border rounded">
            <table className="min-w-full bg-white text-sm">
              <thead className="bg-gray-100">
                <tr>
                  {[
                    { key: "id", label: "ID" },
                    { key: "created_at", label: "Data" },
                    { key: "buyer_name", label: "Klient" },
                    { key: "total_gross", label: "Wartość brutto" },
                  ].map((col) => (
                    <th
                      key={col.key}
                      className={`p-2 border ${col.key === "total_gross" ? "text-right" : "text-left"} cursor-pointer select-none`}
                      onClick={() => toggleSort(col.key as typeof sortBy)}
                    >
                      <div
                        className={`flex ${
                          col.key === "total_gross" ? "justify-end" : "justify-start"
                        } items-center gap-1`}
                      >
                        {col.label}
                        <ArrowUpDown
                          size={16}
                          className={
                            sortBy === col.key
                              ? order === "asc"
                                ? "rotate-180 text-black"
                                : "text-black"
                              : "text-gray-400"
                          }
                        />
                      </div>
                    </th>
                  ))}
                  <th className="p-2 border text-center">PDF</th>
                </tr>
              </thead>

              <tbody>
                {data.items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-gray-500">
                      Brak danych
                    </td>
                  </tr>
                ) : (
                  data.items.map((inv) => (
                    <tr
                      key={inv.id}
                      className="border-t hover:bg-gray-50 cursor-pointer transition"
                      onClick={() => navigate(`/invoices/${inv.id}`)}
                    >
                      <td className="p-2 border">{inv.id}</td>
                      <td className="p-2 border">{new Date(inv.created_at).toLocaleString()}</td>
                      <td className="p-2 border">{inv.buyer_name}</td>
                      <td className="p-2 border text-right">{inv.total_gross.toFixed(2)} zł</td>
                      <td
                        className="p-2 border text-center"
                        onClick={(e) => {
                          e.stopPropagation(); // nie przechodź do szczegółów po kliknięciu PDF
                          downloadPdf(inv.id);
                        }}
                      >
                        <button className="px-2 py-1 border rounded hover:bg-gray-100">PDF</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

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
