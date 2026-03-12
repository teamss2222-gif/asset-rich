"use client";

import { FormEvent, useState } from "react";
import { requestApi } from "../../lib/http-client";

type Status = {
  type: "idle" | "ok" | "error";
  message: string;
};

export function ContactForm() {
  const [status, setStatus] = useState<Status>({ type: "idle", message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus({ type: "idle", message: "" });

    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      message: String(formData.get("message") ?? ""),
    };

    try {
      const result = await requestApi<{ message?: string }>("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!result.ok) {
        throw new Error(result.traceId ? `${result.message} (traceId: ${result.traceId})` : result.message);
      }

      form.reset();
      setStatus({ type: "ok", message: result.data.message ?? "문의가 정상 접수되었습니다." });
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="contact-form" onSubmit={handleSubmit}>
      <label>
        Name
        <input name="name" type="text" required minLength={2} placeholder="홍길동" />
      </label>
      <label>
        Email
        <input name="email" type="email" required placeholder="you@example.com" />
      </label>
      <label>
        Message
        <textarea name="message" required minLength={10} rows={5} placeholder="어떤 프로젝트인지 간단히 설명해 주세요." />
      </label>
      <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Sending..." : "Send Inquiry"}
      </button>
      {status.type !== "idle" ? (
        <p className={status.type === "ok" ? "form-ok" : "form-error"}>{status.message}</p>
      ) : null}
    </form>
  );
}
