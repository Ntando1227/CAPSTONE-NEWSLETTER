import { count } from "drizzle-orm";
import { getDb } from "@/db";
import {
  activity,
  approvalLogs,
  articles,
  emailOutbox,
  newsletterArticles,
  newsletters,
  publisherMemberships,
  publishers,
  subscriptions,
  users,
} from "@/db/schema";
import type { NewsroomAccount } from "@/lib/newsroom";

const demoContributors = [
  { id: "demo-journalist-naledi", email: "naledi@demo.newsroom.test", displayName: "Naledi Molefe", role: "journalist" as const, isOwner: false },
  { id: "demo-journalist-lwazi", email: "lwazi@demo.newsroom.test", displayName: "Lwazi Maseko", role: "journalist" as const, isOwner: false },
  { id: "demo-journalist-amina", email: "amina@demo.newsroom.test", displayName: "Amina Jacobs", role: "journalist" as const, isOwner: false },
];

const demoPublications = [
  { name: "The Corner Desk", description: "Neighbourhood reporting, public spaces and the people who bring places to life.", website: "" },
  { name: "Common Ground", description: "Practical ideas for more connected, resourceful communities.", website: "" },
  { name: "Small Hours", description: "Culture, craft and the makers shaping everyday life.", website: "" },
];

const demoStories = [
  {
    key: "story-bus-stop",
    title: "A bus stop became the neighbourhood noticeboard",
    content: "On weekday mornings, the shelter on Market Road is a place to wait. On Saturdays, it becomes something else: a meeting point for people sharing lifts, second-hand books and news about what is happening nearby.\n\nA hand-painted board now carries a weekly list of community events. Residents update it themselves, and the corner shop keeps spare paper and markers behind the counter. The idea is simple, but it has made local information easier to find without a group chat or an app.\n\nThe next step is to add a small weather cover and a clear contact for anyone who wants to post an event. For now, the board is doing what a good public noticeboard should do: giving neighbours a reason to pause and talk.",
    authorId: "demo-journalist-naledi",
    publisherName: "The Corner Desk",
    daysAgo: 1,
    approved: true,
  },
  {
    key: "story-repair-cafe",
    title: "A repair table gives old appliances another chance",
    content: "The first repair table at the community hall had three volunteers, a box of tools and a queue of small appliances that had been put aside for months. By lunchtime, a kettle, a desk lamp and two radios were working again.\n\nVolunteers say the best part is learning together. People bring an item, explain what stopped working and watch the repair step by step. A retired electrician helps with safety checks, while younger participants handle the sign-in desk and photograph each repair for the next session.\n\nThe group plans to meet on the first Saturday of each month. Repairs depend on the fault and available parts, but the organisers hope the table will make it easier to try fixing something before replacing it.",
    authorId: "demo-journalist-lwazi",
    publisherName: "Common Ground",
    daysAgo: 2,
    approved: true,
  },
  {
    key: "story-makers-market",
    title: "A weekend market makes room for first-time makers",
    content: "At the edge of the sports field, a row of small stalls has become a regular Saturday stop. The market began with five tables and now makes space for local bakers, beadworkers, illustrators and home gardeners.\n\nA shared booking sheet helps new sellers try a single weekend without committing to a long lease. Stallholders also take turns welcoming visitors and keeping a small map of nearby services at the entrance.\n\nOrganisers say they want the market to stay affordable as it grows. Their next experiment is a monthly skills corner, where one maker can demonstrate a technique and talk about the costs behind their work.",
    authorId: "demo-journalist-amina",
    publisherName: "Small Hours",
    daysAgo: 3,
    approved: true,
  },
  {
    key: "story-community-hall",
    title: "The community hall opens its doors for an evening reading room",
    content: "A once-quiet room at the community hall is being prepared for evening study and reading. The volunteer team has collected donated books, repaired two desks and arranged a rota so the room can stay open after the school day.\n\nParents asked for a calm place where learners could read before heading home. The first month will be a small trial, with sign-in sheets and a weekly check-in to understand what families need.\n\nThe organisers are still looking for desk lamps and age-appropriate books. If the trial is useful, they hope to add a Saturday session later in the term.",
    authorId: "demo-journalist-naledi",
    publisherName: "The Corner Desk",
    daysAgo: 0,
    approved: false,
  },
  {
    key: "story-shared-garden",
    title: "A shared garden is becoming a weekend classroom",
    content: "The garden behind the old clinic started with a few raised beds and a water rota. Now children help label seedlings, neighbours exchange cuttings and a local cook visits once a month to show how to use what is ready to harvest.\n\nThe project keeps its plans modest. Each bed has a named volunteer, and the group records what grows well through the changing weather. Leftover seedlings are offered to households that want to start a pot or patch of their own.\n\nA Saturday session will introduce composting and seed saving. The team says the garden works best when everyone can contribute something small and see the result over time.",
    authorId: "demo-journalist-lwazi",
    publisherName: "Common Ground",
    daysAgo: 0,
    approved: false,
  },
];

