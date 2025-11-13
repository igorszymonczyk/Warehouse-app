// frontend/src/pages/Cart.tsx
import { useAuth } from "../store/auth";
import { api } from "../lib/api";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import { Trash2, Plus, Minus } from "lucide-react";

export default function CartPage() {
  const { cart, setCart, role } = useAuth();

  // Zabezpieczenie na wypadek, gdyby ktoś inny niż klient tu wszedł
  if (role !== "customer") {
    return <div>Brak dostępu</div>;
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-4">Mój koszyk</h1>
        <div className="bg-white p-6 rounded-lg shadow-md text-center">
          <p className="text-gray-600">Twój koszyk jest pusty.</p>
          <Link
            to="/"
            className="mt-4 inline-block bg-blue-600 text-white px-5 py-2 rounded hover:bg-blue-700 transition"
          >
            Wróć do sklepu
          </Link>
        </div>
      </div>
    );
  }

  const handleUpdateQty = async (itemId: number, newQty: number) => {
    if (newQty < 1) {
      // Poniżej 1 traktujemy jako usunięcie
      handleDeleteItem(itemId);
      return;
    }

    try {
      const res = await api.put(`/cart/items/${itemId}`, { qty: newQty });
      setCart(res.data); // Aktualizuj globalny stan
      toast.success("Zaktualizowano ilość");
    } catch {
      toast.error("Błąd: Nie udało się zaktualizować koszyka");
    }
  };

  const handleDeleteItem = async (itemId: number) => {
    if (!window.confirm("Czy na pewno chcesz usunąć ten produkt z koszyka?")) {
      return;
    }
    try {
      const res = await api.delete(`/cart/items/${itemId}`);
      setCart(res.data); // Aktualizuj globalny stan
      toast.success("Produkt usunięty z koszyka");
    } catch {
      toast.error("Błąd: Nie udało się usunąć produktu");
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Mój koszyk</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Lista produktów w koszyku */}
        <div className="md:col-span-2 bg-white p-6 rounded-lg shadow-md">
          <ul className="divide-y divide-gray-200">
            {cart.items.map((item) => (
              <li key={item.id} className="flex items-center justify-between py-4">
                <div className="flex-grow">
                  <p className="font-semibold text-gray-800">{item.name}</p>
                  <p className="text-sm text-gray-500">
                    Cena: {item.unit_price.toFixed(2)} zł
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleUpdateQty(item.id, item.qty - 1)}
                    className="p-1 rounded bg-gray-200 hover:bg-gray-300"
                  >
                    <Minus size={16} />
                  </button>
                  <span className="w-10 text-center font-medium">{item.qty}</span>
                  <button
                    onClick={() => handleUpdateQty(item.id, item.qty + 1)}
                    className="p-1 rounded bg-gray-200 hover:bg-gray-300"
                  >
                    <Plus size={16} />
                  </button>
                </div>
                <p className="w-24 text-right font-semibold">
                  {item.line_total.toFixed(2)} zł
                </p>
                <button
                  onClick={() => handleDeleteItem(item.id)}
                  className="ml-4 p-2 text-red-500 hover:text-red-700"
                >
                  <Trash2 size={20} />
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Podsumowanie */}
        <div className="md:col-span-1">
          <div className="bg-white p-6 rounded-lg shadow-md sticky top-6">
            <h2 className="text-lg font-semibold mb-4">Podsumowanie</h2>
            <div className="flex justify-between text-xl font-bold mb-4">
              <span>Suma:</span>
              <span>{cart.total.toFixed(2)} zł</span>
            </div>
            <Link
              to="/checkout"
              className="block text-center w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition"
            >
              Przejdź do kasy
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}