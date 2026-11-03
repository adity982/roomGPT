"use client";
import { useEffect, useState } from "react";
import {
  ArrowDownTrayIcon,
  CheckIcon,
  ChatBubbleLeftRightIcon,
  Squares2X2Icon,
} from "@heroicons/react/24/outline";
import {
  budgetTotals,
  money,
  ProposalSnapshot,
  ReviewEntry,
} from "../../utils/studio-model";
import { api, DateLabel, imageUrl } from "./client";

export default function ClientReview({ token }: { token: string }) {
  const [data, setData] = useState<{
    snapshot: ProposalSnapshot;
    entries: ReviewEntry[];
    expiresAt: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<"comment" | "changes" | "approve">(
    "comment",
  );
  const [notice, setNotice] = useState("");
  useEffect(() => {
    api(`/review/${token}`)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setReady(true));
  }, [token]);
  const snapshot = data?.snapshot;
  const totals = budgetTotals(
    snapshot?.lines || [],
    snapshot?.contingency || 0,
  );
  const approved = data?.entries.find((entry) => entry.action === "approve");
  return (
    <div className="studio-shell client-review">
      <header className="studio-header">
        <div className="studio-brand">
          <Squares2X2Icon />
          roomGPT <span>Studio</span>
        </div>
        <span className="review-header-label">Client proposal</span>
        <button
          className="secondary-button no-print"
          onClick={() => window.print()}
          disabled={!data}
        >
          <ArrowDownTrayIcon />
          Print / PDF
        </button>
      </header>
      <main className="client-review-main">
        {!ready ? (
          <p>Opening proposal...</p>
        ) : !snapshot ? (
          <section className="review-unavailable">
            <h1>This proposal is unavailable.</h1>
            <p role="alert">{error}</p>
            <p>Ask the studio for a new review link.</p>
          </section>
        ) : (
          <>
            <div className="review-page-heading">
              <div>
                <span className="eyebrow">Prepared for {snapshot.client}</span>
                <h1>{snapshot.projectName}</h1>
                <p>
                  Proposal revision {snapshot.revision} /{" "}
                  <DateLabel value={snapshot.createdAt} />
                </p>
              </div>
              <span className={`review-status ${approved ? "approved" : ""}`}>
                {approved ? "Approved" : "For your review"}
              </span>
            </div>
            <div className="client-proposal-layout">
              <section>
                <img
                  className="client-room-image"
                  src={imageUrl(snapshot.version.assetId, token)}
                  alt={snapshot.version.label}
                />
                <div className="image-caption">
                  <strong>{snapshot.version.label}</strong>
                  <span>Design concept / verify measurements and finishes</span>
                </div>
                {snapshot.version.prompt && (
                  <p className="concept-instruction">
                    {snapshot.version.prompt}
                  </p>
                )}
              </section>
              <aside className="proposal-cost">
                <span className="section-label">Project estimate</span>
                <strong>{money(totals.total)}</strong>
                <span>Room budget {money(snapshot.budget)}</span>
                <div className="control-divider" />
                <dl className="budget-totals">
                  <div>
                    <dt>Items and services</dt>
                    <dd>{money(totals.subtotal)}</dd>
                  </div>
                  <div>
                    <dt>Contingency ({snapshot.contingency}%)</dt>
                    <dd>{money(totals.reserve)}</dd>
                  </div>
                  <div
                    className={
                      totals.total > snapshot.budget ? "over-budget" : ""
                    }
                  >
                    <dt>
                      {totals.total > snapshot.budget
                        ? "Over budget"
                        : "Remaining"}
                    </dt>
                    <dd>{money(Math.abs(snapshot.budget - totals.total))}</dd>
                  </div>
                </dl>
                <p>
                  Prices marked as estimates are provisional. Confirm
                  dimensions, availability, and final supplier quotes before
                  ordering.
                </p>
              </aside>
            </div>
            <section className="client-budget">
              <div className="section-heading">
                <h2>Furniture, finishes & services</h2>
                <span>{snapshot.lines.length} items</span>
              </div>
              <div className="budget-table-wrap">
                <table className="budget-table read-only">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Supplier</th>
                      <th>Qty</th>
                      <th>Unit price</th>
                      <th>Total</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.lines.map((line) => (
                      <tr key={line.id}>
                        <td>
                          <strong>{line.name}</strong>
                          <small>{line.category}</small>
                        </td>
                        <td>
                          {line.url ? (
                            <a href={line.url} target="_blank" rel="noreferrer">
                              {line.supplier || "View product"}
                            </a>
                          ) : (
                            line.supplier || "To be confirmed"
                          )}
                        </td>
                        <td>{line.quantity}</td>
                        <td>{money(line.unitPrice)}</td>
                        <td>{money(line.quantity * line.unitPrice)}</td>
                        <td>
                          <span className={`quote-status ${line.status}`}>
                            {line.status === "quoted" ? "Quoted" : "Estimate"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="client-feedback">
              <div className="feedback-heading">
                <span className="section-label">Your feedback</span>
                <h2>
                  {approved ? "A decision, recorded." : "What do you think?"}
                </h2>
                <p>This review covers the image and budget shown above.</p>
                {approved && (
                  <div className="approval-receipt">
                    <CheckIcon />
                    <div>
                      <strong>Approved by {approved.name}</strong>
                      <small>
                        <DateLabel value={approved.createdAt} />
                      </small>
                    </div>
                  </div>
                )}
              </div>
              <div className="feedback-form no-print">
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const values = new FormData(form);
                    setBusy(true);
                    setError("");
                    setNotice("");
                    try {
                      setData(
                        await api(`/review/${token}`, {
                          method: "POST",
                          body: JSON.stringify({
                            action,
                            name: values.get("name"),
                            message: values.get("message"),
                          }),
                        }),
                      );
                      setNotice(
                        action === "approve"
                          ? "Your approval has been recorded."
                          : "Your feedback has been saved.",
                      );
                      setAction("comment");
                      (
                        form.elements.namedItem(
                          "message",
                        ) as HTMLTextAreaElement
                      ).value = "";
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <label>
                    Your name
                    <input
                      name="name"
                      autoComplete="name"
                      required
                      maxLength={100}
                    />
                  </label>
                  <label>
                    Decision
                    <select
                      aria-label="Decision"
                      value={action}
                      onChange={(e) =>
                        setAction(e.target.value as typeof action)
                      }
                    >
                      <option value="comment">Leave a comment</option>
                      {!approved && (
                        <>
                          <option value="changes">Request changes</option>
                          <option value="approve">Approve this proposal</option>
                        </>
                      )}
                    </select>
                  </label>
                  <label>
                    {action === "approve" ? "Note (optional)" : "Your feedback"}
                    <textarea
                      name="message"
                      required={action !== "approve"}
                      maxLength={2000}
                      rows={3}
                    />
                  </label>
                  {action === "approve" && (
                    <label className="approval-checkbox">
                      <input type="checkbox" required key={action} />I approve
                      this proposal image and the {money(totals.total)}{" "}
                      estimate, including the provisional prices shown.
                    </label>
                  )}
                  {error && (
                    <p className="error-text" role="alert">
                      {error}
                    </p>
                  )}
                  {notice && (
                    <p className="success-text" role="status">
                      {notice}
                    </p>
                  )}
                  <button className="primary-button" disabled={busy}>
                    {action === "approve" ? (
                      <CheckIcon />
                    ) : (
                      <ChatBubbleLeftRightIcon />
                    )}
                    {busy
                      ? "Saving..."
                      : action === "approve"
                        ? "Record approval"
                        : "Send feedback"}
                  </button>
                </form>
              </div>
            </section>
            {!!data!.entries.length && (
              <section className="client-activity">
                <h2>Conversation</h2>
                {data!.entries.map((entry) => (
                  <article key={entry.id} className="review-entry">
                    <strong>
                      {entry.name}
                      <span>
                        {entry.action === "approve"
                          ? "Approved proposal"
                          : entry.action === "changes"
                            ? "Requested changes"
                            : "Commented"}
                      </span>
                    </strong>
                    <p>{entry.message}</p>
                    <small>
                      <DateLabel value={entry.createdAt} />
                    </small>
                  </article>
                ))}
              </section>
            )}
            <footer className="studio-footer">
              <span>Shared privately by your design studio</span>
              <span>
                Link expires <DateLabel value={data!.expiresAt} />
              </span>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
