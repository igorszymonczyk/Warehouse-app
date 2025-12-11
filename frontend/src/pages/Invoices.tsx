import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { ArrowUpDown, Download, FilePenLine, CornerDownRight } from "lucide-react";
import toast from "react-hot-toast";
import type { Invoice, Page } from "../lib/types";

export default function InvoicesPage() {
  const [data, setData] = useState<Page<Invoice> | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const [q, setQ] = useState("");
  const [searchId, setSearchId] = useState(""); // New state for ID filtering
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dateError, setDateError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<"id" | "created_at" | "buyer_name" | "total_gross">("created_at");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  const pageSize = 10;
  const navigate = useNavigate();

  const load = async () => {
    if (dateError) return;
    setLoading(true);
    try {
      const res = await api.get<Page<Invoice>>("/invoices", {
        params: {
          q: q || undefined,
          search_id: searchId || undefined, // Pass ID to backend
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
      console.error("Error fetching invoices:", err);
      toast.error("Failed to load invoice list");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (dateFrom && dateTo && new Date(dateTo) < new Date(dateFrom)) {
      setDateError("'To' date cannot be earlier than 'From' date");
    } else {
      setDateError(null);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setPage(1);
      if (!dateError) load();
    }, 300);
    return () => clearTimeout(timeout);
  }, [q, searchId, dateFrom, dateTo, sortBy, order]); 

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

  const downloadPdf = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (downloadingId === id) return;
    setDownloadingId(id);
    const toastId = toast.loading("Generating and downloading PDF...");
    try {
      await api.post(`/invoices/${id}/pdf`);
      const res = await api.get(`/invoices/${id}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Invoice-INV-${id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("PDF Downloaded!", { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error("Error downloading PDF", { id: toastId });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleCorrection = (invoice: Invoice, e: React.MouseEvent) => {
    e.stopPropagation();
    if (invoice.is_correction) {
      toast.error("Cannot correct a correction invoice.");
      return;
    }
    navigate(`/invoices/${invoice.id}/correct`);
  };

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Invoices</h1>
        <button onClick={() => navigate("/invoices/create")} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-gray-800 transition-colors">
          Add Invoice
        </button>
      </div>

      {/* FILTERS CONTAINER */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6">
        <div className="flex flex-wrap items-end gap-3">
          {/* Search by ID */}
          <div>
            <label className="block text-sm text-gray-700 mb-1">Search ID</label>
            <input
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              placeholder="e.g. 6297"
              className="border px-3 py-2 rounded w-24 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Search by Client */}
          <div>
            <label className="block text-sm text-gray-700 mb-1">Search Client / NIP</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Client Name or VAT ID"
              className="border px-3 py-2 rounded w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-1">Date From</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Date To</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={`border px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 ${dateError ? "border-red-500" : ""}`} />
          </div>
          {dateError && <div className="text-red-600 text-sm font-medium">{dateError}</div>}
        </div>
      </div>

      {loading && <p className="text-gray-500">Loading data...</p>}

      {!loading && data && (
        <>
          <div className="overflow-x-auto border rounded shadow-sm">
            <table className="min-w-full bg-white text-sm">
              <thead className="bg-gray-100 border-b">
                <tr>
                  <th className="p-3 border-r text-left font-semibold text-gray-700">Number</th>
                  <th className="p-3 border-r text-left cursor-pointer select-none hover:bg-gray-200" onClick={() => toggleSort("created_at")}>
                    <div className="flex items-center gap-1 font-semibold text-gray-700">
                      Date <ArrowUpDown size={14} className={sortBy === "created_at" ? "text-blue-600" : "text-gray-400"} />
                    </div>
                  </th>
                  <th className="p-3 border-r text-left cursor-pointer select-none hover:bg-gray-200" onClick={() => toggleSort("buyer_name")}>
                    <div className="flex items-center gap-1 font-semibold text-gray-700">
                      Client <ArrowUpDown size={14} className={sortBy === "buyer_name" ? "text-blue-600" : "text-gray-400"} />
                    </div>
                  </th>
                  <th className="p-3 border-r text-right cursor-pointer select-none hover:bg-gray-200" onClick={() => toggleSort("total_gross")}>
                    <div className="flex items-center justify-end gap-1 font-semibold text-gray-700">
                      Gross <ArrowUpDown size={14} className={sortBy === "total_gross" ? "text-blue-600" : "text-gray-400"} />
                    </div>
                  </th>
                  <th className="p-3 text-center font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((inv) => {
                  const isCorrection = inv.is_correction;
                  return (
                    <tr key={inv.id} className={`border-b hover:bg-gray-50 cursor-pointer transition-colors ${isCorrection ? "bg-yellow-50" : ""}`} onClick={() => navigate(`/invoices/${inv.id}`)}>
                      <td className="p-3 border-r text-gray-900 font-medium">
                        <div className="flex items-center gap-2">
                           {isCorrection && <CornerDownRight size={16} className="text-gray-400 ml-2" />}
                           {/* Correctly display invoice number */}
                           <span>{inv.full_number}</span>
                        </div>
                      </td>
                      <td className="p-3 border-r text-gray-600">{new Date(inv.created_at).toLocaleString("en-GB")}</td>
                      <td className="p-3 border-r text-gray-800">
                          {inv.buyer_name}
                          {isCorrection && <span className="ml-2 text-xs text-gray-500 italic">(Correction)</span>}
                      </td>
                      <td className="p-3 border-r text-right font-medium text-gray-900">{inv.total_gross.toFixed(2)} PLN</td>
                      <td className="p-3 text-center flex justify-center gap-2">
                        <button onClick={(e) => downloadPdf(inv.id, e)} disabled={downloadingId === inv.id} className="inline-flex items-center gap-1 px-3 py-1.5 border rounded text-xs font-medium bg-white text-gray-700 hover:bg-blue-50 hover:text-blue-600">
                          <Download size={14} /> {downloadingId === inv.id ? "..." : "PDF"}
                        </button>
                        {!isCorrection && (
                            <button onClick={(e) => handleCorrection(inv, e)} className="inline-flex items-center gap-1 px-3 py-1.5 border rounded text-xs font-medium bg-white text-orange-700 hover:bg-orange-50">
                              <FilePenLine size={14} /> Correct
                            </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {data.items.length === 0 && (
                  <tr><td colSpan={5} className="p-8 text-center text-gray-500">No invoices found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-center gap-4">
            <button className="border rounded px-4 py-2 hover:bg-gray-100 disabled:opacity-50 text-sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <span className="text-sm font-medium">Page {page} of {totalPages}</span>
            <button className="border rounded px-4 py-2 hover:bg-gray-100 disabled:opacity-50 text-sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </>
      )}
    </div>
  );
}