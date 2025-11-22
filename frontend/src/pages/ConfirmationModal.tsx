// src/components/ConfirmationModal.tsx

import { X } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  children: ReactNode;
  confirmText?: string;
  confirmVariant?: "primary" | "danger";
  isLoading?: boolean;
};

export default function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  children,
  confirmText = "Potwierdź",
  confirmVariant = "primary",
  isLoading = false,
}: Props) {
  if (!isOpen) return null;

  // Podstawowy styl przycisku
  const baseButton = "px-4 py-2 rounded font-semibold disabled:opacity-60";

  // Dynamiczny styl dla przycisku potwierdzenia
  let confirmClass = `${baseButton} text-white`;
  if (confirmVariant === "danger") {
    confirmClass += " bg-red-600 hover:bg-red-700";
  } else {
    // Domyślnie niebieski, tak jak przycisk "Edytuj"
    confirmClass += " bg-blue-600 hover:bg-blue-700";
  }

  return (
    // Tło
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onClose} // Zamykanie po kliknięciu na tło
    >
      {/* Okno modala */}
      <div
        className="bg-white rounded-2xl p-6 w-full max-w-md shadow-lg"
        onClick={(e) => e.stopPropagation()} // Zapobiega zamykaniu po kliknięciu w modal
      >
        {/* Nagłówek */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button onClick={onClose} disabled={isLoading}>
            <X size={20} />
          </button>
        </div>

        {/* Treść (dzieci) */}
        <div className="mb-6 text-gray-700">{children}</div>

        {/* Stopka z przyciskami */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className={`${baseButton} bg-gray-200 hover:bg-gray-300 text-gray-800`}
          >
            Anuluj
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={confirmClass}
          >
            {isLoading ? "Przetwarzanie..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}