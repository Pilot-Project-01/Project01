import { NextResponse, type NextRequest } from "next/server";

// HTTP Basic Auth gate for the admin dashboard (Layer 2). The real data lock is
// the backend's ADMIN_API_TOKEN (Layer 1); this just stops a stranger from
// loading the page. Credentials come from env so nothing is hard-coded.
//
// If ADMIN_USER / ADMIN_PASS are unset (e.g. local dev), the gate is OFF so you
// aren't prompted on every reload. In production, set both to enable it.

const USER = process.env.ADMIN_USER ?? "";
const PASS = process.env.ADMIN_PASS ?? "";

export const config = {
  matcher: "/admin/:path*",
};

export function middleware(req: NextRequest) {
  // Gate disabled when credentials aren't configured.
  if (!USER || !PASS) return NextResponse.next();

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    const decoded = atob(header.slice("Basic ".length));
    const sep = decoded.indexOf(":");
    const user = decoded.slice(0, sep);
    const pass = decoded.slice(sep + 1);
    if (safeEqual(user, USER) && safeEqual(pass, PASS)) {
      return NextResponse.next();
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Admin", charset="UTF-8"' },
  });
}

// Length-independent constant-time-ish comparison (Edge runtime has no crypto
// timingSafeEqual). Good enough to avoid trivial timing leaks on a Basic gate.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
