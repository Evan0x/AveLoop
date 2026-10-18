import { Suspense } from "react";
import { SignUp } from "@clerk/nextjs";

export const instant = false;

export default function SignUpPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex items-center justify-center px-4">
      <Suspense fallback={<p className="text-sm text-gray-400">Loading sign up…</p>}>
        <SignUp />
      </Suspense>
    </main>
  );
}
