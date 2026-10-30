import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { invitations, publisherMemberships, publishers, users } from "@/db/schema";
import { currentAccount, forbidden, unauthorized } from "@/app/api/_utils";
import { recordActivity } from "@/lib/newsroom";

export const dynamic = "force-dynamic";

export async function GET() {
  const account = await currentAccount();
  if (!account) return unauthorized();
  if (account.role !== "editor") return forbidden();
  const rows = await getDb().select({ email: invitations.email, role: invitations.role, publisherId: invitations.publisherId, createdAt: invitations.createdAt, publisherName: publishers.name })
    .from(invitations).leftJoin(publishers, eq(invitations.publisherId, publishers.id)).orderBy(asc(invitations.email));
  return Response.json({ invitations: rows });
}

export async function POST(request: Request) {
  const account = await currentAccount();
  if (!account) return unauthorized();
  if (account.role !== "editor") return forbidden("Only editors can invite accounts.");
  const payload: any = await request.json().catch(() => ({}));
  const email = typeof payload?.email === "string" ? payload.email.trim().toLowerCase() : "";
  const role = payload?.role;
  const publisherId = payload?.publisherId === null || payload?.publisherId === undefined || payload?.publisherId === ""
    ? null : Number(payload.publisherId);
  if (!/^\S+@\S+\.\S+$/.test(email)) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  if (!["reader", "editor", "journalist"].includes(role)) return Response.json({ error: "Choose an account role." }, { status: 400 });
  if (publisherId !== null) {
    if (!Number.isInteger(publisherId)) return Response.json({ error: "Choose a valid publication." }, { status: 400 });
    const [publisher] = await getDb().select({ id: publishers.id }).from(publishers).where(eq(publishers.id, publisherId)).limit(1);
    if (!publisher) return Response.json({ error: "That publication could not be found." }, { status: 404 });
    if (role === "reader") return Response.json({ error: "Readers cannot join an editorial team." }, { status: 400 });
  }
  const db = getDb();
  await db.insert(invitations).values({ email, role, publisherId, createdBy: account.id })
    .onConflictDoUpdate({ target: invitations.email, set: { role, publisherId, createdBy: account.id, createdAt: new Date().toISOString() } });
  const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existingUser) {
    await db.update(users).set({ role }).where(eq(users.id, existingUser.id));
    if (publisherId && (role === "editor" || role === "journalist")) {
      await db.insert(publisherMemberships).values({ publisherId, userId: existingUser.id, role }).onConflictDoUpdate({ target: [publisherMemberships.publisherId, publisherMemberships.userId], set: { role } });
    }
    if (role === "reader") await db.delete(publisherMemberships).where(eq(publisherMemberships.userId, existingUser.id));
    await db.delete(invitations).where(eq(invitations.email, email));
  }
  await recordActivity(account.id, "invited", "user", null, `Invited ${email} as ${role}.`);
  return Response.json({ invitation: { email, role, publisherId }, instruction: "The person can accept by signing into this Site with the invited email address." }, { status: 201 });
}
