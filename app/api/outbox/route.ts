import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { emailOutbox } from "@/db/schema";
import { currentAccount, unauthorized } from "@/app/api/_utils";

export const dynamic = "force-dynamic";

export async function GET() {
  const account = await currentAccount();
  if (!account) return unauthorized();
  const db = getDb();
  const rows = account.role === "editor"
    ? await db.select().from(emailOutbox).orderBy(desc(emailOutbox.createdAt)).limit(100)
    : await db.select().from(emailOutbox).where(eq(emailOutbox.recipientEmail, account.email)).orderBy(desc(emailOutbox.createdAt)).limit(100);
  return Response.json({ messages: rows });
}
