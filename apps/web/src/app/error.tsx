"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global boundary caught:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream-50 p-4">
      <div className="max-w-md w-full bg-white shadow-lg rounded-xl p-8 text-center">
        <h2 className="text-2xl font-bold text-navy-900 mb-4">Something went wrong</h2>
        <p className="text-navy-600 mb-8">
          A critical error occurred. Our team has been notified.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => reset()}
            className="px-6 py-2 bg-navy-900 text-white rounded-lg hover:bg-navy-800 transition-colors"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="px-6 py-2 bg-amber-500 text-navy-900 rounded-lg hover:bg-amber-400 transition-colors font-medium"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
