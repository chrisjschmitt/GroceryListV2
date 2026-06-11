import { useState, useEffect } from "react";
import { 
  Cloud, 
  Download, 
  Upload, 
  LogOut, 
  RefreshCw, 
  FileSpreadsheet, 
  FileJson, 
  Check, 
  AlertCircle
} from "lucide-react";
import { initAuth, googleSignIn, logout, provider } from "../lib/firebase";
import { listBackupFiles, downloadFileContent, uploadBackupFile, DriveFile } from "../lib/drive-service";
import { User } from "firebase/auth";
import { RegularItem, ScrapeConfig } from "../lib/types";

interface GoogleDriveBackupProps {
  items: RegularItem[];
  scrapeConfig?: ScrapeConfig;
  onRestoreComplete: () => void;
}

export default function GoogleDriveBackup({ items, scrapeConfig, onRestoreComplete }: GoogleDriveBackupProps) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [backupFiles, setBackupFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Auto-hide success messaging
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Auth observer
  useEffect(() => {
    const unsubscribe = initAuth(
      (authUser, activeToken) => {
        setUser(authUser);
        setToken(activeToken);
        setError(null);
        fetchBackupList(activeToken);
      },
      () => {
        setUser(null);
        setToken(null);
        setBackupFiles([]);
      }
    );
    return () => unsubscribe();
  }, []);

  const fetchBackupList = async (activeToken: string) => {
    setLoading(true);
    setError(null);
    try {
      const files = await listBackupFiles(activeToken);
      setBackupFiles(files);
    } catch (err: any) {
      console.error(err);
      setError("Failed to fetch Google Drive backups List");
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await googleSignIn();
      if (res) {
        setUser(res.user);
        setToken(res.accessToken);
        setSuccessMessage("Connected to Google Account successfully!");
        fetchBackupList(res.accessToken);
      }
    } catch (err: any) {
      console.error(err);
      setError("Sign in failed or access was denied");
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    setError(null);
    try {
      await logout();
      setUser(null);
      setToken(null);
      setBackupFiles([]);
      setSuccessMessage("Disconnected from Google Account.");
    } catch (err: any) {
      console.error(err);
      setError("Logout failed.");
    } finally {
      setLoading(false);
    }
  };

  const escapeCSVValue = (val: any) => {
    if (val === null || val === undefined) return "";
    let str = String(val);
    if (/[",\n\r]/.test(str)) {
      str = '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  const handleBackup = async (format: "json" | "csv") => {
    if (!token) {
      setError("Please sign in first");
      return;
    }
    if (items.length === 0) {
      setError("No items in catalog to backup");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      let content = "";
      let filename = "";
      let mimeType = "";

      const today = new Date().toISOString().split("T")[0];

      if (format === "json") {
        content = JSON.stringify(items, null, 2);
        filename = `grocery_catalog_backup_${today}.json`;
        mimeType = "application/json";
      } else {
        const headers = ["id", "category", "name", "selected", "linked_to_scrape_config"];
        const rows = [headers.join(",")];
        items.forEach(item => {
          const isLinked = (scrapeConfig?.items || []).some(
            ci => ci.name && ci.name.toLowerCase() === item.name.toLowerCase()
          );
          rows.push([
            escapeCSVValue(item.id),
            escapeCSVValue(item.category),
            escapeCSVValue(item.name),
            escapeCSVValue(item.selected ? "true" : "false"),
            escapeCSVValue(isLinked ? "true" : "false")
          ].join(","));
        });
        content = rows.join("\r\n");
        filename = `grocery_catalog_backup_${today}.csv`;
        mimeType = "text/csv";
      }

      await uploadBackupFile(token, filename, mimeType, content);
      setSuccessMessage(`Catalog backup "${filename}" saved successfully to Google Drive!`);
      // Refresh list
      fetchBackupList(token);
    } catch (err: any) {
      console.error(err);
      setError(`Backup failed: ${err.message || String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (file: DriveFile) => {
    if (!token) return;

    const confirmed = window.confirm(
      `Are you sure you want to restore '${file.name}'? This will completely replace your current item catalog.`
    );
    if (!confirmed) return;

    setLoading(true);
    setError(null);
    try {
      const content = await downloadFileContent(token, file.id);
      let restoredItems: RegularItem[] = [];

      if (file.name.endsWith(".json")) {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          restoredItems = parsed as RegularItem[];
        } else {
          throw new Error("Invalid backup: JSON file is not an item array.");
        }
      } else if (file.name.endsWith(".csv")) {
        restoredItems = parseImportedCsv(content);
      } else {
        throw new Error("Unsupported file format. Must be JSON or CSV.");
      }

      if (restoredItems.length === 0) {
        throw new Error("No valid items parsed from backup.");
      }

      // Send to server
      const response = await fetch("/api/regular-items", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(restoredItems),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to update catalog: ${errText}`);
      }

      setSuccessMessage(`Catalog successfully restored! Loaded ${restoredItems.length} items from Google Drive.`);
      onRestoreComplete();
    } catch (err: any) {
      console.error(err);
      setError(`Restore failed: ${err.message || String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  function parseImportedCsv(csvString: string): RegularItem[] {
    const lines = csvString.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return [];

    const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
    const idIdx = headers.indexOf("id");
    const catIdx = headers.indexOf("category");
    const nameIdx = headers.indexOf("name");
    const selIdx = headers.indexOf("selected");

    // Standard fallback if columns don't match our headers
    if (catIdx === -1 || nameIdx === -1) {
      // Basic split
      const items: RegularItem[] = [];
      const startIndex = headers.includes("category") || headers.includes("item") ? 1 : 0;
      for (let i = startIndex; i < lines.length; i++) {
        const columns = parseCsvLine(lines[i]);
        if (columns.length < 2) continue;
        const category = columns[0].trim();
        const name = columns[1].trim();
        if (category && name) {
          items.push({
            id: `regular-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
            category,
            name,
            selected: false
          });
        }
      }
      return items;
    }

    const items: RegularItem[] = [];
    for (let i = 1; i < lines.length; i++) {
      const columns = parseCsvLine(lines[i]);
      const name = columns[nameIdx]?.trim();
      const category = columns[catIdx]?.trim();
      if (!name || !category) continue;

      const id = idIdx !== -1 && columns[idIdx]?.trim() 
        ? columns[idIdx].trim() 
        : `regular-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`;
      
      const selected = selIdx !== -1 && columns[selIdx]?.trim().toLowerCase() === "true";

      items.push({ id, category, name, selected });
    }
    return items;
  }

  function parseCsvLine(line: string): string[] {
    const columns: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        columns.push(current);
        current = "";
      } else {
        current += char;
      }
    }

    columns.push(current);
    return columns;
  }

  return (
    <div id="google-drive-backup" className="bg-white border-2 border-black p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] relative flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between pb-1.5 border-b-2 border-black mb-4">
          <h2 className="text-base font-black uppercase tracking-tight flex items-center gap-2">
            <Cloud className="w-5 h-5 text-emerald-600" />
            <span>Google Drive Backup</span>
          </h2>
          {user && (
            <button
              onClick={() => fetchBackupList(token || "")}
              disabled={loading}
              className="text-gray-500 hover:text-black transition-all p-1 hover:bg-gray-100 border border-transparent hover:border-black rounded-sm"
              title="Refresh Backups List"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          )}
        </div>

        {/* Feedback Messages */}
        {successMessage && (
          <div className="mb-4 bg-emerald-50 border-2 border-emerald-500 text-emerald-950 p-3 text-xs font-bold font-mono tracking-tight flex items-center gap-2 leading-relaxed animate-fade-in">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>{successMessage}</div>
          </div>
        )}

        {error && (
          <div className="mb-4 bg-red-50 border-2 border-red-500 text-red-950 p-3 text-xs font-bold font-mono tracking-tight flex items-center gap-2 leading-relaxed">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <div>{error}</div>
          </div>
        )}

        {!user ? (
          <div className="py-2.5">
            <p className="text-xs text-gray-500 font-medium leading-relaxed mb-4">
              Connect your Google account and back up or sync your entire regular list catalog directly from your private Google Drive file system safely.
            </p>

            {/* gsi-material-button matching styling guideline */}
            <button 
              onClick={handleConnect}
              disabled={loading}
              className="w-full h-[40px] px-3 border border-[#747775] rounded-4 bg-white text-[#1f1f1f] text-sm font-semibold tracking-normal flex items-center justify-center gap-2 hover:bg-[#f2f2f2] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 cursor-pointer transition-all border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px]"
            >
              <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-5 h-5 shrink-0 block">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
              </svg>
              <span>{loading ? "Connecting..." : "Sign in with Google"}</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* User Profile Connected */}
            <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-sm text-xs">
              <div className="flex items-center gap-2">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="Avatar" className="w-6 h-6 rounded-full border border-black" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold">
                    {user.displayName?.charAt(0).toUpperCase() || "G"}
                  </div>
                )}
                <div className="truncate max-w-[140px] sm:max-w-[180px]">
                  <p className="font-bold text-gray-950 truncate">{user.displayName || "Google User"}</p>
                  <p className="text-[10px] text-gray-500 truncate">{user.email}</p>
                </div>
              </div>
              <button 
                onClick={handleDisconnect}
                className="text-[10px] font-black uppercase tracking-wider text-red-650 hover:text-red-800 flex items-center gap-1 cursor-pointer"
                title="Disconnect Account"
              >
                <LogOut className="w-3 h-3" /> Disconnect
              </button>
            </div>

            {/* Back Up Actions */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-gray-500 mb-2">Back up to Cloud</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleBackup("json")}
                  disabled={loading || items.length === 0}
                  className="px-2.5 py-1.5 border-2 border-black inline-flex items-center justify-center gap-1.5 text-xs font-black uppercase tracking-wider bg-white hover:bg-gray-50 transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] disabled:opacity-50 disabled:pointer-events-none"
                >
                  <FileJson className="w-3.5 h-3.5 text-amber-500" />
                  <span>JSON backup</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleBackup("csv")}
                  disabled={loading || items.length === 0}
                  className="px-2.5 py-1.5 border-2 border-black inline-flex items-center justify-center gap-1.5 text-xs font-black uppercase tracking-wider bg-white hover:bg-gray-50 transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] disabled:opacity-50 disabled:pointer-events-none"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>CSV backup</span>
                </button>
              </div>
            </div>

            {/* Restore / Import Backups */}
            <div className="flex-1">
              <p className="text-[10px] font-black uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1">
                <span>Restore Catalog</span>
                <span className="text-[9px] bg-red-100 text-red-800 font-extrabold px-1 tracking-normal rounded-sm">REPLACES ALL</span>
              </p>
              
              {backupFiles.length === 0 ? (
                <div className="border border-dashed border-gray-300 p-4 text-center rounded-sm">
                  <p className="text-xs text-gray-400 font-semibold leading-normal">
                    {loading ? "Searching Drive..." : "No backups found in Google Drive."}
                  </p>
                  <p className="text-[9px] text-gray-400 mt-1">
                    Use the buttons above to save your first backup!
                  </p>
                </div>
              ) : (
                <div className="border-2 border-black bg-gray-50 max-h-[160px] overflow-y-auto divide-y divide-gray-200">
                  {backupFiles.map(file => (
                    <div key={file.id} className="p-2 flex items-center justify-between gap-2 bg-white hover:bg-gray-50 transition-all text-xs">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1 font-bold text-gray-950 truncate">
                          {file.name.endsWith(".json") ? (
                            <FileJson className="w-3 h-3 text-amber-500 shrink-0" />
                          ) : (
                            <FileSpreadsheet className="w-3 h-3 text-emerald-600 shrink-0" />
                          )}
                          <span className="truncate">{file.name}</span>
                        </div>
                        <span className="text-[9px] text-gray-400 font-mono">
                          {new Date(file.modifiedTime).toLocaleString()}
                        </span>
                      </div>
                      <button
                        onClick={() => handleRestore(file)}
                        disabled={loading}
                        className="px-2 py-1 border border-black hover:bg-black hover:text-white transition-all text-[10px] font-black uppercase tracking-wider bg-white rounded-none cursor-pointer shrink-0 inline-flex items-center gap-1"
                        title="Restore this backup"
                      >
                        <Download className="w-2.5 h-2.5" /> Restore
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 text-[10px] text-gray-400 leading-normal font-sans pt-3 border-t border-gray-100">
        Google Drive integration is managed client-side safely. Security policies prevent token exposure, maintaining perfect privacy.
      </div>
    </div>
  );
}
