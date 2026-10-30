import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import { articles, emailOutbox, newsletterArticles, newsletters, subscriptions, users } from "@/db/schema";
import { currentAccount, forbidden, positiveIds, unauthorized } from "@/app/api/_utils";
import { recordActivity } from "@/lib/newsroom";

export const dynamic = "force-dynamic";

async function newsletterRows() {
  return getDb().select({
    id: newsletters.id, title: newsletters.title, description: newsletters.description,
    authorId: newsletters.authorId, authorName: users.displayName,
    createdAt: newsletters.createdAt, updatedAt: newsletters.updatedAt,
    articleId: articles.id, articleTitle: articles.title, articleApproved: articles.approved,
  }).from(newsletters)
    .innerJoin(users, eq(newsletters.authorId, users.id))
    .leftJoin(newsletterArticles, eq(newsletters.id, newsletterArticles.newsletterId))
    .leftJoin(articles, eq(newsletterArticles.articleId, articles.id))
    .orderBy(desc(newsletters.createdAt), desc(newsletters.id));
}

export async function GET() {
  const account = await currentAccount();
  if (!account) return unauthorized();
  const rows = await newsletterRows();
  const grouped = new Map<number, { id: number; title: string; description: string; authorId: string; authorName: string; createdAt: string; updatedAt: string; articles: { id: number; title: string }[] }>();
  for (const row of rows) {
    const item = grouped.get(row.id) ?? { id: row.id, title: row.title, description: row.description, authorId: row.authorId, authorName: row.authorName, createdAt: row.createdAt, updatedAt: row.updatedAt, articles: [] };
    if (row.articleId && row.articleTitle && row.articleApproved) item.articles.push({ id: row.articleId, title: row.articleTitle });
    grouped.set(row.id, item);
  }
  return Response.json({ newsletters: [...grouped.values()] });
}

export async function POST(request: Request) {
  const account = await currentAccount();
  if (!account) return unauthorized();
  if (account.role !== "editor" && account.role !== "journalist") return forbidden("Only editors and journalists can create newsletters.");
  const payload: any = await request.json().catch(() => ({}));
  const title = typeof payload?.title === "string" ? payload.title.trim() : "";
  const description = typeof payload?.description === "string" ? payload.description.trim() : "";
  const articleIds = positiveIds(payload?.articleIds);
  if (!title || title.length > 200) return Response.json({ error: "Newsletter title is required and limited to 200 characters." }, { status: 400 });
  const db = getDb();
  if (articleIds.length) {
    const approved = await db.select({ id: articles.id }).from(articles).where(eq(articles.approved, true));
    const approvedIds = new Set(approved.map((row) => row.id));
    if (articleIds.some((id) => !approvedIds.has(id))) return Response.json({ error: "Newsletters can only include approved articles." }, { status: 400 });
  }
  const selectedArticles = articleIds.length
    ? await db.select({ id: articles.id, title: articles.title, authorId: articles.authorId, publisherId: articles.publisherId })
      .from(articles).where(inArray(articles.id, articleIds))
    : [];
  const now = new Date().toISOString();
  const [newsletter] = await db.insert(newsletters).values({ title, description, authorId: account.id, updatedAt: now }).returning();
  if (articleIds.length) await db.insert(newsletterArticles).values(articleIds.map((articleId) => ({ newsletterId: newsletter.id, articleId })));
  const publisherIds = [...new Set(selectedArticles.flatMap((article) => article.publisherId ? [article.publisherId] : []))];
  const independentJournalists = [...new Set(selectedArticles.flatMap((article) => article.publisherId ? [] : [article.authorId]))];
  const sourceFilters = [
    publisherIds.length ? inArray(subscriptions.publisherId, publisherIds) : undefined,
    independentJournalists.length ? and(isNull(subscriptions.publisherId), inArray(subscriptions.journalistId, independentJournalists)) : undefined,
  ].filter(Boolean);
  const recipientIds = sourceFilters.length
    ? await db.selectDistinct({ readerId: subscriptions.readerId }).from(subscriptions).where(or(...sourceFilters))
    : [];
  const recipientEmails = recipientIds.length
    ? await db.select({ email: users.email }).from(users).where(inArray(users.id, recipientIds.map((row) => row.readerId)))
    : [];
  if (recipientEmails.length) {
    const storyList = selectedArticles.map((article) => `• ${article.title}`).join("\n");
    await db.insert(emailOutbox).values(recipientEmails.map(({ email }) => ({
      recipientEmail: email,
      subject: `Newsletter: ${title}`,
      body: `${description || "A curated edition from The Newsroom."}\n\n${storyList}`,
      status: "queued" as const,
    })));
  }
  await recordActivity(account.id, "created", "newsletter", newsletter.id, `Created the newsletter “${title}”; ${recipientEmails.length} subscriber email(s) added to the delivery queue.`);
  return Response.json({ newsletter: { ...newsletter, articles: articleIds }, emailsQueued: recipientEmails.length }, { status: 201 });
}
