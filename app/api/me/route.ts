import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { currentAccount, forbidden, unauthorized } from "@/app/api/_utils";

export const dynamic = "force-dynamic";

export async function GET() {
  const account = await currentAccount();
  return account ? Response.json({ user: account }) : unauthorized();
}

export async function PATCH(request: Request) {
  const account = await currentAccount();
  if (!account) return unauthorized();
  if (!account.isOwner) return forbidden("Only the site owner can change the preview role.");
  const payload: any = await request.json().catch(() => ({}));
  const role = payload?.role;
  if (!["reader", "editor", "journalist"].includes(role)) {
    return Response.json({ error: "Choose Reader, Editor, or Journalist." }, { status: 400 });
  }
  await getDb().update(users).set({ role }).where(eq(users.id, account.id));
  return Response.json({ user: { ...account, role } });
}
