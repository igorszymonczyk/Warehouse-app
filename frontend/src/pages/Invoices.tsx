import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { ArrowUpDown, Download } from "lucide-react"; // Dodałem ikonę Download
import toast from "react-hot-toast"; // Dodany toast
import type { Invoice, Page } from "../lib/types";

export default function InvoicesPage() {
  const [data, setData] = useState<Page<Invoice> | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Stan do śledzenia, która faktura jest aktualnie pobierana (by zablokować przycisk)
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dateError, setDateError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<"id" | "created_at" | "buyer_name" | "total_gross">("created_at");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  const pageSize = 10;
  const navigate = useNavigate();

  // Główne ładowanie danych
  const load = async () => {
    if (dateError) return;
    setLoading(true);
    try {
      const res = await api.get<Page<Invoice>>("/invoices", {
        params: {
          q: q || undefined,
          page,
          page_size: pageSize,
          sort_by: sortBy,
          order,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
        },
      });
      setData(res.data);
    } catch (err) {
      console.error("Błąd przy pobieraniu faktur:", err);
      toast.error("Nie udało się załadować listy faktur");
    } finally {
      setLoading(false);
    }
  };

  // Walidacja dat
  useEffect(() => {
    if (dateFrom && dateTo && new Date(dateTo) < new Date(dateFrom)) {
      setDateError("Data 'do' nie może być wcześniejsza niż 'od'");
    } else {
      setDateError(null);
    }
  }, [dateFrom, dateTo]);

  // Debounce wyszukiwania i filtrów
  useEffect(() => {
    const timeout = setTimeout(() => {
      setPage(1);
      if (!dateError) load();
    }, 300);
    return () => clearTimeout(timeout);
  }, [q, dateFrom, dateTo, sortBy, order]);

  // Ładowanie przy zmianie strony
  useEffect(() => {
    if (!dateError) load();
  }, [page]);

  const toggleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setOrder("asc");
    }
  };

  // --- NOWA LOGIKA POBIERANIA (Zgodna z MyInvoicesPage) ---
  const downloadPdf = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation(); // Zapobiegamy nawigacji do szczegółów przy kliknięciu w przycisk
    
    if (downloadingId === id) return; // Zabezpieczenie przed dwuklikiem
    
    setDownloadingId(id);
    const toastId = toast.loading("Generowanie i pobieranie PDF...");

    try {
      // 1. Wygeneruj PDF (POST)
      await api.post(`/invoices/${id}/pdf`);

      // 2. Pobierz PDF jako Blob (GET)
      const res = await api.get(`/invoices/${id}/download`, {
        responseType: 'blob', // Kluczowe dla poprawnego pobrania pliku
      });

      // 3. Utwórz link w DOM i wymuś pobranie
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Faktura-INV-${id}.pdf`);
      document.body.appendChild(link);
      link.click();
      
      // Sprzątanie
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success("PDF pobrany!", { id: toastId });

    } catch (err) {
      console.error(err);
      toast.error("Błąd pobierania PDF", { id: toastId });
    } finally {
      setDownloadingId(null);
    }
  };
  // --------------------------------------------------------

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));

  return (
    <div className="p-6">
      {/* Nagłówek */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Faktury</h1>
        <button
          onClick={() => navigate("/invoices/create")}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-gray-800 transition-colors"
        >
          Dodaj fakturę
        </button>
      </div>

      {/*  Wyszukiwanie + filtry dat */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-sm text-gray-700 mb-1">Szukaj klienta / NIP</label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nazwa klienta lub NIP"
            className="border px-3 py-2 rounded w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Data od</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Data do</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className={`border px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 ${dateError ? "border-red-500" : ""}`}
          />
        </div>
        {dateError && (
          <div className="text-red-600 text-sm font-medium">{dateError}</div>
        )}
      </div>

      {loading && <p className="text-gray-500">Ładowanie danych...</p>}

      {!loading && data && (
        <>
          <div className="overflow-x-auto border rounded shadow-sm">
            <table className="min-w-full bg-white text-sm">
              <thead className="bg-gray-100 border-b">
                <tr>
                  <th
                    className="p-3 border-r text-left cursor-pointer select-none hover:bg-gray-200"
                    onClick={() => toggleSort("id")}
                  >
                     <div className="flex items-center gap-1 font-semibold text-gray-700">
                      ID
                       <ArrowUpDown
                        size={14}
                        className={
                          sortBy === "id" ? "text-blue-600" : "text-gray-400"
                        }
                      />
                    </div>
                  </th>
                  <th
                    className="p-3 border-r text-left cursor-pointer select-none hover:bg-gray-200"
                    onClick={() => toggleSort("created_at")}
                  >
                    <div className="flex items-center gap-1 font-semibold text-gray-700">
                      Data
                      <ArrowUpDown
                        size={14}
                        className={
                          sortBy === "created_at" ? "text-blue-600" : "text-gray-400"
                        }
                      />
                    </div>
                  </th>
                  <th
                    className="p-3 border-r text-left cursor-pointer select-none hover:bg-gray-200"
                    onClick={() => toggleSort("buyer_name")}
                  >
                    <div className="flex items-center gap-1 font-semibold text-gray-700">
                      Klient
                      <ArrowUpDown
                        size={14}
                        className={
                          sortBy === "buyer_name" ? "text-blue-600" : "text-gray-400"
                        }
                      />
                    </div>
                  </th>
                  <th
                    className="p-3 border-r text-right cursor-pointer select-none hover:bg-gray-200"
                    onClick={() => toggleSort("total_gross")}
                  >
                    <div className="flex items-center justify-end gap-1 font-semibold text-gray-700">
                      Wartość brutto
                      <ArrowUpDown
                        size={14}
                        className={
                          sortBy === "total_gross" ? "text-blue-600" : "text-gray-400"
                        }
                      />
                    </div>
                  </th>
                  <th className="p-3 text-center font-semibold text-gray-700">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((inv) => (
                  <tr 
                    key={inv.id} 
                    className="border-b hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/invoices/${inv.id}`)}
                  >
                    <td className="p-3 border-r text-gray-900 font-medium">{inv.id}</td>
                    <td className="p-3 border-r text-gray-600">{new Date(inv.created_at).toLocaleString("pl-PL")}</td>
                    <td className="p-3 border-r text-gray-800">{inv.buyer_name}</td>
                    <td className="p-3 border-r text-right font-medium text-gray-900">
                      {inv.total_gross.toFixed(2)} zł
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={(e) => downloadPdf(inv.id, e)}
                        disabled={downloadingId === inv.id}
                        className={`inline-flex items-center gap-1 px-3 py-1.5 border rounded text-xs font-medium transition-colors
                          ${downloadingId === inv.id 
                            ? "bg-gray-100 text-gray-400 cursor-not-allowed" 
                            : "bg-white text-gray-700 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200"
                          }`}
                        title="Pobierz PDF"
                      >
                        <Download size={14} />
                        {downloadingId === inv.id ? "Pobieranie..." : "PDF"}
                      </button>
                    </td>
                  </tr>
                ))}
                {data.items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-500">
                      Brak faktur spełniających kryteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Paginacja */}
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
        </>
      )}
    </div>
  );
}