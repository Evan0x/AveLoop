"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SignInButton, Show, UserButton } from "@clerk/nextjs";
import { Clock } from "lucide-react";

export function AppHeader({ title }: { title?: string }) {
  const router = useRouter();
  const onHome = usePathname() === "/";

  function goBack() {
    if (onHome) return;
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/");
  }

  return (
    <header className="px-6 py-4 flex items-center gap-3 sticky top-0 z-20 border-b border-[#d7ebe1] bg-[#f7fbf8]/90 backdrop-blur-sm">
      <button
        type="button"
        onClick={goBack}
        aria-label={onHome ? "AveLoop" : "Go back"}
        className="group flex items-center gap-2.5 shrink-0 bg-transparent outline-none"
      >
        <img
          src="/logo.png"
          alt=""
          className="w-7 h-7 transition duration-200 group-hover:brightness-75"
        />
        <span className="text-[1.65rem] font-semibold tracking-tight text-[#24785c] transition-colors duration-200 group-hover:text-[#1a5642]">
          AveLoop
        </span>
      </button>
      {title && (
        <span className="text-sm font-medium text-gray-500 truncate">{title}</span>
      )}
      <div className="ml-auto flex items-center gap-5 min-h-9">
        <Link
          href="/history"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-[#0f3d32]"
        >
          <Clock className="w-4 h-4" />
          History
        </Link>
        <Show
          when="signed-in"
          fallback={
            <SignInButton mode="modal">
              <button className="text-sm font-medium text-gray-600 hover:text-[#1a5642] px-2 py-1.5">
                Sign in
              </button>
            </SignInButton>
          }
        >
          <UserButton
            appearance={{
              elements: { avatarBox: "h-9 w-9" },
            }}
          />
        </Show>
      </div>
    </header>
  );
}
