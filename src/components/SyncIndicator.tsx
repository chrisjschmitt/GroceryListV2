import { useState, useEffect } from "react";
import { SyncStatus } from "../lib/client/sync";

interface SyncIndicatorProps {
  status: SyncStatus;
  isOnline: boolean;
  lastSynced: Date | null;
  lastSavedBy: string | null;
  hasPendingChanges: boolean;
  onSave: () => Promise<void>;
  onRefresh?: () => Promise<void>;
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function useTimeAgo(date: Date | null): string {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!date) return;
    const interval = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(interval);
  }, [date]);

  if (!date) return "";
  return timeAgo(date);
}

export default function SyncIndicator({
  status,
  isOnline,
  lastSynced,
  lastSavedBy,
  hasPendingChanges,
  onSave,
  onRefresh,
}: SyncIndicatorProps) {
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const ago = useTimeAgo(lastSynced);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave();
    } finally {
      setSaving(false);
    }
  };

  const handleRefresh = async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const byDevice = lastSavedBy ? ` by ${lastSavedBy}` : "";
  const lastSyncedLabel = ago ? ` • last saved${byDevice} ${ago}` : "";

  const renderStatus = () => {
    if (saving) {
      return (
        <div className="inline-flex items-center gap-2 px-4 py-2 border-2 border-black bg-white text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] text-xs font-black uppercase">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 border border-black animate-ping" />
          <span>Syncing...</span>
        </div>
      );
    }

    if (hasPendingChanges && isOnline) {
      return (
        <div className="inline-flex items-center gap-2 px-4 py-2 border-2 border-black bg-amber-100 text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] text-xs font-black uppercase">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 border border-black animate-pulse" />
          <span>Unsaved changes{lastSyncedLabel}</span>
          <button
            onClick={handleSave}
            className="ml-2 px-2.5 py-0.5 bg-black text-white hover:bg-emerald-600 transition-colors border border-black text-[10px] font-black uppercase"
          >
            Save Now
          </button>
        </div>
      );
    }

    if (!isOnline || status === "offline" || status === "error") {
      return (
        <div className="inline-flex items-center gap-2 px-4 py-2 border-2 border-black bg-rose-100 text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] text-xs font-black uppercase">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 border border-black" />
          <span>Offline{hasPendingChanges ? " — unsaved" : ""}{lastSyncedLabel}</span>
        </div>
      );
    }

    return (
      <div className="inline-flex items-center gap-2 px-4 py-2 border-2 border-black bg-emerald-100 text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] text-xs font-black uppercase">
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-black" />
        <span>Synced{ago ? ` • ${ago}${byDevice}` : ""}</span>
      </div>
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {renderStatus()}
      {onRefresh && isOnline && !hasPendingChanges && !saving && (
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="px-3 py-2 border-2 border-black bg-white hover:bg-gray-150 disabled:opacity-50 text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all text-xs font-black uppercase flex items-center justify-center cursor-pointer h-[38px] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
          title="Force-pull latest catalog and prices from server"
        >
          {refreshing ? "🔄 Pulling..." : "🔄 Pull Updates"}
        </button>
      )}
    </div>
  );
}
