"use client";

import { useRef, useState } from "react";
import { requestApi } from "../../lib/http-client";

export default function FileUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null);
    setResultUrl(null);
    setError("");
  };

  const handleUpload = async () => {
    if (!file) return;
    setBusy(true);
    setError("");
    setResultUrl(null);

    try {
      const fd = new FormData();
      fd.append("file", file);
      const result = await requestApi<{ url?: string }>("/api/upload", { method: "POST", body: fd });

      if (!result.ok) {
        setError(result.traceId ? `${result.message} (traceId: ${result.traceId})` : result.message);
        return;
      }

      setResultUrl(result.data.url ?? null);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="upload-card">
      <p className="upload-label">파일 업로드</p>
      <div className="upload-row">
        <input
          ref={inputRef}
          type="file"
          className="upload-input"
          onChange={handleChange}
        />
        <button
          className="btn btn-primary"
          type="button"
          onClick={handleUpload}
          disabled={!file || busy}
        >
          {busy ? "업로드 중..." : "업로드"}
        </button>
      </div>
      {error ? <p className="upload-error">{error}</p> : null}
      {resultUrl ? (
        <p className="upload-ok">
          완료:{" "}
          <a href={resultUrl} target="_blank" rel="noopener noreferrer" className="upload-link">
            파일 열기
          </a>
        </p>
      ) : null}
    </div>
  );
}
