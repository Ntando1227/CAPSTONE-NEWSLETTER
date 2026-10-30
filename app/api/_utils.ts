import { and, eq } from "drizzle-orm";
import { getCurrentAccount, type NewsroomAccount, type Role } from "@/lib/newsroom";
import { getDb } from "@/db";
import { publisherMemberships } from "@/db/schema";

export async function currentAccount() {
  return getCurrentAccount();
}

export function unauthorized() {
  return Response.json({ error: "Sign in to continue." }, { status: 401 });
}

export function forbidden(message = "You do not have permission to do that.") {
  return Response.json({ error: message }, { status: 403 });
}

export async function roleAccount(roles: Role[]): Promise<NewsroomAccount | Response> {
  const account = await currentAccount();
  if (!account) return unauthorized();
  return roles.includes(account.role) ? account : forbidden();
}

export function isResponse(value: NewsroomAccount | Response): value is Response {
  return value instanceof Response;
}

export async function canWritePublisher(publisherId: number, userId: string) {
  const [membership] = await getDb().select({ id: publisherMemberships.id })
    .from(publisherMemberships)
    .where(and(
      eq(publisherMemberships.publisherId, publisherId),
      eq(publisherMemberships.userId, userId),
      eq(publisherMemberships.role, "journalist"),
    )).limit(1);
  return Boolean(membership);
}

export function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function positiveIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => Number(item)).filter((id): id is number => Number.isInteger(id) && id > 0))];
}

export function stringIds(value: unknown, excluded = ""): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0 && item !== excluded))];
}
