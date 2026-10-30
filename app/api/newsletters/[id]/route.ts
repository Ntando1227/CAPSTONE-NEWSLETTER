import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { articles, newsletterArticles, newsletters } from "@/db/schema";
import { currentAccount, forbidden, parseId, positiveIds, unauthorized } from "@/app/api/_utils";
import { recordActivity } from "@/lib/newsroom";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const account = await currentAccount();
  if (!account) return unauthorized();
  if (account.role !== "editor" && account.role !== "journalist") return forbidden();
  const id = parseId((await params).id);
  if (!id) return Response.json({ error: "Newsletter not found." }, { status: 404 });
  const db = getDb();
  const [newsletter] = await db.select().from(newsletters).where(eq(newsletters.id, id)).limit(1);
  if (!newsletter) return Response.json({ error: "Newsletter not found." }, { status: 404 });
  if (account.role === "journalist" && newsletter.authorId !== account.id) return forbidden("You can only update your own newsletters.");
  const payload: any = await request.json().catch(() => ({}));
  const title = typeof payload?.title === "string" ? payload.title.trim() : newsletter.title;
  const description = typeof payload?.description === "string" ? payload.description.trim() : newsletter.description;
  if (!title || title.length > 200) return Response.json({ error: "Newsletter title is required and limited to 200 characters." }, { status: 400 });
  if (Array.isArray(payload?.articleIds)) {
    const articleIds = positiveIds(payload.articleIds);
    const approved = await db.select({ id: articles.id }).from(articles).where(eq(articles.approved, true));
    const approvedIds = new Set(approved.map((row) => row.id));
    if (articleIds.some((articleId) => !approvedIds.has(articleId))) return Response.json({ error: "Newsletters can only include approved articles." }, { status: 400 });
    await db.delete(newsletterArticles).where(eq(newsletterArticles.newsletterId, id));
    if (articleIds.length) await db.insert(newsletterArticles).values(articleIds.map((articleId) => ({ newsletterId: id, articleId })));
  }
  await db.update(newsletters).set({ title, description, updatedAt: new Date().toISOString() }).where(eq(newsletters.id, id));
  await recordActivity(account.id, "updated", "newsletter", id, `Updated the newsletter “${title}”.`);
  return Response.json({ updated: true });
}

export async function DELETE(_request: Request, { params }: Context) {
  const account = await currentAccount();
  if (!account) return unauthorized();
  if (account.role !== "editor" && account.role !== "journalist") return forbidden();
  const id = parseId((await params).id);
  if (!id) return Response.json({ error: "Newsletter not found." }, { status: 404 });
  const db = getDb();
  const [newsletter] = await db.select().from(newsletters).where(eq(newsletters.id, id)).limit(1);
  if (!newsletter) return Response.json({ error: "Newsletter not found." }, { status: 404 });
  if (account.role === "journalist" && newsletter.authorId !== account.id) return forbidden("You can only delete your own newsletters.");
  await db.delete(newsletters).where(eq(newsletters.id, id));
  await recordActivity(account.id, "deleted", "newsletter", id, `Deleted the newsletter “${newsletter.title}”.`);
  return new Response(null, { status: 204 });
}
