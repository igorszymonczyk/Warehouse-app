import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import { ArrowUpDown, ArrowLeft, Loader2, Download } from "lucide-react"; 
import { useSearchParams } from "react-router-dom"; 
import toast from "react-hot-toast";

// === TYPY DANYCH WZ Z BACKENDU ===
type WZStatus = "NEW" | "IN_PROGRESS" | "RELEASED" | "CANCELLED";

type WzProductItem = {
  product_name: string;
  product_code: string;
  quantity: number;
  location?: string;
};

type WZDetail = {
  id: number;
  invoice_id?: number;
  buyer_name: string;
  status: WZStatus;
  created_at: string;
  items: WzProductItem[];
};

type WzItem = {
  id: number;
  buyer_name: string | null;
  status: WZStatus;
  created_at: string;
};

type PaginatedWz = {
  items: WzItem[];
  total: number;
  page: number;
  page_size: number;
};

// === KOMPONENT SZCZEGÓŁÓW (WZDetailView) ===
function WZDetailView({ docId, onBack, onChangeStatus }: { docId: number, onBack: () => void, onChangeStatus: (id: number, status: WZStatus) => Promise<void> }) {
    const [detail, setDetail] = useState<WZDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchDetail = useCallback(async () => {
        try {
            setLoading(true);
            const res = await api.get<WZDetail>(`/warehouse-documents/${docId}`);
            setDetail(res.data);
            setError(null);
        } catch (err) {
            console.error(err);
            setError("Nie udało się pobrać szczegółów WZ.");
            toast.error("Błąd ładowania szczegółów dokumentu.");
        } finally {
            setLoading(false);
        }
    }, [docId]);

    useEffect(() => {
        fetchDetail();
    }, [fetchDetail]);
    
    const handleStatusChange = async (newStatus: WZStatus) => {
        await onChangeStatus(docId, newStatus);
        fetchDetail();
    };

    if (loading) return <div className="p-6 text-center"><Loader2 className="animate-spin inline mr-2" size={20} /> Ładowanie szczegółów WZ #{docId}...</div>;
    if (error) return <div className="text-red-600 mb-4">{error}</div>;
    if (!detail) return null;
    
    const isEditable = detail.status === 'NEW' || detail.status === 'IN_PROGRESS';

    return (
        <div className="p-6 bg-white shadow-lg rounded-lg">
            <button onClick={onBack} className="flex items-center text-blue-600 hover:underline mb-4">
                <ArrowLeft size={16} className="mr-2" /> Wróć do listy
            </button>
            <div className="flex justify-between items-start border-b pb-4 mb-4">
                <h1 className="text-2xl font-bold">Szczegóły Wydania WZ-{detail.id}</h1>
                 <span className={`px-3 py-1 rounded-full text-sm font-bold 
                        ${detail.status === 'RELEASED' ? 'bg-green-100 text-green-800' : 
                          detail.status === 'CANCELLED' ? 'bg-red-100 text-red-800' : 
                          'bg-yellow-100 text-yellow-800'}
                    `}>
                        {detail.status}
                </span>
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-sm mb-6 bg-gray-50 p-4 rounded">
                <div>
                    <p className="text-gray-500">Odbiorca:</p>
                    <p className="font-semibold text-lg">{detail.buyer_name}</p>
                </div>
                <div>
                    <p className="text-gray-500">Data Utworzenia:</p>
                    <p className="font-semibold">{new Date(detail.created_at).toLocaleString()}</p>
                </div>
                <div>
                    <p className="text-gray-500">ID Faktury powiązanej:</p>
                    <p className="font-semibold">{detail.invoice_id ? `INV-${detail.invoice_id}` : 'Brak (Utworzono z Zamówienia)'}</p>
                </div>
            </div>

            {/* Panel Akcji Magazyniera */}
            <div className="mb-6 flex gap-3">
                {detail.status === 'NEW' && (
                    <button 
                        onClick={() => handleStatusChange('IN_PROGRESS')}
                        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition shadow"
                    >
                        Rozpocznij kompletację
                    </button>
                )}
                {detail.status === 'IN_PROGRESS' && (
                    <button 
                        onClick={() => handleStatusChange('RELEASED')}
                        className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition shadow"
                    >
                        Wydaj towar (Zakończ)
                    </button>
                )}
                {isEditable && (
                    <button 
                        onClick={() => handleStatusChange('CANCELLED')}
                        className="bg-red-100 text-red-700 border border-red-200 px-4 py-2 rounded hover:bg-red-200 transition ml-auto"
                    >
                        Anuluj dokument
                    </button>
                )}
            </div>

            <h2 className="text-xl font-semibold mb-3">Lista Produktów do Wydania</h2>
            <table className="w-full text-sm border rounded-lg overflow-hidden">
                <thead className="bg-gray-100">
                    <tr>
                        <th className="p-3 text-left font-semibold">Nazwa Produktu</th>
                        <th className="p-3 text-left font-semibold">Kod</th>
                        <th className="p-3 text-right font-semibold">Ilość</th>
                        <th className="p-3 text-right font-semibold">Lokalizacja</th>
                    </tr>
                </thead>
                <tbody>
                    {detail.items.map((item, index) => (
                        <tr key={index} className="border-t hover:bg-gray-50">
                            <td className="p-3">{item.product_name}</td>
                            <td className="p-3 text-gray-600 font-mono">{item.product_code}</td>
                            <td className="p-3 text-right font-bold text-lg">{item.quantity}</td>
                            <td className="p-3 text-right font-medium text-blue-700">{item.location || '-'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// === GŁÓWNY KOMPONENT ===
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
  
  // Obsługa widoku szczegółów z URL
  const [searchParams, setSearchParams] = useSearchParams();
  const docIdParam = searchParams.get('doc_id');
  const currentDocId = docIdParam ? parseInt(docIdParam, 10) : null;
  
  const handleViewDetail = useCallback((id: number) => {
      setSearchParams({ doc_id: String(id) });
  }, [setSearchParams]);
  
  const handleCloseDetail = useCallback(() => {
      setSearchParams({});
  }, [setSearchParams]);

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

    // Nie ładujemy listy, jeśli jesteśmy w widoku szczegółów
    if (currentDocId) return; 

    try {
      setLoading(true);
      setError("");
      const res = await api.get<PaginatedWz>("/warehouse-documents", {
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
  }, [buyer, status, fromDt, toDt, sortBy, order, page, currentDocId]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setPage(1);
      load();
    }, 300);
    return () => clearTimeout(timeout);
  }, [buyer, status, fromDt, toDt, sortBy, order]);

  useEffect(() => { load(); }, [page]);
  
  const changeStatus = async (id: number, newStatus: WZStatus) => {
    try {
      await api.patch(`/warehouse-documents/${id}/status`, { status: newStatus });
      toast.success(`Status WZ ${id} zmieniony na ${newStatus}`);
      setRows((r) => r.map((x) => (x.id === id ? { ...x, status: newStatus } : x)));
    } catch {
      toast.error("Nie udało się zmienić statusu");
      throw new Error("Błąd"); 
    }
  };

  // --- POPRAWIONA FUNKCJA POBIERANIA (BLOB + TOAST) ---
  const downloadPdf = async (id: number) => {
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
  };
  // ----------------------------------------------------

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  
  // WARUNKOWY RENDER: Jeśli mamy doc_id w URL, pokaż szczegóły
  if (currentDocId) {
      return <WZDetailView docId={currentDocId} onBack={handleCloseDetail} onChangeStatus={changeStatus} />;
  }

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
      {loading && <div>Ładowanie...</div>}

      {/* TABELA */}
      <div className="overflow-x-auto border rounded shadow-sm">
        <table className="min-w-full text-sm bg-white">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-3 border-r cursor-pointer select-none hover:bg-gray-200" onClick={() => toggleSort("created_at")}>
                <div className="flex items-center gap-1 font-semibold text-gray-700">
                    ID
                    <ArrowUpDown size={14} className={sortBy === "created_at" ? "text-blue-600" : "text-gray-400"}/>
                </div>
              </th>
              <th className="p-3 border-r cursor-pointer select-none hover:bg-gray-200" onClick={() => toggleSort("buyer_name")}>
                <div className="flex items-center gap-1 font-semibold text-gray-700">
                    Odbiorca 
                    <ArrowUpDown size={14} className={sortBy === "buyer_name" ? "text-blue-600" : "text-gray-400"}/>
                </div>
              </th>
              <th className="p-3 border-r cursor-pointer select-none hover:bg-gray-200" onClick={() => toggleSort("status")}>
                <div className="flex items-center gap-1 font-semibold text-gray-700">
                    Status 
                    <ArrowUpDown size={14} className={sortBy === "status" ? "text-blue-600" : "text-gray-400"}/>
                </div>
              </th>
              <th className="p-3 border-r font-semibold text-gray-700">Data</th>
              <th className="p-3 font-semibold text-center text-gray-700">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50 border-b transition-colors">
                <td 
                    className="p-3 border-r text-blue-600 cursor-pointer hover:underline font-medium" 
                    onClick={() => handleViewDetail(r.id)}
                >
                    WZ-{r.id}
                </td>
                <td className="p-3 border-r text-gray-800">{r.buyer_name ?? "-"}</td>
                <td className="p-3 border-r">
                  <select
                    className={`border rounded px-2 py-1 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500
                        ${r.status === 'RELEASED' ? 'bg-green-50 text-green-700 border-green-200' : ''}
                        ${r.status === 'NEW' ? 'bg-blue-50 text-blue-700 border-blue-200' : ''}
                        ${r.status === 'CANCELLED' ? 'bg-red-50 text-red-700 border-red-200' : ''}
                        ${r.status === 'IN_PROGRESS' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : ''}
                    `}
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
                <td className="p-3 border-r text-center">
                    {/* ZAKTUALIZOWANY PRZYCISK POBIERANIA */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            downloadPdf(r.id);
                        }}
                        disabled={downloadingId === r.id}
                        className={`inline-flex items-center gap-1 px-3 py-1.5 border rounded text-xs font-medium transition-colors
                            ${downloadingId === r.id 
                            ? "bg-gray-100 text-gray-400 cursor-not-allowed" 
                            : "bg-white text-gray-700 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200"
                            }`}
                        title="Pobierz PDF"
                    >
                        {downloadingId === r.id ? (
                            <>
                                <Loader2 size={14} className="animate-spin" />
                                Pobieranie...
                            </>
                        ) : (
                            <>
                                <Download size={14} />
                                PDF
                            </>
                        )}
                    </button>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-gray-500">
                  Brak dokumentów WZ.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* PAGINACJA */}
      <div className="mt-4 flex items-center gap-4 justify-center">
        <button
          className="border rounded px-4 py-2 disabled:opacity-50 hover:bg-gray-50 text-sm"
          disabled={page === 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Poprzednia
        </button>
        <span className="text-sm font-medium text-gray-700">
          Strona {page} z {totalPages}
        </span>
        <button
          className="border rounded px-4 py-2 disabled:opacity-50 hover:bg-gray-50 text-sm"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          Następna
        </button>
      </div>
    </div>
  );
}