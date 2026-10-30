import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { currentAccount, unauthorized } from "@/app/api/_utils";

export const dynamic = "force-dynamic";

export async function GET() {
  const account = await currentAccount();
  if (!account) return unauthorized();
  const journalists = await getDb().select({ id: users.id, name: users.displayName, email: users.email })
    .from(users).where(eq(users.role, "journalist")).orderBy(asc(users.displayName));
  return Response.json({ journalists });
}
