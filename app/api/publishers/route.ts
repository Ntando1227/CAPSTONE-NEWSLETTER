import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { publisherMemberships, publishers, users } from "@/db/schema";
import { currentAccount, forbidden, unauthorized } from "@/app/api/_utils";
import { recordActivity } from "@/lib/newsroom";

export const dynamic = "force-dynamic";

export async function GET() {
  const account = await currentAccount();
  if (!account) return unauthorized();
  const rows = await getDb().select({
    id: publishers.id, name: publishers.name, description: publishers.description,
    website: publishers.website, createdAt: publishers.createdAt,
    memberId: publisherMemberships.id, memberUserId: publisherMemberships.userId, memberRole: publisherMemberships.role,
    memberName: users.displayName, memberEmail: users.email,
  }).from(publishers)
    .leftJoin(publisherMemberships, eq(publishers.id, publisherMemberships.publisherId))
    .leftJoin(users, eq(publisherMemberships.userId, users.id))
    .orderBy(desc(publishers.createdAt));
  const grouped = new Map<number, { id: number; name: string; description: string; website: string; createdAt: string; members: { id: number; userId: string; role: string; name: string; email: string }[] }>();
  for (const row of rows) {
    const item = grouped.get(row.id) ?? { id: row.id, name: row.name, description: row.description, website: row.website, createdAt: row.createdAt, members: [] };
    if (row.memberId && row.memberName && row.memberEmail && row.memberUserId) item.members.push({ id: row.memberId, userId: row.memberUserId, role: row.memberRole ?? "", name: row.memberName, email: row.memberEmail });
    grouped.set(row.id, item);
  }
  return Response.json({ publishers: [...grouped.values()] });
}

export async function POST(request: Request) {
  const account = await currentAccount();
  if (!account) return unauthorized();
  if (account.role !== "editor") return forbidden("Only editors can create publications.");
  const payload: any = await request.json().catch(() => ({}));
  const name = typeof payload?.name === "string" ? payload.name.trim() : "";
  const description = typeof payload?.description === "string" ? payload.description.trim() : "";
  const website = typeof payload?.website === "string" ? payload.website.trim() : "";
  if (!name || name.length > 160) return Response.json({ error: "Publication name is required and must be under 160 characters." }, { status: 400 });
  if (website && !/^https?:\/\//i.test(website)) return Response.json({ error: "Website links must start with http:// or https://." }, { status: 400 });
  const db = getDb();
  const [publisher] = await db.insert(publishers).values({ name, description, website, createdBy: account.id }).returning();
  await db.insert(publisherMemberships).values({ publisherId: publisher.id, userId: account.id, role: "editor" }).onConflictDoNothing();
  await recordActivity(account.id, "created", "publisher", publisher.id, `Created the publication “${name}”.`);
  return Response.json({ publisher }, { status: 201 });
}
