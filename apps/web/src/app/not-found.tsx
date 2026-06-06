import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-cream-50 p-4">
      <div className="max-w-md w-full bg-white shadow-lg rounded-xl p-8 text-center">
        <h2 className="text-3xl font-bold text-navy-900 mb-4">404</h2>
        <p className="text-navy-600 mb-8">
          The page or record you are looking for does not exist.
        </p>
        <Link
          href="/dashboard"
          className="px-6 py-2 bg-navy-900 text-white rounded-lg hover:bg-navy-800 transition-colors inline-block"
        >
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
