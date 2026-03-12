"use client";

import { useCallback, useEffect, useState } from "react";

/* ══════════════════════════════════════
   💰 금융상품 비교 – 금감원 API
   ══════════════════════════════════════ */

interface Product {
  fin_co_no: string;
  kor_co_nm: string;
  fin_prdt_nm: string;
  fin_prdt_cd: string;
  join_way: string;
  mtrt_int: string;
  spcl_cnd: string;
  join_deny: string;
  join_member: string;
  etc_note: string;
  max_limit: number | null;
}

interface Option {
  fin_prdt_cd: string;
  intr_rate_type_nm: string;
  save_trm: string;
  intr_rate: number | null;
  intr_rate2: number | null;
}

interface LoanProduct {
  fin_co_no: string;
  kor_co_nm: string;
  fin_prdt_nm: string;
  fin_prdt_cd: string;
  join_way: string;
  loan_inci_expn: string;
  erly_rpay_fee: string;
  dly_rate: string;
  loan_lmt: string;
}

interface LoanOption {
  fin_prdt_cd: string;
  rpay_type_nm: string;
  lend_rate_type_nm: string;
  lend_rate_min: number | null;
  lend_rate_max: number | null;
  lend_rate_avg: number | null;
}

const TYPES = [
  { id: "deposit", label: "정기예금", icon: "🏦" },
  { id: "saving", label: "정기적금", icon: "💰" },
  { id: "mortgage", label: "주택담보대출", icon: "🏠" },
  { id: "rent", label: "전세자금대출", icon: "🏢" },
  { id: "credit", label: "신용대출", icon: "💳" },
];

const GROUPS = [
  { id: "bank", label: "은행" },
  { id: "saving_bank", label: "저축은행" },
  { id: "credit_union", label: "신용협동조합" },
];

const isLoanType = (t: string) => ["mortgage", "rent", "credit"].includes(t);

