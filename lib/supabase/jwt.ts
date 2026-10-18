function toBase64Url(data: string | ArrayBuffer) {
  const buf = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function mintSupabaseJwt(userId: string): Promise<string | null> {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return null;

  const now = Math.floor(Date.now() / 1000);
  const issuer = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "")}/auth/v1`
    : "supabase";

  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: issuer,
    aud: "authenticated",
    role: "authenticated",
    sub: userId,
    iat: now,
    exp: now + 60 * 60,
  };

  const unsigned = `${toBase64Url(JSON.stringify(header))}.${toBase64Url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${toBase64Url(signature)}`;
}
