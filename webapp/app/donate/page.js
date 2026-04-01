// app/donate/page.js — Donation page

export const metadata = {
  title: 'Support WatchTogether',
};

export default function DonatePage() {
  return (
    <main className="min-h-screen bg-[#0f0f0f] flex items-center justify-center p-4">
      <div className="max-w-sm w-full text-center">

        <a href="/" className="text-red-600 text-sm hover:underline block mb-8">← Back</a>

        <div className="text-5xl mb-4">☕</div>
        <h1 className="text-2xl font-bold text-white mb-2">Support WatchTogether</h1>
        <p className="text-gray-400 text-sm mb-8 leading-relaxed">
          WatchTogether is free and open source. If it made your movie nights better,
          consider buying me a coffee — it keeps the servers running and the features coming.
        </p>

        <a href="https://buymeacoffee.com/dhthakkar" target="_blank" rel="noopener noreferrer" className="block w-full py-3 mb-3 bg-yellow-500 hover:bg-yellow-400 text-black font-semibold rounded-lg text-sm transition-colors">
          ☕ Buy me a coffee
        </a>

        <a href="https://github.com/Dhthakkar/watchtogether" target="_blank" rel="noopener noreferrer" className="block w-full py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold rounded-lg text-sm border border-gray-700 transition-colors">
          ⭐ Star on GitHub
        </a>

        <p className="text-gray-600 text-xs mt-8">
          No account needed. No subscription. Just a coffee if you feel like it.
        </p>

      </div>
    </main>
  );
}
