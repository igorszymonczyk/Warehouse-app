import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Search } from "lucide-react";
import toast from "react-hot-toast";

type LogItem = {
  id: number;
  user_id: number | null;
  action: string;
  resource: string;
  status: "SUCCESS" | "FAIL" | string;
  ip: string | null;
  ts: string;
  meta?: Record<string, unknown>;
};

type LogsResponse = {
  items: LogItem[];
  total: number;
  page: number;
  page_size: number;
};

export default function LogsPage() {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  
  // Filters
  const [searchAction, setSearchAction] = useState("");
  const [searchUserId, setSearchUserId] = useState("");
  const [searchResource, setSearchResource] = useState("");
  const [searchStatus, setSearchStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const pageSize = 20;

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      try {
        const res = await api.get<LogsResponse>("/logs", {
          params: {
            page,
            page_size: pageSize,
            action: searchAction || undefined,
            user_id: searchUserId || undefined,
            resource: searchResource || undefined,
            status: searchStatus || undefined,
            date_from: dateFrom || undefined,
            date_to: dateTo || undefined,
          },
        });
        setLogs(res.data.items);
        setTotal(res.data.total);
      } catch (err) {
        console.error(err);
        toast.error("Nie udało się pobrać logów");
      } finally {
        setLoading(false);
      }
    };

    const timeout = setTimeout(() => {
        fetchLogs();
    }, 300);

    return () => clearTimeout(timeout);
  }, [page, searchAction, searchUserId, searchResource, searchStatus, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">
            Logi Systemowe
        </h1>
      </div>

      {/* FILTERS SECTION */}
      <div className="bg-white p-4 rounded shadow-sm border mb-6 flex flex-wrap gap-4 items-end">
          
          
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">ID Użytkownika</label>
            <input 
                type="number" 
                placeholder="np. 12"
                className="border rounded px-3 py-2 w-32 focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                value={searchUserId}
                onChange={(e) => {setSearchUserId(e.target.value); setPage(1);}}
            />
          </div>

         
          <div className="relative">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Akcja</label>
            <input 
                type="text" 
                placeholder="np. LOGIN"
                className="border rounded pl-8 pr-3 py-2 w-40 focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                value={searchAction}
                onChange={(e) => {setSearchAction(e.target.value); setPage(1);}}
            />
            <Search className="absolute left-2.5 top-8 text-gray-400" size={14} />
          </div>

         
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Zasób</label>
            <input 
                type="text" 
                placeholder="np. auth"
                className="border rounded px-3 py-2 w-32 focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                value={searchResource}
                onChange={(e) => {setSearchResource(e.target.value); setPage(1);}}
            />
          </div>

         
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Status</label>
            <select 
                className="border rounded px-3 py-2 w-32 focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm bg-white"
                value={searchStatus}
                onChange={(e) => {setSearchStatus(e.target.value); setPage(1);}}
            >
                <option value="">Wszystkie</option>
                <option value="SUCCESS">SUCCESS</option>
                <option value="FAIL">FAIL</option>
            </select>
          </div>

        
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Data od</label>
            <input 
                type="date"
                className="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={dateFrom}
                onChange={(e) => {setDateFrom(e.target.value); setPage(1);}}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Data do</label>
            <input 
                type="date"
                className="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={dateTo}
                onChange={(e) => {setDateTo(e.target.value); setPage(1);}}
            />
          </div>

      </div>

      <div className="bg-white rounded shadow overflow-x-auto border">
        <table className="min-w-full text-sm text-left">
          <thead className="bg-gray-100 text-gray-600 uppercase border-b">
            <tr>
            
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Użytkownik (ID)</th>
              <th className="px-4 py-3">Akcja</th>
              <th className="px-4 py-3">Zasób</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
                <tr><td colSpan={7} className="p-4 text-center text-gray-500">Ładowanie...</td></tr>
            ) : logs.length === 0 ? (
                <tr><td colSpan={7} className="p-4 text-center text-gray-500">Brak logów spełniających kryteria</td></tr>
            ) : (
                logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-gray-500">{log.id}</td>
                    
                    <td className="px-4 py-3 text-gray-800 whitespace-nowrap">
                        {new Date(log.ts).toLocaleString("pl-PL")}
                    </td>

                    <td className="px-4 py-3">
                        {log.user_id ? <span className="font-bold text-blue-600">#{log.user_id}</span> : <span className="text-gray-400 italic">Gość</span>}
                    </td>
                    
                    <td className="px-4 py-3 font-semibold text-gray-800">{log.action}</td>
                    <td className="px-4 py-3 text-gray-600">{log.resource}</td>
                    <td className="px-4 py-3">
                    <span
                        className={`px-2 py-1 rounded text-xs font-bold ${
                        log.status === "SUCCESS"
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                    >
                        {log.status}
                    </span>
                    </td>
                    
                    <td className="px-4 py-3 text-gray-500 text-xs font-mono">{log.ip || "-"}</td>
                </tr>
                ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-center gap-4">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1 || loading}
          className="px-4 py-2 border rounded disabled:opacity-50 bg-white hover:bg-gray-50 text-sm"
        >
          Poprzednia
        </button>
        <span className="text-gray-600 text-sm">
          Strona {page} z {totalPages}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages || loading}
          className="px-4 py-2 border rounded disabled:opacity-50 bg-white hover:bg-gray-50 text-sm"
        >
          Następna
        </button>
      </div>
    </div>
  );
}