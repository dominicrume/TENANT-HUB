"use client";

import { useEffect, useState } from "react";
import { formatMoney, formatShortDate } from "../../../../../lib/format";

export default function StatementPage({ params }: { params: { id: string } }) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate data loading
    setTimeout(() => setLoading(false), 800);
  }, []);

  if (loading) return <div className="p-8">Loading official statement...</div>;

  return (
    <div className="bg-white text-black min-h-screen p-12 max-w-4xl mx-auto shadow-2xl">
      {/* Print Button - hidden when printing */}
      <div className="flex justify-end mb-8 print:hidden">
        <button 
          onClick={() => window.print()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          🖨️ Print to PDF
        </button>
      </div>

      <header className="border-b-2 border-slate-200 pb-8 mb-8 flex justify-between items-start">
        <div>
          <h1 className="text-4xl font-bold text-slate-800 tracking-tight">Statement of Account</h1>
          <p className="text-lg text-slate-500 mt-2">Housing Benefit / Universal Credit Ledger</p>
        </div>
        <div className="text-right text-sm text-slate-500 space-y-1">
          <p className="font-bold text-slate-800">Matty's Place Supported Housing</p>
          <p>123 Support Lane</p>
          <p>London, E1 4LX</p>
          <p>admin@mattysplace.org.uk</p>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-8 mb-12">
        <div className="bg-slate-50 p-6 rounded-lg">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Billed To</h3>
          <p className="text-lg font-medium text-slate-800">John Doe</p>
          <p className="text-slate-600">Room 12, Support House</p>
          <p className="text-slate-600">NINO: QQ 12 34 56 A</p>
        </div>
        <div className="bg-slate-50 p-6 rounded-lg">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Statement Details</h3>
          <div className="flex justify-between mb-1">
            <span className="text-slate-600">Date Generated:</span>
            <span className="font-medium text-slate-800">{formatShortDate(new Date().toISOString())}</span>
          </div>
          <div className="flex justify-between mb-1">
            <span className="text-slate-600">Account Ref:</span>
            <span className="font-medium text-slate-800">TEN-{params.id.substring(0,6).toUpperCase()}</span>
          </div>
          <div className="flex justify-between mt-4 pt-4 border-t border-slate-200">
            <span className="font-bold text-slate-800">Current Balance:</span>
            <span className="font-bold text-red-600 text-xl">-£150.00 (Arrears)</span>
          </div>
        </div>
      </section>

      <section>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b-2 border-slate-800 text-slate-800">
              <th className="py-3 px-2">Date</th>
              <th className="py-3 px-2">Description</th>
              <th className="py-3 px-2 text-right">Charge</th>
              <th className="py-3 px-2 text-right">Payment</th>
              <th className="py-3 px-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody className="text-slate-600">
            <tr className="border-b border-slate-100">
              <td className="py-4 px-2">01 Jun 2026</td>
              <td className="py-4 px-2">Weekly Service Charge</td>
              <td className="py-4 px-2 text-right">£50.00</td>
              <td className="py-4 px-2 text-right">-</td>
              <td className="py-4 px-2 text-right text-red-600">-£50.00</td>
            </tr>
            <tr className="border-b border-slate-100">
              <td className="py-4 px-2">08 Jun 2026</td>
              <td className="py-4 px-2">Weekly Service Charge</td>
              <td className="py-4 px-2 text-right">£50.00</td>
              <td className="py-4 px-2 text-right">-</td>
              <td className="py-4 px-2 text-right text-red-600">-£100.00</td>
            </tr>
            <tr className="border-b border-slate-100 bg-emerald-50">
              <td className="py-4 px-2">10 Jun 2026</td>
              <td className="py-4 px-2 font-medium text-emerald-700">DWP Housing Benefit Payment</td>
              <td className="py-4 px-2 text-right">-</td>
              <td className="py-4 px-2 text-right font-medium text-emerald-700">£50.00</td>
              <td className="py-4 px-2 text-right text-red-600">-£50.00</td>
            </tr>
            <tr className="border-b border-slate-100">
              <td className="py-4 px-2">15 Jun 2026</td>
              <td className="py-4 px-2">Weekly Service Charge</td>
              <td className="py-4 px-2 text-right">£50.00</td>
              <td className="py-4 px-2 text-right">-</td>
              <td className="py-4 px-2 text-right text-red-600">-£100.00</td>
            </tr>
          </tbody>
        </table>
      </section>

      <footer className="mt-16 text-center text-sm text-slate-400">
        <p>This is a computer generated document and does not require a signature.</p>
        <p className="mt-1">For queries, please contact admin@mattysplace.org.uk</p>
      </footer>
    </div>
  );
}
