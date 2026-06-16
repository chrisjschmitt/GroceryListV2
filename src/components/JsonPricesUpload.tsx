import React, { useRef, useState } from "react";

interface JsonPricesUploadProps {
  onUploadComplete: () => void;
}

export default function JsonPricesUpload({ onUploadComplete }: JsonPricesUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.name.endsWith(".json")) {
      setError("Please upload a .json file");
      setSuccess(null);
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/prices/import-json", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to upload JSON prices");
        return;
      }

      setSuccess(`Successfully imported/merged ${data.count} pricing items!`);
      onUploadComplete();
    } catch {
      setError("Failed to upload file");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
          dragOver
            ? "border-emerald-400 bg-emerald-50"
            : "border-gray-200 hover:border-emerald-300 hover:bg-gray-50"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleInputChange}
          className="hidden"
          aria-label="Upload pricing JSON file"
        />

        <div className="text-3xl mb-2">🏷️</div>
        <p className="text-sm font-medium text-gray-700">
          {uploading ? "Uploading..." : "Upload Pricing JSON File"}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Supports array format or standard nested key-value UPC mapping
        </p>

        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-xl">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600" />
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg">
          ⚠️ {error}
        </p>
      )}

      {success && (
        <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg font-semibold">
          ✅ {success}
        </p>
      )}
    </div>
  );
}
