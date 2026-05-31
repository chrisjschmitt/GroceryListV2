import Link from "@/components/Link";
import GroceryList from "@/components/GroceryList";

export default function Home() {
  return (
    <main className="flex-1 bg-[#f9fafb] text-[#111827] min-h-screen font-sans">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-8 gap-4 pb-4 border-b-2 border-black">
          <div className="flex flex-col">
            <span className="text-xs font-black uppercase tracking-widest text-gray-500 mb-1">
              Repository Integrated
            </span>
            <h1 className="text-4xl font-extrabold tracking-tighter">
              GroceryHub<span className="text-emerald-600">.</span>
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3 bg-white border-2 border-black px-4 py-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-xs font-bold">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
            <span>chrisjschmitt/GroceryList</span>
            <span className="text-gray-300">|</span>
            <Link
              href="/admin"
              className="text-emerald-600 hover:underline font-black uppercase tracking-wider text-[10px]"
            >
              ⚙️ Admin Portal
            </Link>
          </div>
        </header>

        <GroceryList />
      </div>
    </main>
  );
}
