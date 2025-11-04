import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type { Invoice, Page } from "../lib/types";

export default function InvoicesPage() {
  const [data, setData] = useState<Page<Invoice> | null>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get<Page<Invoice>>("/invoices", {
        params: { buyer: q || undefined, q: q || undefined, page, page_size: pageSize },
      });
      setData(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page]); 

  const downloadPdf = async (id: number) => {
    await api.post(`/invoices/${id}/pdf`);
    const base = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
    window.open(`${base}/invoices/${id}/download`, "_blank");
  };

  return (
    <div className="p-6">
      {/* Górny pasek tytułu + przycisk dodawania */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Faktury</h1>
        <button
          onClick={() => navigate("/invoices/create")}
          className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800"
        >
           Dodaj fakturę
        </button>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); setPage(1); load(); }}
        className="flex gap-2 mb-4"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Szukaj klienta / NIP"
          className="border px-3 py-2 rounded w-64"
        />
        <button className="px-3 py-2 rounded bg-black text-white">Szukaj</button>
      </form>

      {loading && <p>Ładowanie…</p>}
      {!loading && data && (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white border text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left p-2 border">ID</th>
                  <th className="text-left p-2 border">Klient</th>
                  <th className="text-left p-2 border">Data</th>
                  <th className="text-right p-2 border">Brutto</th>
                  <th className="p-2 border">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((inv) => (
                  <tr key={inv.id} className="border-t">
                    <td className="p-2 border">{inv.id}</td>
                    <td className="p-2 border">{inv.buyer_name}</td>
                    <td className="p-2 border">
                      {new Date(inv.created_at).toLocaleString()}
                    </td>
                    <td className="p-2 border text-right">
                      {inv.total_gross.toFixed(2)} zł
                    </td>
                    <td className="p-2 border text-center">
                      <button
                        onClick={() => downloadPdf(inv.id)}
                        className="px-2 py-1 border rounded hover:bg-gray-100"
                      >
                        PDF
                      </button>
                    </td>
                  </tr>
                ))}
                {data.items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-gray-500">
                      Brak danych
                    </td>
                  </tr>
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
              Strona {page} / {Math.max(1, Math.ceil((data.total ?? 0) / pageSize))}
            </span>
            <button
              className="border rounded px-3 py-1 disabled:opacity-50"
              disabled={page * pageSize >= (data.total ?? 0)}
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
