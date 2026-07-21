import { useState, useEffect } from "react";
import { SyncStatus } from "../lib/client/sync";

interface SyncIndicatorProps {
  status: SyncStatus;
  isOnline: boolean;
  lastSynced: Date | null;
  lastSavedBy: string | null;
  hasPendingChanges: boolean;
  onSave: () => Promise<void>;
  onRefresh?: (force?: boolean) => Promise<void>;
  /** True replace: discard local lists and use the server snapshot. */
  onResetToServer?: () => Promise<boolean>;
  syncConflict?: boolean;
  onResolveConflict?: (choice: "local" | "server") => Promise<void>;
  writeAcknowledgement?: "mongodb" | "local_fs" | "error";
}

const RESET_TO_SERVER_CONFIRM =
  "Replace the shopping list on this device with what's on the server?\n\nLocal-only items will be removed. This can't be undone.";

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
  onResetToServer,
  syncConflict,
  onResolveConflict,
  writeAcknowledgement,
}: SyncIndicatorProps) {
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [resetting, setResetting] = useState(false);
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
      await onRefresh(true);
    } finally {
      setRefreshing(false);
    }
  };

  const handleResetToServer = async () => {
    if (!onResetToServer) return;
    if (!window.confirm(RESET_TO_SERVER_CONFIRM)) return;
    setResetting(true);
    try {
      await onResetToServer();
    } finally {
      setResetting(false);
    }
  };

  const byDevice = lastSavedBy ? ` by ${lastSavedBy}` : "";
  const lastSyncedLabel = ago ? ` • last saved${byDevice} ${ago}` : "";

  const renderStatus = () => {
    if (syncConflict && isOnline) {
      return (
        <div className="flex flex-col gap-2.5 p-4 border-2 border-red-500 bg-red-50 text-black shadow-[3px_3px_0px_0px_rgba(239,68,68,1)] text-xs font-bold uppercase w-full sm:max-w-md">
          <div className="flex items-center gap-2 font-black text-red-700">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600 border border-black animate-pulse" />
            <span>Sync Conflict: Server list is newer</span>
          </div>
          <p className="text-[10px] text-gray-700 normal-case font-bold leading-normal">
            Another device has saved changes to the server that you do not have locally. Keep your local edits (overwrites the server), or replace this device with the full server list — local-only items will be removed.
          </p>
          <div className="flex items-center gap-2 mt-1">
            <button
              onClick={() => onResolveConflict?.("local")}
              className="px-2.5 py-1 bg-black text-white hover:bg-emerald-600 transition-colors border border-black text-[9px] font-black uppercase cursor-pointer"
            >
              Keep Local (Overwrite)
            </button>
            <button
              onClick={() => {
                if (!window.confirm(RESET_TO_SERVER_CONFIRM)) return;
                void onResolveConflict?.("server");
              }}
              className="px-2.5 py-1 bg-white text-black hover:bg-rose-100 transition-colors border border-black text-[9px] font-black uppercase cursor-pointer"
            >
              Use Server (Discard Local)
            </button>
          </div>
        </div>
      );
    }

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

    if (writeAcknowledgement === "local_fs") {
      return (
        <div className="inline-flex items-center gap-2 px-4 py-2 border-2 border-black bg-amber-100 text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] text-xs font-black uppercase">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 border border-black animate-pulse" />
          <span>Saved Locally (Cloud Offline){ago ? ` • ${ago}${byDevice}` : ""}</span>
        </div>
      );
    }

    if (writeAcknowledgement === "mongodb") {
      return (
        <div className="inline-flex items-center gap-2 px-4 py-2 border-2 border-black bg-emerald-100 text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] text-xs font-black uppercase">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-black" />
          <span>Synced to Cloud (DB Confirmed){ago ? ` • ${ago}${byDevice}` : ""}</span>
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
      {onRefresh && isOnline && !hasPendingChanges && !saving && !resetting && !syncConflict && (
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="px-3 py-2 border-2 border-black bg-white hover:bg-gray-150 disabled:opacity-50 text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all text-xs font-black uppercase flex items-center justify-center cursor-pointer h-[38px] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
          title="Merge latest server changes into this device (keeps local-only items)"
        >
          {refreshing ? "🔄 Pulling..." : "🔄 Pull Updates"}
        </button>
      )}
      {onResetToServer && isOnline && !saving && !refreshing && !syncConflict && (
        <button
          onClick={handleResetToServer}
          disabled={resetting}
          className="px-3 py-2 border-2 border-black bg-white hover:bg-rose-50 disabled:opacity-50 text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all text-xs font-black uppercase flex items-center justify-center cursor-pointer h-[38px] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
          title="Replace this device's lists with the server snapshot"
        >
          {resetting ? "Resetting..." : "Reset to Server"}
        </button>
      )}
    </div>
  );
}
