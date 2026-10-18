import { Suspense } from "react";
import { SignIn } from "@clerk/nextjs";

export const instant = false;

export default function SignInPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex items-center justify-center px-4">
      <Suspense fallback={<p className="text-sm text-gray-400">Loading sign in…</p>}>
        <SignIn />
      </Suspense>
    </main>
  );
}
