import { auth } from "../auth";
import { ContactForm } from "./ui/contact-form";

const features = [
  {
    title: "Landing + Brand",
    body: "첫 인상에 집중한 브랜드 랜딩과 유연한 섹션 구조를 제공합니다.",
  },
  {
    title: "App Router Ready",
    body: "Next.js App Router 기반으로 페이지, API, 서버 로직 확장이 쉽습니다.",
  },
  {
    title: "Production Mindset",
    body: "빌드 검증, 명확한 스타일 변수, 문서화된 구조로 바로 배포 가능합니다.",
  },
];

export default async function Home() {
  const session = await auth();
  return (
    <main className="landing-shell">
      <section className="orb orb-left" aria-hidden="true" />
      <section className="orb orb-right" aria-hidden="true" />

      <header className="topbar reveal">
        <p className="brand">ASSET LAB</p>
        <a className="text-link" href="https://nextjs.org/docs" target="_blank" rel="noreferrer noopener">
          Docs
        </a>
      </header>

      <section className="hero reveal reveal-delay-1">
        <p className="eyebrow">NEW PROJECT STARTER</p>
        <h1>Build something sharp, fast, and unmistakably yours.</h1>
        <p className="subtitle">
          This is your fresh Next.js + TypeScript base. Swap copy, wire APIs, and ship from here.
        </p>
        <div className="cta-row">
          {session ? (
            <a className="btn btn-primary" href="/dashboard">
              Go to dashboard
            </a>
          ) : (
            <a className="btn btn-primary" href="/login">
              Sign in
            </a>
          )}
          <a className="btn btn-ghost" href="https://nextjs.org/learn" target="_blank" rel="noreferrer noopener">
            Learn Next.js
          </a>
        </div>
      </section>

      <section className="stat-grid reveal reveal-delay-2">
        <article className="card">
          <p>Framework</p>
          <h2>Next.js 16</h2>
        </article>
        <article className="card">
          <p>Language</p>
          <h2>TypeScript</h2>
        </article>
        <article className="card">
          <p>Styling</p>
          <h2>Tailwind v4</h2>
        </article>
      </section>

      <section className="feature-section reveal reveal-delay-2">
        <h2>What You Can Ship Fast</h2>
        <div className="feature-grid">
          {features.map((item) => (
            <article className="feature-card" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="contact" className="contact-section reveal reveal-delay-2">
        <div className="contact-copy">
          <p className="eyebrow">CONTACT</p>
          <h2>Tell us what you want to build.</h2>
          <p>
            아래 폼은 `/api/contact`로 연결됩니다. 실제 서비스에서는 메일 전송, DB 저장, Slack 알림으로 확장하면 됩니다.
          </p>
        </div>
        <ContactForm />
      </section>
    </main>
  );
}
