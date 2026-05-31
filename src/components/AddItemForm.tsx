import React, { useState } from "react";

interface AddItemFormProps {
  onAdd: (name: string, quantity: number, unit: string) => void;
  disabled?: boolean;
}

const COMMON_UNITS = ["unit", "lb", "oz", "gal", "dozen", "bunch", "bag", "can", "box"];

export default function AddItemForm({ onAdd, disabled }: AddItemFormProps) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState("unit");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd(name.trim(), quantity, unit);
    setName("");
    setQuantity(1);
    setUnit("unit");
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Add an item (e.g. milk, eggs, bread...)"
        className="flex-1 px-4 py-3 border-2 border-black bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-emerald-50 text-base font-bold shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all"
        disabled={disabled}
        aria-label="Item name"
      />
      <div className="flex gap-2">
        <input
          type="number"
          value={quantity}
          onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
          min={1}
          className="w-20 px-3 py-3 border-2 border-black bg-white text-gray-900 text-center focus:outline-none focus:bg-emerald-50 font-bold shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
          disabled={disabled}
          aria-label="Quantity"
        />
        <select
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          className="px-3 py-3 border-2 border-black bg-white text-gray-900 focus:outline-none focus:bg-emerald-50 font-bold shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
          disabled={disabled}
          aria-label="Unit"
        >
          {COMMON_UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={disabled || !name.trim()}
          className="px-6 py-3 bg-emerald-600 text-white font-black uppercase tracking-wider border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:bg-emerald-500 disabled:opacity-50 disabled:shadow-none disabled:translate-x-[3px] disabled:translate-y-[3px] transition-all disabled:cursor-not-allowed"
        >
          Add
        </button>
      </div>
    </form>
  );
}
