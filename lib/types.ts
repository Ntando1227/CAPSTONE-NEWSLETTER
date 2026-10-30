import type { NewsroomAccount } from "@/lib/newsroom";

export type Account = NewsroomAccount;
export type Article = {
  id: number;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  publisherId: number | null;
  publisherName: string | null;
  approved: boolean;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
};
export type Publisher = {
  id: number;
  name: string;
  description: string;
  website: string;
  createdAt: string;
  members: { id: number; userId: string; role: string; name: string; email: string }[];
};
export type Newsletter = {
  id: number;
  title: string;
  description: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  articles: { id: number; title: string }[];
};
export type Journalist = { id: string; name: string; email: string };
export type ActivityItem = { id: number; action: string; targetType: string; targetId: number | null; detail: string; createdAt: string; actorName: string };
export type OutboxItem = { id: number; articleId: number | null; recipientEmail: string; subject: string; body: string; status: string; createdAt: string };
export type ApprovalLog = { id: number; articleId: number | null; articleTitle: string; sourceName: string; approvedAt: string; receivedAt: string };
export type Invitation = { email: string; role: string; publisherId: number | null; publisherName: string | null; createdAt: string };
