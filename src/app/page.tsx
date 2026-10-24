import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Quippe</h1>
      <p className="mt-2 text-gray-700">
        Quippe connects student STEM groups with company lab resources — surplus
        supplies, lab tours, speakers, and employee-group meetups.
      </p>
      <Link
        href="/login"
        className="mt-4 inline-block rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
      >
        Choose a demo account
      </Link>
    </main>
  );
}
