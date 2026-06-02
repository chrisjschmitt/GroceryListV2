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
    <form onSubmit={handleSubmit} className="flex flex-col gap-2.5 text-black">
      <div className="w-full">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add item (e.g. eggs, milk...)"
          className="w-full px-4 py-2.5 border-2 border-black bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-emerald-50 text-sm font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all"
          disabled={disabled}
          aria-label="Item name"
        />
      </div>
      <div className="flex gap-2 w-full">
        <div className="flex shrink-0 border-2 border-black bg-white overflow-hidden shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] items-center h-10">
          <span className="px-2 text-[10px] font-black uppercase text-gray-500 border-r border-gray-200 bg-gray-50 h-[38px] flex items-center shrink-0">Qty</span>
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
            min={1}
            className="w-12 text-center text-xs font-bold bg-white text-gray-900 focus:outline-none h-[38px] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none border-0 p-0 m-0"
            disabled={disabled}
            aria-label="Quantity"
          />
        </div>
        <select
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          className="flex-1 min-w-0 pr-6 text-xs border-2 border-black bg-white text-gray-900 focus:outline-none focus:bg-emerald-50 font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] h-10 cursor-pointer"
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
          className="px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-wider text-xs border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-50 disabled:shadow-none disabled:translate-x-0 disabled:translate-y-0 disabled:cursor-not-allowed transition-all h-10 flex items-center justify-center gap-1 shrink-0"
        >
          <span>Add</span>
        </button>
      </div>
    </form>
  );
}
