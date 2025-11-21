// frontend/src/pages/Checkout.tsx
import { useState } from "react";
import { useAuth } from "../store/auth";
import { api } from "../lib/api";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";

// Komponent do renderowania pól formularza (dla czystości kodu)
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
  const { cart, setCart, role } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  // Stan formularza (dopasowany do OrderCreatePayload z backendu)
  const [formData, setFormData] = useState({
    invoice_buyer_name: "",     // Nazwa firmy
    invoice_contact_person: "", // Imię i nazwisko
    invoice_buyer_nip: "",
    invoice_address_street: "", // Ulica + Numer
    invoice_address_zip: "",    // Kod pocztowy
    invoice_address_city: "",   // Miasto
  });

  // Obsługa zmian w formularzu
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Wysłanie formularza
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Inicjujemy płatność w backendzie — otrzymamy link do PayU
      const response = await api.post("/orders/initiate-payment", formData);
      const { redirect_url } = response.data as { redirect_url?: string };

      if (redirect_url) {
        // Czyścimy koszyk lokalnie (backend zamknął koszyk)
        setCart(null);
        // Przekierowanie do PayU
        window.location.href = redirect_url;
        return;
      }

      toast.success("Zamówienie zostało zainicjowane.");

    } catch (err: unknown) {
      console.error(err);
      let msg = "Nie udało się złożyć zamówienia";
      if (typeof err === 'object' && err !== null && 'response' in err) {
        const response = (err as { response?: { data?: { detail?: string } } }).response;
        if (response?.data?.detail) {
          msg = response.data.detail; // Np. "Insufficient stock"
        }
      }
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Zabezpieczenia (gdyby ktoś wszedł tu bez uprawnień lub koszyka)
  if (role !== "customer") return <div>Brak dostępu</div>;
  if (!cart || cart.items.length === 0) {
    return (
      <div className="p-6 text-center">
        <p>Twój koszyk jest pusty. Nie możesz przejść do kasy.</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Podsumowanie zamówienia</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Formularz */}
        <form onSubmit={handleSubmit} className="md:col-span-2 bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-lg font-semibold mb-4">Dane do faktury i wysyłki</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormInput
              label="Nazwa firmy"
              id="invoice_buyer_name"
              value={formData.invoice_buyer_name}
              onChange={handleChange}
              required
            />
            <FormInput
              label="Imię i nazwisko (osoba kontaktowa)"
              id="invoice_contact_person"
              value={formData.invoice_contact_person}
              onChange={handleChange}
              required
            />
            <FormInput
              label="NIP (opcjonalnie)"
              id="invoice_buyer_nip"
              value={formData.invoice_buyer_nip}
              onChange={handleChange}
            />
            <FormInput
              label="Ulica i numer domu"
              id="invoice_address_street"
              value={formData.invoice_address_street}
              onChange={handleChange}
              required
            />
            <FormInput
              label="Kod pocztowy"
              id="invoice_address_zip"
              value={formData.invoice_address_zip}
              onChange={handleChange}
              placeholder="np. 00-001"
              required
            />
            <FormInput
              label="Miasto"
              id="invoice_address_city"
              value={formData.invoice_address_city}
              onChange={handleChange}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition disabled:bg-gray-400"
          >
            {loading ? "Składanie zamówienia..." : `Złóż zamówienie i zapłać (${cart.total.toFixed(2)} zł)`}
          </button>
        </form>

        {/* Podsumowanie koszyka (sticky) */}
        <div className="md:col-span-1">
          <div className="bg-white p-6 rounded-lg shadow-md sticky top-6">
            <h2 className="text-lg font-semibold mb-4">Twój koszyk</h2>
            <ul className="divide-y divide-gray-200">
              {cart.items.map((item) => (
                <li key={item.id} className="py-3">
                  <p className="font-medium">{item.name}</p>
                  <p className="text-sm text-gray-600">
                    {item.qty} szt. x {item.unit_price.toFixed(2)} zł
                  </p>
                  <p className="text-right font-semibold">{item.line_total.toFixed(2)} zł</p>
                </li>
              ))}
            </ul>
            <div className="flex justify-between text-xl font-bold mt-4 pt-4 border-t">
              <span>Suma:</span>
              <span>{cart.total.toFixed(2)} zł</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}