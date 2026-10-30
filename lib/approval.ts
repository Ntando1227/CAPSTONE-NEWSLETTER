import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { approvalLogs, articles, publishers, users } from "@/db/schema";

export async function recordApprovedArticle(articleId: number) {
  const db = getDb();
  const [article] = await db.select({
    id: articles.id, title: articles.title, approved: articles.approved,
    approvedAt: articles.approvedAt, publisherName: publishers.name, authorName: users.displayName,
  }).from(articles).innerJoin(users, eq(articles.authorId, users.id)).leftJoin(publishers, eq(articles.publisherId, publishers.id))
    .where(eq(articles.id, articleId)).limit(1);
  if (!article || !article.approved) return null;
  const [log] = await db.insert(approvalLogs).values({
    articleId: article.id,
    articleTitle: article.title,
    sourceName: article.publisherName || article.authorName,
    approvedAt: article.approvedAt || new Date().toISOString(),
  }).onConflictDoNothing().returning();
  if (log) return { ...log, created: true };
  const [existing] = await db.select().from(approvalLogs).where(eq(approvalLogs.articleId, article.id)).limit(1);
  return existing ? { ...existing, created: false } : null;
}
