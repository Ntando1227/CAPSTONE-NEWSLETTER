import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { articles, publishers, users } from "@/db/schema";
import { canWritePublisher, currentAccount, forbidden, unauthorized } from "@/app/api/_utils";
import { recordActivity } from "@/lib/newsroom";

export const dynamic = "force-dynamic";

async function articleRows() {
  return getDb().select({
    id: articles.id, title: articles.title, content: articles.content,
    authorId: articles.authorId, authorName: users.displayName,
    publisherId: articles.publisherId, publisherName: publishers.name,
    approved: articles.approved, createdAt: articles.createdAt,
    updatedAt: articles.updatedAt, approvedAt: articles.approvedAt,
  }).from(articles)
    .innerJoin(users, eq(articles.authorId, users.id))
    .leftJoin(publishers, eq(articles.publisherId, publishers.id))
    .orderBy(desc(articles.createdAt), desc(articles.id));
}

export async function GET() {
  const account = await currentAccount();
  if (!account) return unauthorized();
  const rows = await articleRows();
  const visible = account.role === "editor"
    ? rows
    : account.role === "journalist"
      ? rows.filter((row) => row.approved || row.authorId === account.id)
      : rows.filter((row) => row.approved);
  return Response.json({ articles: visible });
}

export async function POST(request: Request) {
  const account = await currentAccount();
  if (!account) return unauthorized();
  if (account.role !== "journalist") return forbidden("Only journalists can submit articles.");
  const payload: any = await request.json().catch(() => ({}));
  const title = typeof payload?.title === "string" ? payload.title.trim() : "";
  const content = typeof payload?.content === "string" ? payload.content.trim() : "";
  const publisherId = payload?.publisherId === null || payload?.publisherId === undefined || payload?.publisherId === ""
    ? null : Number(payload.publisherId);
  if (!title || title.length > 240 || !content || content.length > 30000) {
    return Response.json({ error: "Add a title (1-240 characters) and article text (up to 30,000 characters)." }, { status: 400 });
  }
  if (publisherId !== null && (!Number.isInteger(publisherId) || !(await canWritePublisher(publisherId, account.id)))) {
    return forbidden("You must be a journalist member of that publication.");
  }
  const now = new Date().toISOString();
  const [article] = await getDb().insert(articles).values({
    title, content, authorId: account.id, publisherId, updatedAt: now,
  }).returning();
  await recordActivity(account.id, "submitted", "article", article.id, `Submitted “${title}” for editorial review.`);
  return Response.json({ article }, { status: 201 });
}
