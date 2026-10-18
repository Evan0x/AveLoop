"use client";

import Link from "next/link";
import { SignInButton, SignUpButton, Show, UserButton } from "@clerk/nextjs";

export function AppHeader({ title }: { title?: string }) {
  return (
    <header className="px-4 py-5 flex items-center gap-3 sticky top-0 bg-white/80 backdrop-blur-sm z-10 border-b border-gray-100">
      <Link href="/" className="flex items-center gap-2 shrink-0">
        <img src="/logo.png" alt="AveLoop" className="w-7 h-7" />
        <span className="text-base font-bold text-gray-900">AveLoop</span>
      </Link>
      {title && (
        <span className="text-sm font-medium text-gray-500 truncate">{title}</span>
      )}
      <div className="ml-auto flex items-center gap-2 min-h-8">
        <Show
          when="signed-in"
          fallback={
            <>
              <SignInButton mode="modal">
                <button className="text-sm font-medium text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg">
                  Sign in
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="text-sm font-semibold text-white bg-[#10B981] hover:bg-[#059669] px-3 py-1.5 rounded-lg">
                  Sign up
                </button>
              </SignUpButton>
            </>
          }
        >
          <Link
            href="/history"
            className="text-sm font-medium text-gray-600 hover:text-gray-900 px-2 py-1.5"
          >
            History
          </Link>
          <UserButton />
        </Show>
      </div>
    </header>
  );
}
