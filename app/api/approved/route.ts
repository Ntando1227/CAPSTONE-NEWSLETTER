import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { approvalLogs } from "@/db/schema";
import { currentAccount, unauthorized } from "@/app/api/_utils";
import { recordApprovedArticle } from "@/lib/approval";

export const dynamic = "force-dynamic";

export async function GET() {
  const account = await currentAccount();
  if (!account) return unauthorized();
  if (account.role !== "editor") return Response.json({ error: "Only editors can view the approval log." }, { status: 403 });
  const logs = await getDb().select().from(approvalLogs).orderBy(desc(approvalLogs.receivedAt)).limit(100);
  return Response.json({ logs });
}

export async function POST(request: Request) {
  const account = await currentAccount();
  if (!account) return unauthorized();
  if (account.role !== "editor") return Response.json({ error: "Only editors can log an approved article." }, { status: 403 });
  const payload: any = await request.json().catch(() => ({}));
  const articleId = Number(payload?.articleId);
  if (!Number.isInteger(articleId) || articleId < 1) return Response.json({ error: "Provide a valid articleId." }, { status: 400 });
  const log = await recordApprovedArticle(articleId);
  if (!log) return Response.json({ error: "Only an approved article can be logged." }, { status: 404 });
  return Response.json({ log }, { status: log.created ? 201 : 200 });
}
