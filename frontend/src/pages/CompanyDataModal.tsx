import { useEffect, useState } from "react";
import { api } from "../lib/api";
import toast from "react-hot-toast";

type Props = { open: boolean; onClose: () => void };

export default function CompanyDataModal({ open, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [company, setCompany] = useState({ name: "", nip: "", address: "" , phone: "", email: "" });

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await api.get("/company/");
        if (mounted && res.data) {
          setCompany({ name: res.data.name || "", nip: res.data.nip || "", address: res.data.address || "" , phone: res.data.phone || "", email: res.data.email || "" });
        }
      } catch (err) {
        console.error(err);
        toast.error("Nie udało się pobrać danych firmy");
      } finally {
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [open]);

  const save = async () => {
    try {
      setLoading(true);
      await api.patch("/company/", company);
      toast.success("Dane firmy zapisane");
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Błąd zapisu danych firmy");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded p-6 w-full max-w-lg">
        <h3 className="text-lg font-semibold mb-4">Dane firmy (na fakturze)</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm">Nazwa firmy</label>
            <input className="border px-2 py-1 w-full" value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm">NIP</label>
            <input className="border px-2 py-1 w-full" value={company.nip} onChange={(e) => setCompany({ ...company, nip: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm">Adres</label>
            <textarea className="border px-2 py-1 w-full" rows={3} value={company.address} onChange={(e) => setCompany({ ...company, address: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm">Telefon</label>
            <input className="border px-2 py-1 w-full" value={company.phone || ""} onChange={(e) => setCompany({ ...company, phone: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm">Email</label>
            <input className="border px-2 py-1 w-full" value={company.email || ""} onChange={(e) => setCompany({ ...company, email: e.target.value })} />
            </div>
        </div>

        <div className="mt-4 flex justify-end gap-3">
          <button className="px-3 py-1 border rounded" onClick={onClose} disabled={loading}>Anuluj</button>
          <button className="px-3 py-1 bg-blue-600 text-white rounded" onClick={save} disabled={loading}>Zapisz</button>
        </div>
      </div>
    </div>
  );
}