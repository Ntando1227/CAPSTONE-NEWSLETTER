import { chatGPTSignInPath } from "./chatgpt-auth";
import { getCurrentAccount } from "@/lib/newsroom";
import NewsroomApp from "@/components/newsroom-app";

export const dynamic = "force-dynamic";

export default async function Home() {
  const account = await getCurrentAccount();
  if (account) return <NewsroomApp initialUser={account} />;

  return (
    <main className="welcome-page">
      <header className="welcome-header"><a className="wordmark" href="/">THE NEWSROOM</a><a className="sign-in-link" href={chatGPTSignInPath("/")} target="_top">Sign in with ChatGPT <span aria-hidden="true">↗</span></a></header>
      <section className="welcome-hero">
        <div className="welcome-copy">
          <p className="eyebrow"><span className="eyebrow-dot" /> INDEPENDENT REPORTING · THOUGHTFUL READING</p>
          <h1>A home for<br /><em>good stories.</em></h1>
          <p className="welcome-intro">The Newsroom brings independent journalists, curated publications and their readers together in one considered space.</p>
          <a className="button button-primary" href={chatGPTSignInPath("/")} target="_top">Enter the newsroom <span aria-hidden="true">→</span></a>
          <p className="welcome-note">A sample issue is ready to explore after you sign in.</p>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
          <div className="paper-card"><span className="paper-kicker">THE DAILY EDITION</span><span className="paper-rule" /><span className="paper-title">Stories<br />that stay<br /><i>with you.</i></span><span className="paper-rule short" /><span className="paper-byline">A newsroom for many voices</span><span className="paper-mark">N° 01</span></div>
          <span className="art-star star-one">✳</span><span className="art-star star-two">✳</span><span className="art-label">READ · FOLLOW · DISCOVER</span>
        </div>
      </section>
      <section className="welcome-bottom"><div><span className="bottom-index">01</span><h2>For readers</h2><p>Follow the publications and journalists you care about.</p></div><div><span className="bottom-index">02</span><h2>For journalists</h2><p>Submit reporting and curate stories into newsletters.</p></div><div><span className="bottom-index">03</span><h2>For editors</h2><p>Review submissions and publish for your community.</p></div></section>
      <footer className="welcome-footer"><span>THE NEWSROOM</span><span>Independent voices. Shared with care.</span></footer>
    </main>
  );
}
