"use client";

import { useCallback, useEffect, useId, useState } from "react";

export default function FeedbackPanel() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(
    "idle"
  );
  const [message, setMessage] = useState("");
  const titleId = useId();
  const descId = useId();

  const close = useCallback(() => {
    setOpen(false);
    setStatus("idle");
    setMessage("");
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          title: title.trim(),
          description: description.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        setStatus("error");
        setMessage(data.error ?? "Something went wrong.");
        return;
      }
      setStatus("success");
      setMessage("Thanks — your feedback was sent.");
      setEmail("");
      setTitle("");
      setDescription("");
    } catch {
      setStatus("error");
      setMessage("Network error. Try again.");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pointer-events-auto fixed bottom-4 right-4 z-90 rounded-full border border-white/35 bg-white/10 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.2em] text-white/90 shadow-[0_4px_24px_rgba(0,0,0,0.25)] backdrop-blur-sm transition hover:bg-white/18 active:bg-white/22 sm:bottom-5 sm:right-5 sm:px-5 sm:text-xs"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        Feedback
      </button>

      {open && (
        <div
          className="fixed inset-0 z-100 flex items-center justify-center bg-black/20 p-4 backdrop-blur-md"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/25 bg-zinc-950/80 p-5 text-white shadow-2xl backdrop-blur-xl"
            role="dialog"
            aria-modal
            aria-labelledby={titleId}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2
                id={titleId}
                className="font-(family-name:--font-display) text-base font-semibold uppercase tracking-[0.18em] text-white/95 sm:text-lg"
              >
                Feedback
              </h2>
              <button
                type="button"
                onClick={close}
                className="shrink-0 rounded-lg border border-white/25 bg-transparent px-3 py-1 text-[10px] uppercase tracking-widest text-white/75 hover:bg-white/10"
              >
                Close
              </button>
            </div>
            <p className="mb-4 text-sm leading-relaxed text-white/55">
              Share a short title and details. This is sent by email to the site
              owner.
            </p>
            <form onSubmit={submit} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-widest text-white/50">
                Your email
                <input
                  type="email"
                  name="feedback-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={254}
                  required
                  autoComplete="email"
                  inputMode="email"
                  className="rounded-lg border border-white/20 bg-black/25 px-3 py-2 text-sm font-normal normal-case tracking-normal text-white placeholder:text-white/35 focus:border-white/40 focus:outline-none"
                  placeholder="you@example.com"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-widest text-white/50">
                Title
                <input
                  type="text"
                  name="feedback-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                  required
                  autoComplete="off"
                  className="rounded-lg border border-white/20 bg-black/25 px-3 py-2 text-sm font-normal normal-case tracking-normal text-white placeholder:text-white/35 focus:border-white/40 focus:outline-none"
                  placeholder="What is this about?"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-widest text-white/50">
                Description
                <textarea
                  id={descId}
                  name="feedback-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={10000}
                  required
                  rows={5}
                  className="resize-y rounded-lg border border-white/20 bg-black/25 px-3 py-2 text-sm font-normal normal-case tracking-normal text-white placeholder:text-white/35 focus:border-white/40 focus:outline-none"
                  placeholder="Details, steps to reproduce, ideas…"
                />
              </label>
              {message && (
                <p
                  className={
                    status === "success"
                      ? "text-sm text-emerald-400/95"
                      : "text-sm text-red-400/95"
                  }
                  role={status === "error" ? "alert" : undefined}
                >
                  {message}
                </p>
              )}
              <div className="mt-1 flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={status === "loading"}
                  className="rounded-lg border border-white/30 bg-white/15 px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-white hover:bg-white/22 disabled:opacity-50"
                >
                  {status === "loading" ? "Sending…" : "Send"}
                </button>
                <button
                  type="button"
                  onClick={close}
                  className="rounded-lg border border-white/20 bg-transparent px-4 py-2 text-[11px] uppercase tracking-widest text-white/70 hover:bg-white/10"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
