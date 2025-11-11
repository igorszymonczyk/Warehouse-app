import { api } from "./api";

export async function downloadWZPdf(id: number) {
  await api.post(`/warehouse-documents/${id}/pdf`);
  const url = `${api.defaults.baseURL}/warehouse-documents/${id}/download`;
  window.open(url, "_blank");
}

export async function downloadInvoicePdf(id: number) {
  await api.post(`/invoices/${id}/pdf`);
  const url = `${api.defaults.baseURL}/invoices/${id}/download`;
  window.open(url, "_blank");
}
