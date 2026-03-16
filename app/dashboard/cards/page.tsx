"use client";

import { useState, useEffect, useCallback } from "react";

interface CardBenefit {
  category: string;
  summary: string;
}

interface Card {
  gorilla_id: number;
  name: string;
  company: string;
  annual_fee: string;
  min_spending: string;
  brand: string;
  image_url: string;
  crawled_at: string;
  benefits: CardBenefit[];
}

const EMPTY_FORM = {
  name: "", company: "", annual_fee: "", min_spending: "", brand: "", image_url: "",
  benefitLines: "",
};

export default function CardsPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [crawling, setCrawling] = useState(false);
  const [crawlMsg, setCrawlMsg] = useState("");
  const [selected, setSelected] = useState<Card | null>(null);
  const [filter, setFilter] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [crawlProgress, setCrawlProgress] = useState({ done: 0, total: 0, current: "" });

  const fetchCards = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cards");
      const json = await res.json();
      if (json.ok) setCards(json.data ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchCards(); }, [fetchCards]);

  const loadSampleData = async () => {
    setSeeding(true);
    setCrawlMsg("");
    try {
      const res = await fetch("/api/cards/seed", { method: "POST" });
      const json = await res.json() as { ok: boolean; message?: string };
      if (json.ok) {
        setCrawlMsg(`? ${json.message ?? "���� ������ �߰� �Ϸ�"}`);
        await fetchCards();
      } else {
        setCrawlMsg("?? ���� ������ �߰� ����");
      }
    } catch {
      setCrawlMsg("?? ���� ����");
    }
    setSeeding(false);
    setTimeout(() => setCrawlMsg(""), 5000);
  };

  const startCrawl = async () => {
    setCrawling(true);
    setCrawlMsg("");

    let ids: number[] = [];
    try {
      const idRes = await fetch("/api/cards/ids");
      const idJson = await idRes.json();
      ids = idJson.data ?? [];
    } catch {
      setCrawlMsg("ī�� ID ��� ��ȸ ����");
      setCrawling(false);
      return;
    }

    let success = 0;
    let failed = 0;
    setCrawlProgress({ done: 0, total: ids.length, current: "�غ� ��..." });

    for (let i = 0; i < ids.length; i++) {
      setCrawlProgress({ done: i, total: ids.length, current: `ī�� #${ids[i]} ũ�Ѹ� ��...` });
      try {
        const res = await fetch("/api/cards/crawl", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cardId: ids[i] }),
        });
        const json = await res.json();
        if (json.ok && json.data?.ok) {
          success++;
          setCrawlProgress({ done: i + 1, total: ids.length, current: `? ${json.data.name}` });
        } else {
          failed++;
          setCrawlProgress({ done: i + 1, total: ids.length, current: `? ī�� #${ids[i]} ����` });
        }
      } catch {
        failed++;
        setCrawlProgress({ done: i + 1, total: ids.length, current: `? ī�� #${ids[i]} ����` });
      }
      await new Promise(r => setTimeout(r, 300));
    }

    setCrawlProgress({ done: 0, total: 0, current: "" });
    await fetchCards();
    setCrawling(false);
    if (success === 0) {
      setCrawlMsg(`?? ũ�Ѹ� ���� (${failed}��) ? ����Ʈ ������ ���ܵ��� �� �ֽ��ϴ�. "���� �Է�"���� ī�带 �߰��ϼ���.`);
    } else {
      setCrawlMsg(`? ���� ${success}�� / ���� ${failed}��`);
    }
    setTimeout(() => setCrawlMsg(""), 12000);
  };

  const saveManual = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const benefits: CardBenefit[] = form.benefitLines
      .split("\n")
      .map(line => {
        const idx = line.indexOf(":");
        if (idx > 0) return { category: line.slice(0, idx).trim(), summary: line.slice(idx + 1).trim() };
        return { category: "��Ÿ", summary: line.trim() };
      })
      .filter(b => b.summary.length > 0);

    const res = await fetch("/api/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, benefits }),
    });
    const json = await res.json();
    if (json.ok) {
      setForm(EMPTY_FORM);
      setShowManual(false);
      await fetchCards();
    }
    setSaving(false);
  };

  const deleteCard = async (gorillaId: number) => {
    if (!confirm("�� ī�带 �����Ͻðڽ��ϱ�?")) return;
    await fetch(`/api/cards?id=${gorillaId}`, { method: "DELETE" });
    setSelected(null);
    await fetchCards();
  };

  const filtered = cards.filter(
    (c) =>
      !filter ||
      c.name.includes(filter) ||
      c.company.includes(filter) ||
      c.benefits.some(b => b.category.includes(filter) || b.summary.includes(filter)),
  );

  if (selected) {
    return (
      <div className="cards-page">
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>
            �� �������
          </button>
          <button className="btn btn-ghost btn-sm" style={{ color: "#ff453a" }}
            onClick={() => deleteCard(selected.gorilla_id)}>
            ?? ����
          </button>
        </div>

        <div className="card-detail-wrap">
          <div className="card-detail-header">
            {selected.image_url && (
              <img src={selected.image_url} alt={selected.name} className="card-detail-img" />
            )}
            <div className="card-detail-info">
              <h2 className="card-detail-name">{selected.name}</h2>
              <p className="card-detail-company">{selected.company}</p>
              <div className="card-detail-meta">
                {selected.annual_fee && <span>��ȸ��: {selected.annual_fee}</span>}
                {selected.min_spending && <span>��������: {selected.min_spending}</span>}
                {selected.brand && <span>�귣��: {selected.brand}</span>}
              </div>
            </div>
          </div>

          <h3 className="card-benefits-title">?? ����</h3>
          <ul className="card-benefits-list">
            {selected.benefits.length > 0 ? (
              selected.benefits.map((b, i) => (
                <li key={i} className="card-benefit-item">
                  <span className="card-benefit-cat">{b.category || "��Ÿ"}</span>
                  <span className="card-benefit-txt">{b.summary}</span>
                </li>
              ))
            ) : (
              <li className="card-benefit-item">���� ���� ����</li>
            )}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="cards-page">
      <div className="cards-header">
        <h1 className="cards-title">?? ī�� ���� ��</h1>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button className="btn btn-ghost btn-sm" onClick={loadSampleData} disabled={seeding || crawling}>
            {seeding ? "�ε� ��..." : "?? ���� ������"}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowManual(v => !v)}>
            ?? ���� �Է�
          </button>
          <button className="btn btn-primary btn-sm" onClick={startCrawl} disabled={crawling || seeding}>
            {crawling
              ? crawlProgress.total > 0
                ? `?? ${crawlProgress.done}/${crawlProgress.total}`
                : "?? ID ���� �ߡ�"
              : "?? ũ�Ѹ� ����"}
          </button>
        </div>
      </div>

      {showManual && (
        <div className="card-manual-form">
          <h3 className="card-manual-title">?? ī�� ���� �Է�</h3>
          <div className="card-manual-grid">
            <div className="card-manual-field">
              <label>ī��� *</label>
              <input className="sched-input" placeholder="��) ���� Deep Dream" value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="card-manual-field">
              <label>ī���</label>
              <input className="sched-input" placeholder="��) ����ī��" value={form.company}
                onChange={e => setForm(p => ({ ...p, company: e.target.value }))} />
            </div>
            <div className="card-manual-field">
              <label>��ȸ��</label>
              <input className="sched-input" placeholder="��) ���� 15,000��" value={form.annual_fee}
                onChange={e => setForm(p => ({ ...p, annual_fee: e.target.value }))} />
            </div>
            <div className="card-manual-field">
              <label>��������</label>
              <input className="sched-input" placeholder="��) 30���� �̻�" value={form.min_spending}
                onChange={e => setForm(p => ({ ...p, min_spending: e.target.value }))} />
            </div>
            <div className="card-manual-field">
              <label>�귣��</label>
              <input className="sched-input" placeholder="��) VISA" value={form.brand}
                onChange={e => setForm(p => ({ ...p, brand: e.target.value }))} />
            </div>
            <div className="card-manual-field">
              <label>�̹��� URL</label>
              <input className="sched-input" placeholder="https://..." value={form.image_url}
                onChange={e => setForm(p => ({ ...p, image_url: e.target.value }))} />
            </div>
            <div className="card-manual-field card-manual-full">
              <label>���� (�� �ٿ� �ϳ�, <code>ī�װ���: ����</code> ����)</label>
              <textarea className="sched-textarea" rows={4}
                placeholder={"������: CU��GS25 10% ����\nī��: ��Ÿ���� 20% ĳ�ù�\n����: ����������ö 10% ĳ�ù�"}
                value={form.benefitLines}
                onChange={e => setForm(p => ({ ...p, benefitLines: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
            <button className="btn btn-primary btn-sm" disabled={!form.name.trim() || saving} onClick={saveManual}>
              {saving ? "���� ��..." : "?? ī�� ����"}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setShowManual(false); setForm(EMPTY_FORM); }}>
              ���
            </button>
          </div>
        </div>
      )}

      {crawlMsg && <p className="crawl-msg">{crawlMsg}</p>}

      {crawling && crawlProgress.total > 0 && (
        <div className="crawl-progress">
          <div className="crawl-progress-bar">
            <div className="crawl-progress-fill"
              style={{ width: `${(crawlProgress.done / crawlProgress.total) * 100}%` }} />
          </div>
          <p className="crawl-progress-text">
            {crawlProgress.done}/{crawlProgress.total} ? {crawlProgress.current}
          </p>
        </div>
      )}

      <input
        type="text"
        className="cards-search"
        placeholder="ī���, ī���, ���� �˻�..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      {loading ? (
        <p className="cards-empty">�ε� ��...</p>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem 0" }}>
          <p className="cards-empty" style={{ marginBottom: "1rem" }}>
            {cards.length === 0 ? "����� ī�尡 �����ϴ�." : "�˻� ����� �����ϴ�."}
          </p>
          {cards.length === 0 && (
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
              <button className="btn btn-primary btn-sm" onClick={() => setShowManual(true)}>
                ?? ī�� ���� �߰��ϱ�
              </button>
              <button className="btn btn-ghost btn-sm" onClick={loadSampleData} disabled={seeding}>
                {seeding ? "�ε� ��..." : "?? ���� ������ �ҷ�����"}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="cards-grid">
          {filtered.map((c) => (
            <button key={c.gorilla_id} className="card-item" onClick={() => setSelected(c)}>
              <div className="card-item-top">
                {c.image_url && (
                  <img src={c.image_url} alt={c.name} className="card-item-img" />
                )}
              </div>
              <div className="card-item-body">
                <p className="card-item-name">{c.name}</p>
                <p className="card-item-company">{c.company}</p>
                {c.benefits.length > 0 && (
                  <p className="card-item-benefit">
                    {c.benefits[0].category}: {c.benefits[0].summary.slice(0, 30)}
                    {c.benefits[0].summary.length > 30 ? "��" : ""}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
