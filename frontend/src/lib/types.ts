export type InvoiceItem = {
    product_id: number;
    product_name: string | null;
    quantity: number;
    price_net: number;
    tax_rate: number;
    total_net: number;
    total_gross: number;
  };
  
  export type Invoice = {
    id: number;
    buyer_name: string;
    buyer_nip?: string | null;
    buyer_address?: string | null;
    created_at: string;
    total_net: number;
    total_vat: number;
    total_gross: number;
    items?: InvoiceItem[];
  };
  
  export type Page<T> = {
    items: T[];
    total: number;
    page: number;
    page_size: number;
  };
  
  export type WarehouseDoc = {
    id: number;
    buyer_name: string | null;
    invoice_id: number | null;
    invoice_date: string | null;
    items_json: string | null;
    status: "NEW" | "IN_PROGRESS" | "RELEASED" | "CANCELLED";
    created_at: string;
    pdf_path?: string | null;
  };
  