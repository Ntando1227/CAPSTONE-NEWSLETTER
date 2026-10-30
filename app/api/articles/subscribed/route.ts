import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import { articles, publishers, subscriptions, users } from "@/db/schema";
import { currentAccount, forbidden, unauthorized } from "@/app/api/_utils";

export const dynamic = "force-dynamic";

export async function GET() {
  const account = await currentAccount();
  if (!account) return unauthorized();
  if (account.role !== "reader") return forbidden("This feed is for reader accounts.");
  const db = getDb();
  const followed = await db.select().from(subscriptions).where(eq(subscriptions.readerId, account.id));
  const publisherIds = followed.flatMap((row) => row.publisherId ? [row.publisherId] : []);
  const journalistIds = followed.flatMap((row) => row.journalistId ? [row.journalistId] : []);
  if (!publisherIds.length && !journalistIds.length) return Response.json({ articles: [] });

  const feedFilter = or(
    publisherIds.length ? inArray(articles.publisherId, publisherIds) : undefined,
    journalistIds.length
      ? and(isNull(articles.publisherId), inArray(articles.authorId, journalistIds))
      : undefined,
  );
  const rows = await db.select({
    id: articles.id, title: articles.title, content: articles.content,
    authorId: articles.authorId, authorName: users.displayName,
    publisherId: articles.publisherId, publisherName: publishers.name,
    approved: articles.approved, createdAt: articles.createdAt,
    updatedAt: articles.updatedAt, approvedAt: articles.approvedAt,
  }).from(articles)
    .innerJoin(users, eq(articles.authorId, users.id))
    .leftJoin(publishers, eq(articles.publisherId, publishers.id))
    .where(and(eq(articles.approved, true), feedFilter))
    .orderBy(desc(articles.createdAt), desc(articles.id));
  return Response.json({ articles: rows });
}
