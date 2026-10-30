import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { activity, users } from "@/db/schema";
import { currentAccount, unauthorized } from "@/app/api/_utils";

export const dynamic = "force-dynamic";

export async function GET() {
  const account = await currentAccount();
  if (!account) return unauthorized();
  const rows = await getDb().select({
    id: activity.id, action: activity.action, targetType: activity.targetType,
    targetId: activity.targetId, detail: activity.detail, createdAt: activity.createdAt,
    actorName: users.displayName,
  }).from(activity).innerJoin(users, eq(activity.actorId, users.id))
    .orderBy(desc(activity.createdAt), desc(activity.id)).limit(100);
  return Response.json({ activity: rows });
}
