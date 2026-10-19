import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { extractCarePlan, type ExtractAttachment } from "@/lib/extract-care-plan";

export const maxDuration = 60;

async function readPayload(req: NextRequest): Promise<{ notes: string; attachment?: ExtractAttachment }> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const notes = String(form.get("notes") ?? "");
    const file = form.get("file");
    if (file instanceof File && file.size > 0) {
      if (file.size > 8 * 1024 * 1024) {
        throw new Error("FILE_TOO_LARGE");
      }
      return {
        notes,
        attachment: {
          name: file.name || "discharge",
          type: file.type || "application/octet-stream",
          buffer: Buffer.from(await file.arrayBuffer()),
        },
      };
    }
    return { notes };
  }

  const body = await req.json();
  return { notes: typeof body.notes === "string" ? body.notes : "" };
}

export async function POST(req: NextRequest) {
  try {
    const { error } = await requireUserId();
    if (error) return error;

    const { notes, attachment } = await readPayload(req);
    if (!attachment && (!notes || notes.trim().length < 20)) {
      return NextResponse.json(
        { error: "Paste notes or upload a discharge photo/PDF." },
        { status: 400 }
      );
    }

    const careData = await extractCarePlan(notes.trim(), attachment);
    return NextResponse.json(careData);
  } catch (err) {
    console.error("Extract error:", err);
    if (err instanceof Error && err.message === "FILE_TOO_LARGE") {
      return NextResponse.json({ error: "File is too large (max 8MB)." }, { status: 400 });
    }
    if (err instanceof SyntaxError) {
      return NextResponse.json({ error: "Failed to parse AI response. Please try again." }, { status: 500 });
    }
    const message = err instanceof Error ? err.message.replace(/\s+/g, " ").trim() : "";
    return NextResponse.json(
      { error: message.slice(0, 220) || "Failed to extract care plan. Please try again." },
      { status: 500 }
    );
  }
}
