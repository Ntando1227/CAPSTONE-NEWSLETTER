"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { Account, ActivityItem, ApprovalLog, Article, Invitation, Journalist, Newsletter, OutboxItem, Publisher } from "@/lib/types";

type View = "overview" | "articles" | "review" | "newsletters" | "publications" | "subscriptions" | "invites" | "updates";
type Modal = "article" | "newsletter" | "publisher" | "invite" | null;

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  const data = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(data?.error || `Request failed (${response.status}).`);
  return data as T;
}

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function initials(name: string) {
  return name.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "N";
}

const roleLabel: Record<Account["role"], string> = { reader: "Reader", editor: "Editor", journalist: "Journalist" };
const navItems: { key: View; label: string; icon: string; roles?: Account["role"][] }[] = [
  { key: "overview", label: "Overview", icon: "◫" },
  { key: "articles", label: "Articles", icon: "▤" },
  { key: "review", label: "Review queue", icon: "✓", roles: ["editor"] },
  { key: "newsletters", label: "Newsletters", icon: "▧" },
  { key: "publications", label: "Publications", icon: "◈" },
  { key: "subscriptions", label: "Following", icon: "♡", roles: ["reader"] },
  { key: "invites", label: "People and invites", icon: "＋", roles: ["editor"] },
  { key: "updates", label: "Updates and logs", icon: "↗" },
];

