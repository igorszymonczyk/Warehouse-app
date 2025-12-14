import { api } from "./api";

// Triggers PDF generation for a Warehouse Document (WZ) and opens it in a new tab
export async function downloadWZPdf(id: number) {
  await api.post(`/warehouse-documents/${id}/pdf`);
  const url = `${api.defaults.baseURL}/warehouse-documents/${id}/download`;
  window.open(url, "_blank");
}

// Triggers PDF generation for an Invoice and opens it in a new tab
export async function downloadInvoicePdf(id: number) {
  await api.post(`/invoices/${id}/pdf`);
  const url = `${api.defaults.baseURL}/invoices/${id}/download`;
  window.open(url, "_blank");
}