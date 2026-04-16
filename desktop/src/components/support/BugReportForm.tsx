/**
 * BugReportForm — collects bug details, attachments, and system diagnostics,
 * then submits a support ticket via the API.
 *
 * Automatically collects diagnostics via `collect_diagnostics` Tauri command
 * on mount, and pre-fills user identity from the auth JWT when available.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ArrowLeft, Paperclip, X, Loader2 } from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";
import { authFetch } from "../../api/client";
import { getUserIdentity, isAuthenticated } from "../../auth";

// ── Types ────────────────────────────────────────────────────────

interface BugReportFormProps {
  onBack: () => void;
}

interface Attachment {
  filename: string;
  mime_type: string;
  data: string; // base64
}

type Frequency = "always" | "sometimes" | "first_time";

const FREQUENCY_OPTIONS: { value: Frequency; label: string }[] = [
  { value: "always", label: "Always" },
  { value: "sometimes", label: "Sometimes" },
  { value: "first_time", label: "First time" },
];

const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// ── Helpers ──────────────────────────────────────────────────────

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data:...;base64, prefix
      const base64 = result.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

// ── Component ────────────────────────────────────────────────────

export default function BugReportForm({ onBack }: BugReportFormProps) {
  // Form fields
  const [description, setDescription] = useState("");
  const [whatWentWrong, setWhatWentWrong] = useState("");
  const [expectedBehavior, setExpectedBehavior] = useState("");
  const [frequency, setFrequency] = useState<Frequency | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  // Attachments
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Diagnostics
  const [diagnostics, setDiagnostics] = useState<Record<string, unknown> | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(true);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auth state
  const authenticated = isAuthenticated();

  // ── Collect diagnostics on mount ────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    invoke<Record<string, unknown>>("collect_diagnostics")
      .then((result) => {
        if (!cancelled) setDiagnostics(result);
      })
      .catch((err) => {
        console.warn("[BugReportForm] Failed to collect diagnostics:", err);
        if (!cancelled) setDiagnostics(null);
      })
      .finally(() => {
        if (!cancelled) setDiagnosticsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // ── Pre-fill user identity ──────────────────────────────────────
  useEffect(() => {
    const identity = getUserIdentity();
    if (identity.email) setEmail(identity.email);
    if (identity.name) setName(identity.name);
  }, []);

  // ── Cooldown timer cleanup ──────────────────────────────────────
  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  // ── File handling ───────────────────────────────────────────────

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = Array.from(e.target.files ?? []);
      if (!selected.length) return;

      // Reset input so the same file can be re-selected
      e.target.value = "";

      const totalAfter = files.length + selected.length;
      if (totalAfter > MAX_FILES) {
        toast.error(`Maximum ${MAX_FILES} files allowed`);
        return;
      }

      const oversized = selected.filter((f) => f.size > MAX_FILE_SIZE);
      if (oversized.length) {
        toast.error(
          `${oversized.map((f) => f.name).join(", ")} exceeds 10MB limit`,
        );
        return;
      }

      setFiles((prev) => [...prev, ...selected]);
    },
    [files.length],
  );

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ── Submit ──────────────────────────────────────────────────────

  const canSubmit =
    description.trim().length > 0 &&
    whatWentWrong.trim().length > 0 &&
    !submitting &&
    cooldown === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);

    try {
      // Convert files to base64 attachments
      const attachments: Attachment[] = await Promise.all(
        files.map(async (file) => ({
          filename: file.name,
          mime_type: file.type || "application/octet-stream",
          data: await readFileAsBase64(file),
        })),
      );

      const payload = {
        description: description.trim(),
        what_went_wrong: whatWentWrong.trim(),
        expected_behavior: expectedBehavior.trim() || undefined,
        frequency: frequency ?? undefined,
        diagnostics: diagnostics ?? undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
        email: email.trim() || undefined,
        name: name.trim() || undefined,
      };

      await authFetch("/support/ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      toast.success("Bug report submitted — we'll follow up by email");

      // Start 60s cooldown
      setCooldown(60);
      cooldownRef.current = setInterval(() => {
        setCooldown((prev) => {
          if (prev <= 1) {
            if (cooldownRef.current) clearInterval(cooldownRef.current);
            cooldownRef.current = null;
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      onBack();
    } catch {
      toast.error("Failed to submit bug report — please try again");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit} className="p-5 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center justify-center w-7 h-7 rounded-lg text-fg-3 hover:text-fg-2 hover:bg-surface-hover transition-colors cursor-pointer"
          aria-label="Back to support"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-sm font-semibold text-fg">Report a Bug</h1>
          <p className="text-xs text-fg-4">
            Describe the issue and we&apos;ll include diagnostics automatically
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {/* Email (only if not authenticated) */}
        {!authenticated && (
          <div>
            <label className="block text-xs font-medium text-fg-2 mb-1.5">
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full bg-surface-2 border border-edge/30 rounded-lg px-3 py-2 text-sm text-fg focus:border-accent/60 focus:outline-none placeholder:text-fg-4"
            />
          </div>
        )}

        {/* What were you trying to do? */}
        <div>
          <label className="block text-xs font-medium text-fg-2 mb-1.5">
            What were you trying to do?
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            required
            placeholder="Describe what you were doing..."
            className="w-full bg-surface-2 border border-edge/30 rounded-lg px-3 py-2 text-sm text-fg resize-none focus:border-accent/60 focus:outline-none placeholder:text-fg-4"
          />
        </div>

        {/* What went wrong? */}
        <div>
          <label className="block text-xs font-medium text-fg-2 mb-1.5">
            What went wrong?
          </label>
          <textarea
            value={whatWentWrong}
            onChange={(e) => setWhatWentWrong(e.target.value)}
            rows={4}
            required
            placeholder="Describe the issue..."
            className="w-full bg-surface-2 border border-edge/30 rounded-lg px-3 py-2 text-sm text-fg resize-none focus:border-accent/60 focus:outline-none placeholder:text-fg-4"
          />
        </div>

        {/* What did you expect? */}
        <div>
          <label className="block text-xs font-medium text-fg-2 mb-1.5">
            What did you expect to happen instead?
          </label>
          <textarea
            value={expectedBehavior}
            onChange={(e) => setExpectedBehavior(e.target.value)}
            rows={3}
            placeholder="Optional..."
            className="w-full bg-surface-2 border border-edge/30 rounded-lg px-3 py-2 text-sm text-fg resize-none focus:border-accent/60 focus:outline-none placeholder:text-fg-4"
          />
        </div>

        {/* Frequency */}
        <div>
          <label className="block text-xs font-medium text-fg-2 mb-1.5">
            Does this happen every time?
          </label>
          <div className="flex gap-2">
            {FREQUENCY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFrequency(opt.value)}
                className={clsx(
                  "px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer",
                  frequency === opt.value
                    ? "bg-accent/15 text-accent"
                    : "bg-surface-2 text-fg-3 hover:text-fg-2",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Attachments */}
        <div>
          <label className="block text-xs font-medium text-fg-2 mb-1.5">
            Attachments
          </label>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.log,.txt,.json"
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={files.length >= MAX_FILES}
            className={clsx(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer",
              files.length >= MAX_FILES
                ? "bg-surface-2 text-fg-4 cursor-not-allowed"
                : "bg-surface-2 text-fg-3 hover:text-fg-2 hover:bg-surface-hover",
            )}
          >
            <Paperclip size={13} />
            Attach files
          </button>
          <p className="text-[11px] text-fg-4 mt-1">
            Max {MAX_FILES} files, 10MB each. Images, logs, text, JSON.
          </p>

          {/* File chips */}
          {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {files.map((file, i) => (
                <span
                  key={`${file.name}-${i}`}
                  className="inline-flex items-center gap-1 bg-surface-2 border border-edge/30 rounded-md px-2 py-0.5 text-[11px] text-fg-2"
                >
                  {file.name}
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="text-fg-4 hover:text-fg-2 transition-colors cursor-pointer"
                    aria-label={`Remove ${file.name}`}
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Diagnostic Info */}
        <details className="group">
          <summary className="text-xs font-medium text-fg-3 cursor-pointer hover:text-fg-2 transition-colors select-none">
            {diagnosticsLoading
              ? "Collecting system diagnostics..."
              : "System diagnostics will be included"}
          </summary>
          <div className="mt-2">
            {diagnosticsLoading ? (
              <div className="flex items-center gap-2 text-xs text-fg-4 py-3">
                <Loader2 size={13} className="animate-spin" />
                Collecting diagnostics...
              </div>
            ) : diagnostics ? (
              <pre className="text-[11px] font-mono bg-surface-2 rounded p-3 max-h-60 overflow-y-auto text-fg-3 whitespace-pre-wrap break-all">
                {JSON.stringify(diagnostics, null, 2)}
              </pre>
            ) : (
              <p className="text-xs text-fg-4 py-2">
                Diagnostics could not be collected.
              </p>
            )}
          </div>
        </details>

        {/* Submit */}
        <button
          type="submit"
          disabled={!canSubmit}
          className={clsx(
            "w-full py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer",
            canSubmit
              ? "bg-accent text-white hover:bg-accent/90"
              : "bg-surface-2 text-fg-4 cursor-not-allowed",
          )}
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              Submitting...
            </span>
          ) : cooldown > 0 ? (
            `Submit (${cooldown}s)`
          ) : (
            "Submit Bug Report"
          )}
        </button>
      </div>
    </form>
  );
}