export default function FinancePage() {
  const [type, setType] = useState("deposit");
  const [group, setGroup] = useState("bank");
  const [products, setProducts] = useState<Product[]>([]);
  const [loanProducts, setLoanProducts] = useState<LoanProduct[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [loanOptions, setLoanOptions] = useState<LoanOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [maxPage, setMaxPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const fetchProducts = useCallback(async (t: string, g: string, p: number) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/finance/products?type=${t}&group=${g}&page=${p}`);
      const json = await res.json();
      if (!json.ok) {
        setError(json.message || "API 오류");
        setProducts([]);
        setLoanProducts([]);
        setOptions([]);
        setLoanOptions([]);
        return;
      }
      if (isLoanType(t)) {
        setLoanProducts(json.products || []);
        setLoanOptions(json.options || []);
        setProducts([]);
        setOptions([]);
      } else {
        setProducts(json.products || []);
        setOptions(json.options || []);
        setLoanProducts([]);
        setLoanOptions([]);
      }
      setMaxPage(json.maxPage || 1);
      setTotalCount(json.totalCount || 0);
    } catch {
      setError("네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts(type, group, page);
  }, [type, group, page, fetchProducts]);

  const getOptionsForProduct = (code: string) =>
    options.filter((o) => o.fin_prdt_cd === code);
  const getLoanOptionsForProduct = (code: string) =>
    loanOptions.filter((o) => o.fin_prdt_cd === code);

  const bestRate = (code: string) => {
    const opts = getOptionsForProduct(code);
    if (opts.length === 0) return null;
    return Math.max(...opts.map((o) => o.intr_rate2 ?? o.intr_rate ?? 0));
  };

  const bestLoanRate = (code: string) => {
    const opts = getLoanOptionsForProduct(code);
    if (opts.length === 0) return null;
    const mins = opts.map((o) => o.lend_rate_min).filter((v): v is number => v !== null);
    return mins.length > 0 ? Math.min(...mins) : null;
  };

  const joinDenyLabel = (v: string) => {
    if (v === "1") return "제한없음";
    if (v === "2") return "서민전용";
    if (v === "3") return "일부제한";
    return v;
  };

  return (
    <div className="finance-page">
      <h2 className="finance-title">💰 금융상품 비교</h2>
      <p className="finance-sub">금융감독원 '금융상품 한눈에' 데이터 기반</p>

      {/* 상품 유형 탭 */}
      <div className="finance-tabs">
        {TYPES.map((t) => (
          <button
            key={t.id}
            className={`finance-tab ${type === t.id ? "active" : ""}`}
            onClick={() => { setType(t.id); setPage(1); }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* 금융권역 선택 */}
      <div className="finance-groups">
        {GROUPS.map((g) => (
          <button
            key={g.id}
            className={`finance-group-btn ${group === g.id ? "active" : ""}`}
            onClick={() => { setGroup(g.id); setPage(1); }}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* 상태 */}
      {loading && <div className="finance-loading">📡 데이터 로딩 중...</div>}
      {error && <div className="finance-error">⚠️ {error}</div>}
      {!loading && !error && totalCount > 0 && (
        <div className="finance-count">총 {totalCount}개 상품 ({page}/{maxPage} 페이지)</div>
      )}

      {/* 예금/적금 테이블 */}
      {!isLoanType(type) && products.length > 0 && (
        <div className="finance-table-wrap">
          <table className="finance-table">
            <thead>
              <tr>
                <th>금융사</th>
                <th>상품명</th>
                <th>최고금리</th>
                <th>가입방법</th>
                <th>가입제한</th>
                <th>우대조건</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const rate = bestRate(p.fin_prdt_cd);
                return (
                  <tr key={p.fin_prdt_cd}>
                    <td className="td-company">{p.kor_co_nm}</td>
                    <td className="td-name">
                      <strong>{p.fin_prdt_nm}</strong>
                      {p.etc_note && <small className="td-note">{p.etc_note.slice(0, 60)}</small>}
                    </td>
                    <td className="td-rate">
                      {rate !== null ? <span className="rate-highlight">{rate.toFixed(2)}%</span> : "-"}
                      <div className="rate-terms">
                        {getOptionsForProduct(p.fin_prdt_cd).map((o, i) => (
                          <small key={i}>
                            {o.save_trm}개월: {o.intr_rate ?? "-"}%
                            {o.intr_rate2 ? ` (우대 ${o.intr_rate2}%)` : ""}
                          </small>
                        ))}
                      </div>
                    </td>
                    <td>{p.join_way}</td>
                    <td>{joinDenyLabel(p.join_deny)}</td>
                    <td className="td-note">{p.spcl_cnd?.slice(0, 80) || "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 대출 테이블 */}
      {isLoanType(type) && loanProducts.length > 0 && (
        <div className="finance-table-wrap">
          <table className="finance-table">
            <thead>
              <tr>
                <th>금융사</th>
                <th>상품명</th>
                <th>최저금리</th>
                <th>가입방법</th>
                <th>대출한도</th>
                <th>중도상환수수료</th>
              </tr>
            </thead>
            <tbody>
              {loanProducts.map((p) => {
                const rate = bestLoanRate(p.fin_prdt_cd);
                return (
                  <tr key={p.fin_prdt_cd}>
                    <td className="td-company">{p.kor_co_nm}</td>
                    <td className="td-name">
                      <strong>{p.fin_prdt_nm}</strong>
                    </td>
                    <td className="td-rate">
                      {rate !== null ? <span className="rate-highlight loan">{rate.toFixed(2)}%</span> : "-"}
                      <div className="rate-terms">
                        {getLoanOptionsForProduct(p.fin_prdt_cd).map((o, i) => (
                          <small key={i}>
                            {o.rpay_type_nm} {o.lend_rate_type_nm}: {o.lend_rate_min ?? "-"}~{o.lend_rate_max ?? "-"}%
                          </small>
                        ))}
                      </div>
                    </td>
                    <td>{p.join_way}</td>
                    <td>{p.loan_lmt || "-"}</td>
                    <td className="td-note">{p.erly_rpay_fee?.slice(0, 60) || "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 데이터 없음 */}
      {!loading && !error && products.length === 0 && loanProducts.length === 0 && (
        <div className="finance-empty">
          <p>📭 표시할 상품이 없습니다.</p>
          <p className="finance-empty-hint">API 키가 설정되어 있는지 확인하세요 (FSS_API_KEY)</p>
        </div>
      )}

      {/* 페이징 */}
      {maxPage > 1 && (
        <div className="finance-paging">
          <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ← 이전
          </button>
          <span>{page} / {maxPage}</span>
          <button className="btn btn-sm" disabled={page >= maxPage} onClick={() => setPage(page + 1)}>
            다음 →
          </button>
        </div>
      )}
    </div>
  );
}
