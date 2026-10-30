import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { articles, publisherMemberships, publishers, users } from "@/db/schema";
import { canWritePublisher, currentAccount, forbidden, parseId, unauthorized } from "@/app/api/_utils";
import { recordActivity } from "@/lib/newsroom";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

async function loadArticle(id: number) {
  const [row] = await getDb().select({
    id: articles.id, title: articles.title, content: articles.content,
    authorId: articles.authorId, authorName: users.displayName,
    publisherId: articles.publisherId, publisherName: publishers.name,
    approved: articles.approved, createdAt: articles.createdAt,
    updatedAt: articles.updatedAt, approvedAt: articles.approvedAt,
  }).from(articles)
    .innerJoin(users, eq(articles.authorId, users.id))
    .leftJoin(publishers, eq(articles.publisherId, publishers.id))
    .where(eq(articles.id, id)).limit(1);
  return row;
}

export async function GET(_request: Request, { params }: Context) {
  const account = await currentAccount();
  if (!account) return unauthorized();
  const id = parseId((await params).id);
  if (!id) return Response.json({ error: "Article not found." }, { status: 404 });
  const article = await loadArticle(id);
  if (!article || (!article.approved && account.role === "reader")) {
    return Response.json({ error: "Article not found." }, { status: 404 });
  }
  if (!article.approved && account.role === "journalist" && article.authorId !== account.id) {
    return Response.json({ error: "Article not found." }, { status: 404 });
  }
  return Response.json({ article });
}

export async function PUT(request: Request, { params }: Context) {
  const account = await currentAccount();
  if (!account) return unauthorized();
  const id = parseId((await params).id);
  if (!id) return Response.json({ error: "Article not found." }, { status: 404 });
  if (account.role !== "editor" && account.role !== "journalist") return forbidden();
  const db = getDb();
  const [current] = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
  if (!current) return Response.json({ error: "Article not found." }, { status: 404 });
  if (account.role === "journalist" && current.authorId !== account.id) return forbidden("You can only update your own articles.");
  const payload: any = await request.json().catch(() => ({}));
  const title = typeof payload?.title === "string" ? payload.title.trim() : "";
  const content = typeof payload?.content === "string" ? payload.content.trim() : "";
  if (!title || title.length > 240 || !content || content.length > 30000) {
    return Response.json({ error: "Add a title and article text. The title limit is 240 characters." }, { status: 400 });
  }
  const publisherId = payload?.publisherId === null || payload?.publisherId === "" || payload?.publisherId === undefined
    ? null : Number(payload.publisherId);
  if (publisherId !== null) {
    if (!Number.isInteger(publisherId)) return Response.json({ error: "Choose a valid publication." }, { status: 400 });
    const author = account.role === "editor" ? current.authorId : account.id;
    if (account.role === "journalist" && !(await canWritePublisher(publisherId, author))) {
      return forbidden("You must be a journalist member of that publication.");
    }
    if (account.role === "editor") {
      const [membership] = await db.select({ id: publisherMemberships.id }).from(publisherMemberships)
        .where(and(eq(publisherMemberships.publisherId, publisherId), eq(publisherMemberships.userId, current.authorId), eq(publisherMemberships.role, "journalist"))).limit(1);
      if (!membership) return Response.json({ error: "The author must be a journalist member of that publication." }, { status: 400 });
    }
  }
  await db.update(articles).set({ title, content, publisherId, approved: false, approvedAt: null, updatedAt: new Date().toISOString() }).where(eq(articles.id, id));
  await recordActivity(account.id, "updated", "article", id, `Updated “${title}”; it was returned to editorial review.`);
  return Response.json({ article: await loadArticle(id) });
}

export async function DELETE(_request: Request, { params }: Context) {
  const account = await currentAccount();
  if (!account) return unauthorized();
  const id = parseId((await params).id);
  if (!id) return Response.json({ error: "Article not found." }, { status: 404 });
  if (account.role !== "editor" && account.role !== "journalist") return forbidden();
  const db = getDb();
  const [article] = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
  if (!article) return Response.json({ error: "Article not found." }, { status: 404 });
  if (account.role === "journalist" && article.authorId !== account.id) return forbidden("You can only delete your own articles.");
  await db.delete(articles).where(eq(articles.id, id));
  await recordActivity(account.id, "deleted", "article", id, `Deleted “${article.title}”.`);
  return new Response(null, { status: 204 });
}