export default function NewsroomApp({ initialUser }: { initialUser: Account }) {
  const [user, setUser] = useState(initialUser);
  const [view, setView] = useState<View>("overview");
  const [articles, setArticles] = useState<Article[]>([]);
  const [feedArticles, setFeedArticles] = useState<Article[]>([]);
  const [newsletters, setNewsletters] = useState<Newsletter[]>([]);
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [journalists, setJournalists] = useState<Journalist[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const [approvalLogs, setApprovalLogs] = useState<ApprovalLog[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [following, setFollowing] = useState<{ publisherIds: number[]; journalistIds: string[] }>({ publisherIds: [], journalistIds: [] });
  const [modal, setModal] = useState<Modal>(null);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [selectedNewsletter, setSelectedNewsletter] = useState<Newsletter | null>(null);
  const [editing, setEditing] = useState(false);
  const [storyTitle, setStoryTitle] = useState("");
  const [storyContent, setStoryContent] = useState("");
  const [storyPublisher, setStoryPublisher] = useState("");
  const [newsletterTitle, setNewsletterTitle] = useState("");
  const [newsletterDescription, setNewsletterDescription] = useState("");
  const [newsletterArticles, setNewsletterArticles] = useState<number[]>([]);
  const [publisherName, setPublisherName] = useState("");
  const [publisherDescription, setPublisherDescription] = useState("");
  const [publisherWebsite, setPublisherWebsite] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("journalist");
  const [invitePublisher, setInvitePublisher] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [updateTab, setUpdateTab] = useState("activity");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [articleData, newsletterData, publisherData, journalistData, activityData, outboxData] = await Promise.all([
        api<{ articles: Article[] }>("/api/articles/"),
        api<{ newsletters: Newsletter[] }>("/api/newsletters/"),
        api<{ publishers: Publisher[] }>("/api/publishers/"),
        api<{ journalists: Journalist[] }>("/api/journalists/"),
        api<{ activity: ActivityItem[] }>("/api/activity/"),
        api<{ messages: OutboxItem[] }>("/api/outbox/"),
      ]);
      setArticles(articleData.articles);
      setNewsletters(newsletterData.newsletters);
      setPublishers(publisherData.publishers);
      setJournalists(journalistData.journalists);
      setActivity(activityData.activity);
      setOutbox(outboxData.messages);
      if (user.role === "reader") {
        const [feed, subs] = await Promise.all([
          api<{ articles: Article[] }>("/api/articles/subscribed/"),
          api<{ publisherIds: number[]; journalistIds: string[] }>("/api/subscriptions/"),
        ]);
        setFeedArticles(feed.articles);
        setFollowing(subs);
      } else {
        setFeedArticles([]);
        setFollowing({ publisherIds: [], journalistIds: [] });
      }
      if (user.role === "editor") {
        const [logs, invites] = await Promise.all([
          api<{ logs: ApprovalLog[] }>("/api/approved/"),
          api<{ invitations: Invitation[] }>("/api/invitations/"),
        ]);
        setApprovalLogs(logs.logs);
        setInvitations(invites.invitations);
      } else {
        setApprovalLogs([]);
        setInvitations([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "The newsroom could not load.");
    } finally {
      setLoading(false);
    }
  }, [user.role]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 3800);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const pendingArticles = articles.filter((article) => !article.approved);
  const publishedArticles = articles.filter((article) => article.approved);
  const visibleArticles = useMemo(() => {
    let rows = view === "subscriptions" || filter === "following" ? feedArticles : articles;
    if (view === "review" || filter === "review") rows = rows.filter((article) => !article.approved);
    else if (filter === "published") rows = rows.filter((article) => article.approved);
    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      rows = rows.filter((article) => `${article.title} ${article.content} ${article.authorName} ${article.publisherName ?? ""}`.toLowerCase().includes(needle));
    }
    return rows;
  }, [articles, feedArticles, filter, search, view]);

  async function saveArticle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError("");
    try {
      const body = { title: storyTitle, content: storyContent, publisherId: storyPublisher || null };
      if (selectedArticle && editing) {
        await api(`/api/articles/${selectedArticle.id}/`, { method: "PUT", body: JSON.stringify(body) });
        setNotice("Changes saved. The story is back in the review queue.");
      } else {
        await api("/api/articles/", { method: "POST", body: JSON.stringify(body) });
        setNotice("Story submitted to the editor for review.");
      }
      setModal(null); setSelectedArticle(null); setEditing(false); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save the article."); }
    finally { setSaving(false); }
  }

  function openArticle(article: Article | null) {
    setSelectedArticle(article);
    setEditing(!article);
    setStoryTitle(article?.title ?? "");
    setStoryContent(article?.content ?? "");
    setStoryPublisher(article?.publisherId ? String(article.publisherId) : "");
    setModal("article"); setError("");
  }

  async function approveArticle(article: Article) {
    setSaving(true); setError("");
    try {
      const result = await api<{ emailsQueued: number }>(`/api/articles/${article.id}/approve/`, { method: "POST" });
      setNotice(`Article approved. ${result.emailsQueued} subscriber email(s) added to the delivery queue.`);
      setSelectedArticle(null); setModal(null); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Approval failed."); }
    finally { setSaving(false); }
  }

  async function deleteArticle(article: Article) {
    if (!window.confirm(`Delete “${article.title}”?`)) return;
    try {
      await api(`/api/articles/${article.id}/`, { method: "DELETE" });
      setNotice("Article deleted."); setSelectedArticle(null); setModal(null); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not delete article."); }
  }

  function openNewsletter(newsletter: Newsletter | null) {
    setSelectedNewsletter(newsletter);
    setNewsletterTitle(newsletter?.title ?? "");
    setNewsletterDescription(newsletter?.description ?? "");
    setNewsletterArticles(newsletter?.articles.map((article) => article.id) ?? []);
    setModal("newsletter"); setError("");
  }

  async function saveNewsletter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const body = JSON.stringify({ title: newsletterTitle, description: newsletterDescription, articleIds: newsletterArticles });
      if (selectedNewsletter) {
        await api(`/api/newsletters/${selectedNewsletter.id}/`, { method: "PATCH", body });
        setNotice("Newsletter updated.");
      } else {
        const result = await api<{ emailsQueued: number }>("/api/newsletters/", { method: "POST", body });
        setNotice(`Newsletter created. ${result.emailsQueued} subscriber email(s) added to the delivery queue.`);
      }
      setModal(null); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save newsletter."); }
    finally { setSaving(false); }
  }

  async function deleteNewsletter(newsletter: Newsletter) {
    if (!window.confirm(`Delete “${newsletter.title}”?`)) return;
    try { await api(`/api/newsletters/${newsletter.id}/`, { method: "DELETE" }); setNotice("Newsletter deleted."); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not delete newsletter."); }
  }

  async function savePublisher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      await api("/api/publishers/", { method: "POST", body: JSON.stringify({ name: publisherName, description: publisherDescription, website: publisherWebsite }) });
      setPublisherName(""); setPublisherDescription(""); setPublisherWebsite(""); setModal(null); setNotice("Publication added."); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not add publication."); }
    finally { setSaving(false); }
  }

  async function saveInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      await api("/api/invitations/", { method: "POST", body: JSON.stringify({ email: inviteEmail, role: inviteRole, publisherId: invitePublisher || null }) });
      setInviteEmail(""); setInvitePublisher(""); setModal(null); setNotice("Invite recorded. Ask the person to sign in with this email address."); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not record invite."); }
    finally { setSaving(false); }
  }

  async function saveSubscriptions(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const result = await api<{ publisherCount: number; journalistCount: number }>("/api/subscriptions/", { method: "PUT", body: JSON.stringify(following) });
      setNotice(`Following ${result.publisherCount} publication(s) and ${result.journalistCount} journalist(s).`); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save subscriptions."); }
    finally { setSaving(false); }
  }

  async function changeRole(role: Account["role"]) {
    try {
      const result = await api<{ user: Account }>("/api/me/", { method: "PATCH", body: JSON.stringify({ role }) });
      setUser(result.user); setView("overview"); setNotice(`Owner preview switched to ${roleLabel[role]}.`);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not change preview role."); }
  }

  const roleItems = navItems.filter((item) => !item.roles || item.roles.includes(user.role));
  const articleActionAllowed = user.role === "editor" || (user.role === "journalist" && selectedArticle?.authorId === user.id);

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <a className="wordmark sidebar-wordmark" href="/" aria-label="The Newsroom home"><span className="mark-icon">N</span><span>THE<br />NEWSROOM</span></a>
        <div className="sidebar-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Newsroom workspace">
          {roleItems.map((item) => <button key={item.key} className={`nav-item ${view === item.key ? "active" : ""}`} onClick={() => { setView(item.key); setSearch(""); setFilter("all"); }}><span className="nav-icon">{item.icon}</span><span>{item.label}</span>{item.key === "review" && pendingArticles.length > 0 && <span className="nav-count">{pendingArticles.length}</span>}</button>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="site-status"><span className="online-dot" /><span>{user.isDemo ? "Shared demo workspace" : "Private newsroom"}</span></div>
          {user.isOwner && <div className="role-preview"><label htmlFor="role-preview">Owner role preview</label><select id="role-preview" value={user.role} onChange={(event) => void changeRole(event.target.value as Account["role"])}><option value="editor">Editor</option><option value="journalist">Journalist</option><option value="reader">Reader</option></select></div>}
          <div className="profile-chip"><span className="avatar">{initials(user.displayName)}</span><span className="profile-copy"><strong>{user.displayName}</strong><small>{roleLabel[user.role]}{user.isOwner ? " · Owner" : ""}</small></span><a className="signout" href={user.isDemo ? "/" : "/signout-with-chatgpt?return_to=%2F"} target="_top" aria-label={user.isDemo ? "Return to demo" : "Sign out"}>↗</a></div>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar"><div className="breadcrumb"><span>THE NEWSROOM</span><i>/</i><strong>{roleItems.find((item) => item.key === view)?.label ?? "Overview"}</strong></div><div className="topbar-right"><span className="issue-tag"><span className="online-dot" /> EDITION 01</span><span className="date-tag">{new Intl.DateTimeFormat("en-ZA", { weekday: "short", day: "numeric", month: "short" }).format(new Date())}</span><button className="avatar avatar-button" title={user.displayName}>{initials(user.displayName)}</button></div></header>
        <main className="content-area">
          {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss">×</button></div>}
          {error && <div className="alert" role="alert">{error}<button onClick={() => setError("")} aria-label="Dismiss">×</button></div>}
          <div className="demo-note"><span className="demo-note-mark">i</span><span><strong>Sample newsroom</strong> · {user.isDemo ? "Changes are shared with everyone using this test link." : "The starting stories, publications and contributors are fictional. Add or replace them with your own."}</span></div>
          {loading && <div className="loading-line"><span /> Getting your newsroom ready…</div>}
          {view === "overview" && <Overview user={user} articles={articles} pending={pendingArticles} published={publishedArticles} newsletters={newsletters} following={following} activity={activity} onNavigate={setView} onOpenArticle={(article) => openArticle(article)} onCreate={() => openArticle(null)} />}
          {(view === "articles" || view === "review") && <ArticleLibrary view={view} user={user} articles={visibleArticles} search={search} setSearch={setSearch} filter={filter} setFilter={setFilter} onOpen={(article) => { setSelectedArticle(article); setEditing(false); setModal("article"); setError(""); }} onCreate={() => openArticle(null)} onApprove={approveArticle} />}
          {view === "newsletters" && <NewsletterPage user={user} newsletters={newsletters} onCreate={() => openNewsletter(null)} onEdit={openNewsletter} onDelete={deleteNewsletter} />}
          {view === "publications" && <PublicationPage user={user} publishers={publishers} following={following} onCreate={() => { setModal("publisher"); setError(""); }} onInvite={() => { setModal("invite"); setError(""); }} onToggle={(id) => setFollowing((previous) => ({ ...previous, publisherIds: previous.publisherIds.includes(id) ? previous.publisherIds.filter((value) => value !== id) : [...previous.publisherIds, id] }))} onSave={saveSubscriptions} saving={saving} />}
          {view === "subscriptions" && user.role === "reader" && <SubscriptionPage publishers={publishers} journalists={journalists} following={following} setFollowing={setFollowing} onSave={saveSubscriptions} saving={saving} />}
          {view === "invites" && <InvitationsPage invitations={invitations} onCreate={() => { setModal("invite"); setError(""); }} />}
          {view === "updates" && <UpdatesPage tab={updateTab} setTab={setUpdateTab} activity={activity} outbox={outbox} approvalLogs={approvalLogs} />}
        </main>
        <footer className="app-footer"><span>The Newsroom</span><span>Reporting shared with care</span><span>{user.isDemo ? "Shared demo workspace" : "Private workspace"}</span></footer>
      </div>

      {modal && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setModal(null); setEditing(false); } }}>
        <section className={`modal ${modal === "article" && !editing ? "story-modal" : ""}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <button className="modal-close" onClick={() => { setModal(null); setEditing(false); }} aria-label="Close">×</button>
          {modal === "article" && (editing ? <form onSubmit={saveArticle}>
            <p className="eyebrow">JOURNALIST DESK</p><h2 id="modal-title">{selectedArticle ? "Edit story" : "Submit a story"}</h2><p className="modal-intro">A strong story starts with a clear headline and a point of view.</p>
            <label className="field-label" htmlFor="story-title">Headline</label><input id="story-title" className="field" maxLength={240} value={storyTitle} onChange={(event) => setStoryTitle(event.target.value)} required placeholder="Write a clear, specific headline" />
            <label className="field-label" htmlFor="story-content">Story</label><textarea id="story-content" className="field textarea" value={storyContent} onChange={(event) => setStoryContent(event.target.value)} required maxLength={30000} placeholder="Write your article here…" />
            {user.role === "journalist" && publishers.some((publisher) => publisher.members.some((member) => member.userId === user.id && member.role === "journalist")) && <><label className="field-label" htmlFor="story-publisher">Publication</label><select className="field" id="story-publisher" value={storyPublisher} onChange={(event) => setStoryPublisher(event.target.value)}><option value="">Independent story</option>{publishers.filter((publisher) => publisher.members.some((member) => member.userId === user.id && member.role === "journalist")).map((publisher) => <option key={publisher.id} value={publisher.id}>{publisher.name}</option>)}</select></>}
            <div className="modal-actions"><button className="button button-quiet" type="button" onClick={() => setModal(null)}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? "Saving…" : selectedArticle ? "Save changes" : "Submit for review"}</button></div>
          </form> : selectedArticle && <>
            <div className="story-modal-meta"><span className="eyebrow">{selectedArticle.publisherName || selectedArticle.authorName}</span><span>{selectedArticle.approved ? "PUBLISHED" : "IN REVIEW"}</span></div><h2 id="modal-title" className="story-modal-title">{selectedArticle.title}</h2><p className="story-modal-byline">By {selectedArticle.authorName} <span>·</span> {dateLabel(selectedArticle.createdAt)}</p><div className="story-modal-content">{selectedArticle.content}</div>
            <div className="modal-actions story-actions">{articleActionAllowed && <><button className="button button-quiet" onClick={() => { setEditing(true); setStoryTitle(selectedArticle.title); setStoryContent(selectedArticle.content); setStoryPublisher(selectedArticle.publisherId ? String(selectedArticle.publisherId) : ""); }}>Edit story</button><button className="button button-danger" onClick={() => void deleteArticle(selectedArticle)}>Delete</button></>}{user.role === "editor" && !selectedArticle.approved && <button className="button button-primary" disabled={saving} onClick={() => void approveArticle(selectedArticle)}>{saving ? "Approving…" : "Approve and publish"}</button>}</div>
          </>)}
          {modal === "newsletter" && <form onSubmit={saveNewsletter}><p className="eyebrow">CURATED READING</p><h2 id="modal-title">{selectedNewsletter ? "Edit newsletter" : "Create a newsletter"}</h2><p className="modal-intro">Bring approved stories together for your readers.</p><label className="field-label" htmlFor="newsletter-title">Title</label><input id="newsletter-title" className="field" value={newsletterTitle} onChange={(event) => setNewsletterTitle(event.target.value)} required maxLength={200} placeholder="For example, The Weekly Brief" /><label className="field-label" htmlFor="newsletter-description">Introduction</label><textarea id="newsletter-description" className="field textarea short-textarea" value={newsletterDescription} onChange={(event) => setNewsletterDescription(event.target.value)} placeholder="A few words about this edition" /><div className="field-label">Choose approved articles</div><div className="article-check-list">{publishedArticles.map((article) => <label key={article.id} className="check-row"><input type="checkbox" checked={newsletterArticles.includes(article.id)} onChange={() => setNewsletterArticles((current) => current.includes(article.id) ? current.filter((id) => id !== article.id) : [...current, article.id])} /><span><strong>{article.title}</strong><small>{article.publisherName || article.authorName}</small></span></label>)}{publishedArticles.length === 0 && <p className="empty-inline">Publish an approved story before adding articles.</p>}</div><div className="modal-actions"><button className="button button-quiet" type="button" onClick={() => setModal(null)}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? "Saving…" : selectedNewsletter ? "Save newsletter" : "Create newsletter"}</button></div></form>}
          {modal === "publisher" && <form onSubmit={savePublisher}><p className="eyebrow">PUBLICATION MANAGEMENT</p><h2 id="modal-title">Add a publication</h2><p className="modal-intro">Create a publication, then invite editors and journalists to join.</p><label className="field-label" htmlFor="publisher-name">Publication name</label><input id="publisher-name" className="field" value={publisherName} onChange={(event) => setPublisherName(event.target.value)} required maxLength={160} /><label className="field-label" htmlFor="publisher-description">Description</label><textarea id="publisher-description" className="field textarea short-textarea" value={publisherDescription} onChange={(event) => setPublisherDescription(event.target.value)} /><label className="field-label" htmlFor="publisher-website">Website</label><input id="publisher-website" className="field" type="url" value={publisherWebsite} onChange={(event) => setPublisherWebsite(event.target.value)} placeholder="https://" /><div className="modal-actions"><button className="button button-quiet" type="button" onClick={() => setModal(null)}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? "Saving…" : "Add publication"}</button></div></form>}
          {modal === "invite" && <form onSubmit={saveInvite}><p className="eyebrow">PEOPLE AND ACCESS</p><h2 id="modal-title">Invite a contributor</h2><p className="modal-intro">Set the role before they sign in with the same email address.</p><label className="field-label" htmlFor="invite-email">Email address</label><input id="invite-email" className="field" type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} required placeholder="name@example.com" /><label className="field-label" htmlFor="invite-role">Role</label><select className="field" id="invite-role" value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}><option value="journalist">Journalist</option><option value="editor">Editor</option><option value="reader">Reader</option></select><label className="field-label" htmlFor="invite-publisher">Publication membership <span>(optional)</span></label><select className="field" id="invite-publisher" value={invitePublisher} onChange={(event) => setInvitePublisher(event.target.value)}><option value="">No publication membership</option>{publishers.map((publisher) => <option key={publisher.id} value={publisher.id}>{publisher.name}</option>)}</select><div className="modal-actions"><button className="button button-quiet" type="button" onClick={() => setModal(null)}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? "Saving…" : "Record invite"}</button></div></form>}
        </section>
      </div>}
    </div>
  );
}

function Overview({ user, articles, pending, published, newsletters, following, activity, onNavigate, onOpenArticle, onCreate }: {
  user: Account; articles: Article[]; pending: Article[]; published: Article[]; newsletters: Newsletter[];
  following: { publisherIds: number[]; journalistIds: string[] }; activity: ActivityItem[];
  onNavigate: (view: View) => void; onOpenArticle: (article: Article) => void; onCreate: () => void;
}) {
  const rows = user.role === "reader" ? published : articles;
  const summary = user.role === "reader" ? `${following.publisherIds.length + following.journalistIds.length} sources followed` : user.role === "editor" ? `${pending.length} stories need your attention` : "Your latest work and submissions";
  return <>
    <section className="welcome-band"><div className="welcome-band-copy"><p className="eyebrow">{new Intl.DateTimeFormat("en-ZA", { weekday: "long", day: "numeric", month: "long" }).format(new Date()).toUpperCase()}</p><h1>Good stories<br /><em>start here.</em></h1><p>{summary}. Keep your newsroom moving from one clear workspace.</p><div className="welcome-actions">{user.role === "journalist" ? <button className="button button-light" onClick={onCreate}>Submit a story <span>＋</span></button> : user.role === "editor" ? <button className="button button-light" onClick={() => onNavigate("review")}>Open review queue <span>→</span></button> : <button className="button button-light" onClick={() => onNavigate("subscriptions")}>Choose who to follow <span>→</span></button>}<button className="text-button light-text" onClick={() => onNavigate("articles")}>Browse the newsroom</button></div></div><div className="welcome-artwork" aria-hidden="true"><div className="ring ring-large" /><div className="ring ring-small" /><div className="article-cover"><span className="cover-caption">THE NEWSROOM · EDITION 01</span><span className="cover-line" /><strong>Beyond<br />the <i>headline.</i></strong><span className="cover-line cover-short" /><span className="cover-caption">A place for many voices</span></div><span className="cover-star">✳</span></div><div className="welcome-footnote"><span>THE NEWSROOM</span><span>Independent voices, shared with care</span></div></section>
    <section className="stat-grid"><Stat label={user.role === "editor" ? "AWAITING REVIEW" : "PUBLISHED STORIES"} value={user.role === "editor" ? String(pending.length).padStart(2, "0") : String(published.length).padStart(2, "0")} note={user.role === "editor" ? "Editorial queue" : "Across the newsroom"} onClick={() => onNavigate(user.role === "editor" ? "review" : "articles")} /><Stat label="NEWSLETTERS" value={String(newsletters.length).padStart(2, "0")} note="Curated editions" onClick={() => onNavigate("newsletters")} /><Stat label={user.role === "reader" ? "FOLLOWING" : "RECENT UPDATES"} value={user.role === "reader" ? String(following.publisherIds.length + following.journalistIds.length).padStart(2, "0") : String(activity.length).padStart(2, "0")} note={user.role === "reader" ? "Your sources" : "Activity this week"} onClick={() => onNavigate(user.role === "reader" ? "subscriptions" : "updates")} /></section>
    <div className="section-line"><div><p className="eyebrow">ON THE DESK</p><h2>{user.role === "reader" ? "Recent stories" : user.role === "journalist" ? "Your latest work" : "Recent submissions"}</h2></div><button className="text-button" onClick={() => onNavigate("articles")}>View all <span>→</span></button></div>
    <div className="overview-columns"><section className="story-list">{rows.slice(0, 4).map((article) => <button className="story-row" key={article.id} onClick={() => onOpenArticle(article)}><span className="story-row-date">{dateLabel(article.createdAt)}</span><span className="story-row-main"><strong>{article.title}</strong><small>{article.publisherName || article.authorName} · By {article.authorName}</small></span><span className={`status-pill ${article.approved ? "published" : "pending"}`}>{article.approved ? "Published" : "In review"}</span><span className="row-arrow">↗</span></button>)}{rows.length === 0 && <div className="empty-card"><span className="empty-mark">N</span><strong>Your desk is clear for now.</strong><p>{user.role === "editor" ? "New submissions will appear here for review." : user.role === "journalist" ? "Start with a story you want people to remember." : "Follow a publication or journalist to build your reading list."}</p><button className="text-button" onClick={() => onNavigate(user.role === "reader" ? "subscriptions" : user.role === "journalist" ? "articles" : "publications")}>{user.role === "reader" ? "Choose sources" : user.role === "journalist" ? "Open the article desk" : "Manage publications"} →</button></div>}</section><aside className="side-notes"><div className="side-note-heading"><p className="eyebrow">YOUR NEWSROOM</p><span className="note-number">01 / 03</span></div><div className="role-note"><span className="note-symbol">{user.role === "reader" ? "♡" : user.role === "editor" ? "✳" : "✎"}</span><h3>{user.role === "reader" ? "A reading list with intention." : user.role === "editor" ? "Good editing makes good reporting travel." : "Make room for a new perspective."}</h3><p>{user.role === "reader" ? "Choose the voices and publications that matter to you. Their new stories will find their way here." : user.role === "editor" ? "Clear the review queue, keep your publication’s standards visible, and share approved reporting with readers." : "Submit a story for review. Once approved, it reaches the readers who follow you or your publication."}</p><button className="text-button" onClick={() => onNavigate(user.role === "reader" ? "subscriptions" : user.role === "editor" ? "review" : "articles")}>{user.role === "reader" ? "Manage sources" : user.role === "editor" ? "Review stories" : "Write a story"} →</button></div><div className="recent-note"><span>LAST UPDATE</span><p>{activity[0]?.detail || "Your newsroom activity will appear here."}</p><button className="text-button" onClick={() => onNavigate("updates")}>See updates →</button></div></aside></div>
  </>;
}

function Stat({ label, value, note, onClick }: { label: string; value: string; note: string; onClick: () => void }) {
  return <button className="stat-card" onClick={onClick}><span className="stat-label">{label}</span><strong>{value}</strong><span className="stat-note">{note}<i>↗</i></span></button>;
}

function ArticleLibrary({ view, user, articles, search, setSearch, filter, setFilter, onOpen, onCreate, onApprove }: {
  view: View; user: Account; articles: Article[]; search: string; setSearch: (value: string) => void;
  filter: string; setFilter: (value: string) => void; onOpen: (article: Article) => void;
  onCreate: () => void; onApprove: (article: Article) => void;
}) {
  const title = view === "review" ? "Review queue" : view === "subscriptions" ? "Your reading list" : "Articles";
  const description = view === "review" ? "Read each submission before it reaches readers." : view === "subscriptions" ? "Stories from the publications and journalists you follow." : "Browse stories published by your newsroom.";
  return <><PageHeader eyebrow="THE NEWSROOM / STORIES" title={title} description={description} action={user.role === "journalist" && view === "articles" ? <button className="button button-primary" onClick={onCreate}>Submit story <span>＋</span></button> : undefined} />
    <div className="toolbar"><label className="search-box"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search headlines, journalists, publications" /></label>{view !== "review" && view !== "subscriptions" && <div className="filter-switch"><button className={filter === "all" ? "chosen" : ""} onClick={() => setFilter("all")}>All stories</button>{user.role === "reader" ? <button className={filter === "following" ? "chosen" : ""} onClick={() => setFilter("following")}>From my sources</button> : <><button className={filter === "published" ? "chosen" : ""} onClick={() => setFilter("published")}>Published</button><button className={filter === "review" ? "chosen" : ""} onClick={() => setFilter("review")}>In review</button></>}</div>}<span className="result-count">{articles.length} {articles.length === 1 ? "story" : "stories"}</span></div>
    <section className="library-grid">{articles.map((article, index) => <article className="library-card" key={article.id}><div className={`cover-block cover-tone-${index % 4}`}><span className="cover-topline">{article.publisherName || "INDEPENDENT VOICE"}</span><span className="cover-bigmark">{String(index + 1).padStart(2, "0")}</span><span className="cover-bottomline">THE NEWSROOM · {article.approved ? "PUBLISHED" : "FOR REVIEW"}</span></div><div className="library-card-body"><div className="card-meta"><span>{article.publisherName || "Independent"}</span><span>{dateLabel(article.createdAt)}</span></div><button className="library-title" onClick={() => onOpen(article)}>{article.title}</button><p className="library-excerpt">{article.content.slice(0, 150)}{article.content.length > 150 ? "…" : ""}</p><div className="library-byline"><span className="mini-avatar">{initials(article.authorName)}</span><span>By {article.authorName}</span><span className={`status-pill ${article.approved ? "published" : "pending"}`}>{article.approved ? "Published" : "In review"}</span></div>{view === "review" && <button className="button button-primary review-button" onClick={() => onApprove(article)}>Approve and publish →</button>}</div></article>)}{articles.length === 0 && <div className="empty-card library-empty"><span className="empty-mark">N</span><strong>No stories match this view.</strong><p>{view === "review" ? "The editorial queue is clear." : search ? "Try another search term." : "When stories are submitted or published, they will appear here."}</p></div>}</section>
  </>;
}

function NewsletterPage({ user, newsletters, onCreate, onEdit, onDelete }: { user: Account; newsletters: Newsletter[]; onCreate: () => void; onEdit: (item: Newsletter) => void; onDelete: (item: Newsletter) => void }) {
  return <><PageHeader eyebrow="CURATED READING" title="Newsletters" description="Collections of reporting assembled by journalists and editors." action={(user.role === "editor" || user.role === "journalist") ? <button className="button button-primary" onClick={onCreate}>Create newsletter <span>＋</span></button> : undefined} />
    <section className="newsletter-grid">{newsletters.map((newsletter, index) => <article className="newsletter-card" key={newsletter.id}><div className={`newsletter-cover cover-tone-${index % 4}`}><span className="cover-topline">THE NEWSROOM · EDITION {String(index + 1).padStart(2, "0")}</span><strong>{newsletter.title}</strong><span className="cover-bottomline">{newsletter.articles.length} STORIES · {dateLabel(newsletter.createdAt)}</span></div><div className="newsletter-copy"><p>{newsletter.description || "A considered selection of stories from the newsroom."}</p><span className="newsletter-byline">Curated by {newsletter.authorName}</span><div className="newsletter-articles">{newsletter.articles.slice(0, 3).map((article) => <span key={article.id}>{article.title}</span>)}{newsletter.articles.length === 0 && <span>No stories selected</span>}</div>{(user.role === "editor" || (user.role === "journalist" && newsletter.authorId === user.id)) && <div className="inline-actions"><button className="text-button" onClick={() => onEdit(newsletter)}>Edit</button><button className="text-button muted-button" onClick={() => onDelete(newsletter)}>Delete</button></div>}</div></article>)}{newsletters.length === 0 && <div className="empty-card library-empty"><span className="empty-mark">N</span><strong>No newsletters yet.</strong><p>Curate approved articles into an edition readers can return to.</p></div>}</section>
  </>;
}

function PublicationPage({ user, publishers, following, onCreate, onInvite, onToggle, onSave, saving }: { user: Account; publishers: Publisher[]; following: { publisherIds: number[]; journalistIds: string[] }; onCreate: () => void; onInvite: () => void; onToggle: (id: number) => void; onSave: (event: FormEvent<HTMLFormElement>) => void; saving: boolean }) {
  return <><PageHeader eyebrow="PUBLICATION DESK" title="Publications" description={user.role === "reader" ? "Meet the publications shaping the newsroom, then choose who to follow." : "Manage the publications and editorial teams connected to this newsroom."} action={user.role === "editor" ? <><button className="button button-quiet" onClick={onInvite}>Invite a contributor</button><button className="button button-primary" onClick={onCreate}>Add publication <span>＋</span></button></> : undefined} />
    <form onSubmit={onSave}><section className="publication-grid">{publishers.map((publisher, index) => <article className="publication-card" key={publisher.id}><div className={`publication-seal seal-${index % 4}`}><span>{publisher.name.slice(0, 1).toUpperCase()}</span><i>✳</i></div><div className="publication-info"><div className="card-meta"><span>PUBLICATION</span><span>{publisher.members.length} contributors</span></div><h2>{publisher.name}</h2><p>{publisher.description || "A publication in The Newsroom."}</p>{publisher.website && <a className="web-link" href={publisher.website} target="_blank" rel="noreferrer">Visit publication ↗</a>}<div className="member-list">{publisher.members.slice(0, 3).map((member) => <span key={member.id}><i className="mini-avatar">{initials(member.name)}</i>{member.name}<small>{member.role}</small></span>)}{publisher.members.length === 0 && <span className="muted-copy">No team members listed yet.</span>}</div>{user.role === "reader" && <label className="publication-follow"><input type="checkbox" checked={following.publisherIds.includes(publisher.id)} onChange={() => onToggle(publisher.id)} /><span>{following.publisherIds.includes(publisher.id) ? "Following" : "Follow publication"}</span></label>}</div></article>)}{publishers.length === 0 && <div className="empty-card library-empty"><span className="empty-mark">N</span><strong>No publications have been added.</strong><p>{user.role === "editor" ? "Create your first publication, then invite its editorial team." : "The editor can add publications to this newsroom."}</p>{user.role === "editor" && <button className="button button-primary" type="button" onClick={onCreate}>Add publication</button>}</div>}</section>{user.role === "reader" && <div className="follow-save"><p>Choose the publications you want in your reading list.</p><button className="button button-primary" disabled={saving}>{saving ? "Saving…" : "Save my sources"}</button></div>}</form>
  </>;
}

function SubscriptionPage({ publishers, journalists, following, setFollowing, onSave, saving }: { publishers: Publisher[]; journalists: Journalist[]; following: { publisherIds: number[]; journalistIds: string[] }; setFollowing: (updater: (previous: { publisherIds: number[]; journalistIds: string[] }) => { publisherIds: number[]; journalistIds: string[] }) => void; onSave: (event: FormEvent<HTMLFormElement>) => void; saving: boolean }) {
  return <><PageHeader eyebrow="YOUR READING LIST" title="Who do you follow?" description="Choose the publications and independent journalists whose stories should reach your reading list." /><form onSubmit={onSave}>
    <div className="follow-groups"><section className="follow-group"><div className="follow-heading"><div><p className="eyebrow">01 / PUBLICATIONS</p><h2>Follow a publication</h2></div><span>{following.publisherIds.length} selected</span></div>{publishers.map((publisher) => <label className="follow-row" key={publisher.id}><input type="checkbox" checked={following.publisherIds.includes(publisher.id)} onChange={() => setFollowing((previous) => ({ ...previous, publisherIds: previous.publisherIds.includes(publisher.id) ? previous.publisherIds.filter((id) => id !== publisher.id) : [...previous.publisherIds, publisher.id] }))} /><span className="follow-seal">{publisher.name.slice(0, 1).toUpperCase()}</span><span className="follow-info"><strong>{publisher.name}</strong><small>{publisher.description || "Publication"}</small></span><span className="checkbox-visual">✓</span></label>)}{publishers.length === 0 && <p className="empty-inline">Publications will appear here when the editor adds them.</p>}</section>
    <section className="follow-group"><div className="follow-heading"><div><p className="eyebrow">02 / INDEPENDENT VOICES</p><h2>Follow a journalist</h2></div><span>{following.journalistIds.length} selected</span></div>{journalists.map((journalist) => <label className="follow-row" key={journalist.id}><input type="checkbox" checked={following.journalistIds.includes(journalist.id)} onChange={() => setFollowing((previous) => ({ ...previous, journalistIds: previous.journalistIds.includes(journalist.id) ? previous.journalistIds.filter((id) => id !== journalist.id) : [...previous.journalistIds, journalist.id] }))} /><span className="avatar follow-avatar">{initials(journalist.name)}</span><span className="follow-info"><strong>{journalist.name}</strong><small>Independent journalist</small></span><span className="checkbox-visual">✓</span></label>)}{journalists.length === 0 && <p className="empty-inline">Journalists appear here after they sign in with an invitation.</p>}</section></div>
    <div className="follow-save"><p>Your reading list updates as soon as you save your choices.</p><button className="button button-primary" disabled={saving}>{saving ? "Saving…" : "Save my sources"}</button></div>
  </form></>;
}

function InvitationsPage({ invitations, onCreate }: { invitations: Invitation[]; onCreate: () => void }) {
  return <><PageHeader eyebrow="PEOPLE AND ACCESS" title="Contributors" description="Invite people into the newsroom with the right role and, if needed, a publication membership." action={<button className="button button-primary" onClick={onCreate}>Invite a contributor <span>＋</span></button>} /><div className="invite-note"><span className="note-symbol">✳</span><div><strong>How invitations work</strong><p>Record the email and role here. The person accepts when they sign into this Site using that same email address. Site access remains private until you change it in Site settings.</p></div></div><section className="table-card"><div className="table-heading"><span>EMAIL ADDRESS</span><span>ROLE</span><span>PUBLICATION</span><span>INVITED</span></div>{invitations.map((invite) => <div className="table-row" key={invite.email}><strong>{invite.email}</strong><span className="role-chip">{roleLabel[invite.role as Account["role"]] ?? invite.role}</span><span>{invite.publisherName || "—"}</span><span>{dateLabel(invite.createdAt)}</span></div>)}{invitations.length === 0 && <div className="table-empty">No invitations have been recorded yet.</div>}</section></>;
}

function UpdatesPage({ tab, setTab, activity, outbox, approvalLogs }: { tab: string; setTab: (value: string) => void; activity: ActivityItem[]; outbox: OutboxItem[]; approvalLogs: ApprovalLog[] }) {
  return <><PageHeader eyebrow="NEWSROOM RECORD" title="Updates and logs" description="A clear record of editorial activity, approval events, and queued subscriber emails." /><div className="tab-strip"><button className={tab === "activity" ? "active" : ""} onClick={() => setTab("activity")}>Activity <span>{activity.length}</span></button><button className={tab === "email" ? "active" : ""} onClick={() => setTab("email")}>Email queue <span>{outbox.length}</span></button><button className={tab === "approvals" ? "active" : ""} onClick={() => setTab("approvals")}>API approval log <span>{approvalLogs.length}</span></button></div>
    {tab === "activity" && <section className="timeline">{activity.map((item) => <div className="timeline-row" key={item.id}><span className="timeline-dot" /><time>{dateLabel(item.createdAt)}</time><div><strong>{item.detail}</strong><small>{item.actorName} · {item.action}</small></div></div>)}{activity.length === 0 && <div className="table-empty">Newsroom actions will appear here as people submit, review, and publish.</div>}</section>}
    {tab === "email" && <section className="table-card"><div className="table-heading email-table"><span>RECIPIENT</span><span>SUBJECT</span><span>STATUS</span><span>QUEUED</span></div>{outbox.map((item) => <div className="table-row email-table" key={item.id}><strong>{item.recipientEmail}</strong><span>{item.subject}</span><span className="status-pill queued">Queued</span><span>{dateLabel(item.createdAt)}</span></div>)}{outbox.length === 0 && <div className="table-empty">No emails are waiting in the outbox. Subscriber notifications are queued here on approval; connect a mail service to deliver them.</div>}<p className="table-footnote">The hosted Site records email notifications in this queue. Delivery requires a configured mail provider.</p></section>}
    {tab === "approvals" && <section className="table-card"><div className="table-heading approval-table"><span>ARTICLE</span><span>SOURCE</span><span>APPROVED</span><span>LOGGED</span></div>{approvalLogs.map((log) => <div className="table-row approval-table" key={log.id}><strong>{log.articleTitle}</strong><span>{log.sourceName}</span><span>{dateLabel(log.approvedAt)}</span><span>{dateLabel(log.receivedAt)}</span></div>)}{approvalLogs.length === 0 && <div className="table-empty">Approved articles will be recorded in the internal API log.</div>}<p className="table-footnote">This is the hosted Site's internal approval API ledger.</p></section>}
  </>;
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <section className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{action && <div className="heading-action">{action}</div>}</section>;
}