export async function seedDemoContent(owner: NewsroomAccount) {
  if (!owner.isOwner) return;
  const db = getDb();
  const [publisherCount] = await db.select({ total: count() }).from(publishers);
  const [articleCount] = await db.select({ total: count() }).from(articles);
  if (Number(publisherCount?.total ?? 0) > 0 || Number(articleCount?.total ?? 0) > 0) return;

  await db.insert(users).values(demoContributors).onConflictDoNothing();
  const createdPublications = await db.insert(publishers).values(demoPublications.map((item) => ({ ...item, createdBy: owner.id }))).returning();
  if (!createdPublications.length) return;
  const publicationByName = new Map(createdPublications.map((item) => [item.name, item.id]));
  await db.insert(publisherMemberships).values([
    { publisherId: publicationByName.get("The Corner Desk")!, userId: owner.id, role: "editor" as const },
    { publisherId: publicationByName.get("The Corner Desk")!, userId: "demo-journalist-naledi", role: "journalist" as const },
    { publisherId: publicationByName.get("Common Ground")!, userId: "demo-journalist-lwazi", role: "journalist" as const },
    { publisherId: publicationByName.get("Small Hours")!, userId: "demo-journalist-amina", role: "journalist" as const },
  ]);

  const now = Date.now();
  const createdStories = await db.insert(articles).values(demoStories.map((story) => {
    const timestamp = new Date(now - story.daysAgo * 86_400_000).toISOString();
    return {
      title: story.title,
      content: story.content,
      authorId: story.authorId,
      publisherId: publicationByName.get(story.publisherName)!,
      approved: story.approved,
      createdAt: timestamp,
      updatedAt: timestamp,
      approvedAt: story.approved ? timestamp : null,
    };
  })).returning();

  const storyByTitle = new Map(createdStories.map((item) => [item.title, item]));
  const approvedStories = demoStories.filter((story) => story.approved).flatMap((story) => {
    const created = storyByTitle.get(story.title);
    const sourceName = story.publisherName;
    return created ? [{
      articleId: created.id,
      articleTitle: created.title,
      sourceName,
      approvedAt: created.approvedAt!,
    }] : [];
  });
  await db.insert(approvalLogs).values(approvedStories);

  const [newsletter] = await db.insert(newsletters).values({
    title: "The Saturday Edit",
    description: "A short collection about shared spaces, local craft and small ideas that bring people together.",
    authorId: owner.id,
  }).returning();
  await db.insert(newsletterArticles).values(approvedStories.map((story) => ({ newsletterId: newsletter.id, articleId: story.articleId })));

  const subscriptionsToCreate = [
    ...createdPublications.map((publication) => ({ readerId: owner.id, publisherId: publication.id, journalistId: null })),
    ...demoContributors.map((journalist) => ({ readerId: owner.id, publisherId: null, journalistId: journalist.id })),
  ];
  await db.insert(subscriptions).values(subscriptionsToCreate);
  await db.insert(emailOutbox).values(approvedStories.map((story) => ({
    recipientEmail: `reader@demo.newsroom.test`,
    subject: `New story: ${story.articleTitle}`,
    body: `A new story from ${story.sourceName} is ready to read.`,
    status: "queued" as const,
  })));

  await db.insert(activity).values([
    { actorId: owner.id, action: "demo_loaded", targetType: "workspace", targetId: null, detail: "The demo issue is ready: three publications, three contributors and five stories to explore." },
    { actorId: "demo-journalist-naledi", action: "submitted", targetType: "article", targetId: storyByTitle.get("The community hall opens its doors for an evening reading room")?.id ?? null, detail: "Submitted “The community hall opens its doors for an evening reading room” for editorial review." },
    { actorId: "demo-journalist-lwazi", action: "submitted", targetType: "article", targetId: storyByTitle.get("A shared garden is becoming a weekend classroom")?.id ?? null, detail: "Submitted “A shared garden is becoming a weekend classroom” for editorial review." },
  ]);
}
