import { useState } from "react";
import { useAuth } from "../store/auth";
import { api } from "../lib/api";
import toast from "react-hot-toast";

type InputProps = {
  label: string;
  id: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  placeholder?: string;
};

function FormInput({ label, id, ...props }: InputProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label} {props.required && <span className="text-red-500">*</span>}
      </label>
      <input
        id={id}
        name={id}
        {...props}
        className="border px-3 py-2 rounded-md w-full shadow-sm focus:ring-blue-500 focus:border-blue-500"
      />
    </div>
  );
}

export default function CheckoutPage() {
  const { cart} = useAuth();
  const [loading, setLoading] = useState(false);

  // --- BUYER DATA (INVOICE) ---
  // Removed contact_person
  const [invoiceData, setInvoiceData] = useState({
    buyer_name: "",
    buyer_nip: "",
    street: "",
    zip: "",
    city: "",
  });

  // --- SHIPPING DATA ---
  const [sameAsInvoice, setSameAsInvoice] = useState(true);
  const [shippingData, setShippingData] = useState({
    street: "",
    zip: "",
    city: "",
  });

  // Removed useEffect populating contact_person from user data

  const handlePay = async () => {
    if (!cart || cart.items.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    if (!invoiceData.buyer_name || !invoiceData.street || !invoiceData.zip || !invoiceData.city) {
      toast.error("Please fill in buyer details (Invoice)");
      return;
    }

    if (!sameAsInvoice) {
        if (!shippingData.street || !shippingData.zip || !shippingData.city) {
            toast.error("Please fill in shipping address");
            return;
        }
    }

    setLoading(true);
    try {
      const payload = {
        invoice_buyer_name: invoiceData.buyer_name,
        invoice_buyer_nip: invoiceData.buyer_nip || null,
        // invoice_contact_person: REMOVED
        invoice_contact_person: "None", // Fallback for old schemas if backend still requires it
        invoice_address_street: invoiceData.street,
        invoice_address_zip: invoiceData.zip,
        invoice_address_city: invoiceData.city,
        
        shipping_address_street: sameAsInvoice ? invoiceData.street : shippingData.street,
        shipping_address_zip: sameAsInvoice ? invoiceData.zip : shippingData.zip,
        shipping_address_city: sameAsInvoice ? invoiceData.city : shippingData.city,
      };

      const res = await api.post("/orders/initiate-payment", payload);
      const { redirect_url } = res.data;
      if (redirect_url) {
        window.location.href = redirect_url;
      } else {
        toast.success("Order accepted (test mode)");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.detail || "Error creating order");
    } finally {
      setLoading(false);
    }
  };

  if (!cart || cart.items.length === 0) {
    return <div className="p-6 text-center">Your cart is empty.</div>;
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 text-gray-800">Order Summary</h1>
      
      <div className="grid grid-cols-1 gap-6">
        
        {/* Form */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-lg font-semibold mb-4 border-b pb-2">1. Buyer Details (Invoice)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormInput 
              label="Company Name / Full Name" 
              id="buyer_name" 
              value={invoiceData.buyer_name} 
              onChange={e => setInvoiceData({...invoiceData, buyer_name: e.target.value})} 
              required 
            />
            <FormInput 
              label="NIP/VAT ID (optional)" 
              id="buyer_nip" 
              value={invoiceData.buyer_nip} 
              onChange={e => setInvoiceData({...invoiceData, buyer_nip: e.target.value})} 
            />
            
            <div className="sm:col-span-2">
                <FormInput label="Street and number" id="street" value={invoiceData.street} onChange={e => setInvoiceData({...invoiceData, street: e.target.value})} required />
            </div>
            <FormInput label="Zip Code" id="zip" value={invoiceData.zip} onChange={e => setInvoiceData({...invoiceData, zip: e.target.value})} required />
            <FormInput label="City" id="city" value={invoiceData.city} onChange={e => setInvoiceData({...invoiceData, city: e.target.value})} required />
          </div>

          {/* Shipping Address Section */}
          <div className="mt-6 pt-4 border-t">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-green-700">2. Shipping Address</h2>
                <label className="flex items-center text-sm text-gray-600 cursor-pointer">
                    <input 
                        type="checkbox" 
                        className="mr-2"
                        checked={sameAsInvoice}
                        onChange={e => setSameAsInvoice(e.target.checked)}
                    />
                    Same as invoice
                </label>
            </div>

            {!sameAsInvoice && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50 p-4 rounded border border-gray-200">
                    <div className="sm:col-span-2">
                        <FormInput label="Street and number" id="ship_street" value={shippingData.street} onChange={e => setShippingData({...shippingData, street: e.target.value})} required />
                    </div>
                    <FormInput label="Zip Code" id="ship_zip" value={shippingData.zip} onChange={e => setShippingData({...shippingData, zip: e.target.value})} required />
                    <FormInput label="City" id="ship_city" value={shippingData.city} onChange={e => setShippingData({...shippingData, city: e.target.value})} required />
                </div>
            )}
          </div>

          <button
            onClick={handlePay}
            disabled={loading}
            className="mt-6 w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition disabled:opacity-50"
          >
            {loading ? "Processing..." : `Place order and pay (${cart.total.toFixed(2)} PLN)`}
          </button>
        </div>

        {/* Cart Summary */}
        <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-lg font-semibold mb-4">Your Cart</h2>
            <ul className="divide-y divide-gray-200 text-sm">
              {cart.items.map((item) => (
                <li key={item.id} className="py-2 flex justify-between">
                  <span>{item.name} <span className="text-gray-500">x {item.qty}</span></span>
                  <span className="font-semibold">{item.line_total.toFixed(2)} PLN</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-between text-xl font-bold mt-4 pt-4 border-t">
              <span>Total:</span>
              <span>{cart.total.toFixed(2)} PLN</span>
            </div>
        </div>

      </div>
    </div>
  );
}