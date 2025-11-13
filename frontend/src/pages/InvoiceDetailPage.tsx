import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type { Invoice } from "../lib/types";

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const loadInvoice = async () => {
      setLoading(true);
      try {
        const res = await api.get<Invoice>(`/invoices/${id}`);
        setInvoice(res.data);
      } catch (err) {
        console.error(err);
        setError("Nie udało się pobrać faktury.");
      } finally {
        setLoading(false);
      }
    };
    loadInvoice();
  }, [id]);

  if (loading) return <div className="p-6">Ładowanie...</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!invoice) return <div className="p-6">Brak danych</div>;

  return (
    <div className="p-6">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 px-3 py-1 border rounded hover:bg-gray-100"
      >
        ← Wróć
      </button>

      <h1 className="text-2xl font-semibold mb-2">Faktura #{invoice.id}</h1>
      <p className="text-gray-600 mb-6">
        Data wystawienia: {new Date(invoice.created_at).toLocaleString()}
      </p>

      <div className="bg-white shadow rounded-lg p-4 mb-6">
        <h2 className="text-lg font-medium mb-2">Dane klienta</h2>
        <p><strong>Nazwa:</strong> {invoice.buyer_name}</p>
        <p><strong>NIP:</strong> {invoice.buyer_nip}</p>
        <p><strong>Adres:</strong> {invoice.buyer_address}</p>
      </div>

      <div className="bg-white shadow rounded-lg p-4 mb-6">
        <h2 className="text-lg font-medium mb-2">Pozycje faktury</h2>
        <table className="w-full border text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 border text-left">Nazwa produktu</th>
              <th className="p-2 border text-right">Ilość</th>
              <th className="p-2 border text-right">Cena netto</th>
              <th className="p-2 border text-right">VAT</th>
              <th className="p-2 border text-right">Suma brutto</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items?.map((item) => (
              <tr key={item.id}>
                <td className="p-2 border">{item.product_name}</td>
                <td className="p-2 border text-right">{item.quantity}</td>
                <td className="p-2 border text-right">{item.price_net.toFixed(2)} zł</td>
                <td className="p-2 border text-right">{item.tax_rate}%</td>
                <td className="p-2 border text-right">{item.total_gross.toFixed(2)} zł</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white shadow rounded-lg p-4">
        <h2 className="text-lg font-medium mb-2">Podsumowanie</h2>
        <p><strong>Netto:</strong> {invoice.total_net.toFixed(2)} zł</p>
        <p><strong>VAT:</strong> {invoice.total_vat.toFixed(2)} zł</p>
        <p><strong>Brutto:</strong> {invoice.total_gross.toFixed(2)} zł</p>
      </div>
    </div>
  );
}
