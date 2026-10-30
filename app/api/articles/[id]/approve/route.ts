import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { activity, articles, emailOutbox, publishers, subscriptions, users } from "@/db/schema";
import { currentAccount, parseId, unauthorized } from "@/app/api/_utils";
import { recordApprovedArticle } from "@/lib/approval";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Context) {
  const account = await currentAccount();
  if (!account) return unauthorized();
  if (account.role !== "editor") return Response.json({ error: "Only editors can approve articles." }, { status: 403 });
  const id = parseId((await params).id);
  if (!id) return Response.json({ error: "Article not found." }, { status: 404 });

  const db = getDb();
  const [article] = await db.select({
    id: articles.id, title: articles.title, content: articles.content, authorId: articles.authorId,
    publisherId: articles.publisherId, publisherName: publishers.name, authorName: users.displayName, approved: articles.approved,
  }).from(articles).innerJoin(users, eq(articles.authorId, users.id)).leftJoin(publishers, eq(articles.publisherId, publishers.id))
    .where(eq(articles.id, id)).limit(1);
  if (!article) return Response.json({ error: "Article not found." }, { status: 404 });
  if (article.approved) return Response.json({ alreadyApproved: true, emailsQueued: 0, apiLogged: true });

  const approvedAt = new Date().toISOString();
  await db.update(articles).set({ approved: true, approvedAt, updatedAt: approvedAt }).where(eq(articles.id, id));
  const subscriberRows = await db.select({ readerId: subscriptions.readerId }).from(subscriptions)
    .where(article.publisherId
      ? eq(subscriptions.publisherId, article.publisherId)
      : eq(subscriptions.journalistId, article.authorId));
  const subscriberIds = [...new Set(subscriberRows.map((row) => row.readerId))];
  const subscribers = subscriberIds.length
    ? await db.select({ email: users.email }).from(users).where(inArray(users.id, subscriberIds))
    : [];
  const sourceName = article.publisherName || article.authorName;
  if (subscribers.length) {
    await db.insert(emailOutbox).values(subscribers.map(({ email }) => ({
      articleId: id,
      recipientEmail: email,
      subject: `New article: ${article.title}`,
      body: `${article.title}\n\n${article.content}\n\nFrom ${sourceName}`,
      status: "queued" as const,
    })));
  }
  const apiLog = await recordApprovedArticle(id);
  await db.insert(activity).values({
    actorId: account.id, action: "approved", targetType: "article", targetId: id,
    detail: `Approved “${article.title}”; ${subscribers.length} subscriber email(s) added to the delivery outbox.`,
  });
  return Response.json({ approved: true, emailsQueued: subscribers.length, apiLogged: Boolean(apiLog) });
}
