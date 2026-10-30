import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { publishers, subscriptions, users } from "@/db/schema";
import { currentAccount, forbidden, positiveIds, stringIds, unauthorized } from "@/app/api/_utils";

export const dynamic = "force-dynamic";

export async function GET() {
  const account = await currentAccount();
  if (!account) return unauthorized();
  if (account.role !== "reader") return forbidden("Subscriptions are managed by readers.");
  const rows = await getDb().select().from(subscriptions).where(eq(subscriptions.readerId, account.id));
  return Response.json({ publisherIds: rows.flatMap((row) => row.publisherId ? [row.publisherId] : []), journalistIds: rows.flatMap((row) => row.journalistId ? [row.journalistId] : []) });
}

export async function PUT(request: Request) {
  const account = await currentAccount();
  if (!account) return unauthorized();
  if (account.role !== "reader") return forbidden("Subscriptions are managed by readers.");
  const payload: any = await request.json().catch(() => ({}));
  const publisherIds = positiveIds(payload?.publisherIds);
  const journalistIds = stringIds(payload?.journalistIds, account.id);
  const db = getDb();
  if (publisherIds.length) {
    const existing = await db.select({ id: publishers.id }).from(publishers).where(inArray(publishers.id, publisherIds));
    if (existing.length !== publisherIds.length) return Response.json({ error: "One or more publications no longer exist." }, { status: 400 });
  }
  if (journalistIds.length) {
    const eligible = await db.select({ id: users.id }).from(users).where(and(eq(users.role, "journalist"), inArray(users.id, journalistIds)));
    if (eligible.length !== journalistIds.length) return Response.json({ error: "Choose active journalist accounts only." }, { status: 400 });
  }
  await db.delete(subscriptions).where(eq(subscriptions.readerId, account.id));
  if (publisherIds.length) await db.insert(subscriptions).values(publisherIds.map((publisherId) => ({ readerId: account.id, publisherId, journalistId: null })));
  if (journalistIds.length) await db.insert(subscriptions).values(journalistIds.map((journalistId) => ({ readerId: account.id, publisherId: null, journalistId })));
  return Response.json({ saved: true, publisherCount: publisherIds.length, journalistCount: journalistIds.length });
}
