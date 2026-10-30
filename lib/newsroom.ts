import { and, count, eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { activity, invitations, publisherMemberships, users } from "@/db/schema";
import { seedDemoContent } from "@/lib/demo-content";

export type Role = "reader" | "editor" | "journalist";
export type NewsroomAccount = {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  isOwner: boolean;
  isDemo?: boolean;
};

const demoOwnerName = "Ntando rocks";

export async function getCurrentAccount(): Promise<NewsroomAccount | null> {
  const identity = await getChatGPTUser();
  if (!identity) return null;

  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.id, identity.userId)).limit(1);
  if (existing) {
    const displayName = existing.isOwner ? demoOwnerName : identity.fullName || identity.displayName || existing.displayName;
    const normalizedEmail = identity.email.trim().toLowerCase();
    const [invitation] = await db.select().from(invitations).where(eq(invitations.email, normalizedEmail)).limit(1);
    const role = (invitation?.role ?? existing.role) as Role;
    if (existing.email !== normalizedEmail || existing.displayName !== displayName || existing.role !== role) {
      await db.update(users).set({ email: normalizedEmail, displayName, role }).where(eq(users.id, identity.userId));
    }
    if (invitation) {
      if (invitation.publisherId && (role === "editor" || role === "journalist")) {
        await db.insert(publisherMemberships).values({ publisherId: invitation.publisherId, userId: existing.id, role }).onConflictDoNothing();
      }
      if (role === "reader") await db.delete(publisherMemberships).where(eq(publisherMemberships.userId, existing.id));
      await db.delete(invitations).where(eq(invitations.email, normalizedEmail));
    }
    const account = { ...existing, email: normalizedEmail, displayName, role, isDemo: identity.isDemo ?? false };
    if (existing.isOwner) await seedDemoContent(account);
    return account;
  }

  const normalizedEmail = identity.email.trim().toLowerCase();
  const [invitation] = await db.select().from(invitations).where(eq(invitations.email, normalizedEmail)).limit(1);
  const [userCount] = await db.select({ total: count() }).from(users);
  const isOwner = Number(userCount?.total ?? 0) === 0;
  const role = (invitation?.role ?? (isOwner ? "editor" : "reader")) as Role;
  const account: NewsroomAccount = {
    id: identity.userId,
    email: normalizedEmail,
    displayName: isOwner ? demoOwnerName : identity.fullName || identity.displayName || normalizedEmail,
    role,
    isOwner,
    isDemo: identity.isDemo ?? false,
  };
  const userRecord = {
    id: account.id,
    email: account.email,
    displayName: account.displayName,
    role: account.role,
    isOwner: account.isOwner,
  };
  await db.insert(users).values(userRecord).onConflictDoNothing();
  if (invitation) {
    if (invitation.publisherId && (role === "editor" || role === "journalist")) {
      await db.insert(publisherMemberships).values({
        publisherId: invitation.publisherId,
        userId: account.id,
        role,
      }).onConflictDoNothing();
    }
    await db.delete(invitations).where(eq(invitations.email, normalizedEmail));
  }
  if (isOwner) await seedDemoContent(account);
  return account;
}

export async function recordActivity(
  actorId: string,
  action: string,
  targetType: string,
  targetId: number | null,
  detail: string,
) {
  await getDb().insert(activity).values({ actorId, action, targetType, targetId, detail });
}
