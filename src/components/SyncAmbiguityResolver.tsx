import { AmbiguityConflict } from "../lib/list-merge";

interface SyncAmbiguityResolverProps<T> {
  listType: "grocery" | "regular";
  ambiguities: AmbiguityConflict<T>[];
  onResolve: (id: string, choice: "local" | "remote") => Promise<void>;
  onResolveAll: (choice: "local" | "remote") => Promise<void>;
}

export default function SyncAmbiguityResolver<T extends { id: string; name: string }>({
  listType,
  ambiguities,
  onResolve,
  onResolveAll,
}: SyncAmbiguityResolverProps<T>) {
  if (ambiguities.length === 0) return null;

  const renderFieldDiff = (amb: AmbiguityConflict<T>) => {
    const fieldsToDiff = listType === "grocery"
      ? ["name", "category", "quantity", "unit", "units", "checked"]
      : ["name", "category", "selected"];

    const diffs: string[] = [];
    const localVal = amb.local;
    const remoteVal = amb.remote;

    for (const f of fieldsToDiff) {
      const l = localVal ? (localVal as any)[f] : undefined;
      const r = remoteVal ? (remoteVal as any)[f] : undefined;
      if (l !== r) {
        let label = f.charAt(0).toUpperCase() + f.slice(1);
        if (f === "checked" || f === "selected") {
          label = f === "checked" ? "Checked status" : "Selection status";
          diffs.push(`${label}: Local = ${l ? "Yes" : "No"}, Server = ${r ? "Yes" : "No"}`);
        } else {
          diffs.push(`${label}: Local = "${l !== undefined ? l : "n/a"}", Server = "${r !== undefined ? r : "n/a"}"`);
        }
      }
    }

    if (amb.reason === "tied-delete-update") {
      const hasLocalDelete = !localVal && amb.localTombstone;
      diffs.push(`Conflict: One side deleted the item, while the other updated it.`);
    }

    return (
      <ul className="list-disc pl-4 text-[10px] text-gray-700 normal-case font-bold leading-normal mt-1 space-y-0.5">
        {diffs.map((d, i) => (
          <li key={i}>{d}</li>
        ))}
      </ul>
    );
  };

  return (
    <div className="flex flex-col gap-3 p-4 border-2 border-amber-500 bg-amber-50 text-black shadow-[3px_3px_0px_0px_rgba(245,158,11,1)] text-xs font-bold uppercase w-full my-4">
      <div className="flex items-center gap-2 font-black text-amber-700">
        <span className="w-2.5 h-2.5 rounded-full bg-amber-600 border border-black animate-pulse" />
        <span>Resolve Tied Item Conflicts ({ambiguities.length} left)</span>
      </div>
      
      <p className="text-[10px] text-gray-700 normal-case font-bold leading-normal">
        Changes were made to the same item concurrently on multiple devices with identical timestamps. Choose which version to keep:
      </p>

      <div className="max-h-[300px] overflow-y-auto space-y-3 pr-1">
        {ambiguities.map((amb) => {
          const itemName = amb.local?.name || amb.remote?.name || "Unknown Item";
          return (
            <div key={amb.id} className="p-3 border border-amber-300 bg-white shadow-[1px_1px_0px_rgba(0,0,0,1)] rounded-sm">
              <div className="font-bold text-amber-900 normal-case text-xs">
                Item: <span className="underline font-black">{itemName}</span>
              </div>
              {renderFieldDiff(amb)}
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => onResolve(amb.id, "local")}
                  className="px-2 py-0.5 bg-black text-white hover:bg-amber-600 transition-colors border border-black text-[9px] font-black uppercase cursor-pointer"
                >
                  Keep Local
                </button>
                <button
                  onClick={() => onResolve(amb.id, "remote")}
                  className="px-2 py-0.5 bg-white text-black hover:bg-amber-100 transition-colors border border-black text-[9px] font-black uppercase cursor-pointer"
                >
                  Keep Server
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 border-t border-amber-200 pt-2.5 mt-1">
        <button
          onClick={() => onResolveAll("local")}
          className="px-2.5 py-1 bg-amber-600 text-white hover:bg-amber-700 transition-colors border border-black text-[9px] font-black uppercase cursor-pointer"
        >
          Keep All Local
        </button>
        <button
          onClick={() => onResolveAll("remote")}
          className="px-2.5 py-1 bg-white text-amber-700 hover:bg-amber-100 transition-colors border border-amber-600 text-[9px] font-black uppercase cursor-pointer"
        >
          Keep All Server
        </button>
      </div>
    </div>
  );
}
