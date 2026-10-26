import { currentUser } from "@/lib/auth";
import { emailConfigured } from "@/lib/email";
import { googleConfigured } from "@/lib/google";

export const dynamic = "force-dynamic";

// GET -> { user | null, google, reset } so the page knows who is signed in and which sign-in options exist.
export async function GET(request: Request) {
  const user = await currentUser(request);
  return Response.json(
    { user: user && { email: user.email, name: user.name, avatar: user.avatar }, google: googleConfigured(), reset: emailConfigured() },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
