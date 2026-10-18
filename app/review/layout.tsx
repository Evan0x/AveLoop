import { auth } from "@clerk/nextjs/server";

export const instant = false;

export default async function ReviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await auth.protect();
  return children;
}
