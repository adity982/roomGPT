"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@headlessui/react";
import {
  ArrowDownTrayIcon,
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowRightOnRectangleIcon,
  CameraIcon,
  CheckIcon,
  ChevronRightIcon,
  DocumentDuplicateIcon,
  LinkIcon,
  PhotoIcon,
  PlusIcon,
  Squares2X2Icon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import {
  BudgetLine,
  budgetTotals,
  money,
  PublicProject,
} from "../../utils/studio-model";
import LiveRoomPreview from "../LiveRoomPreview";
import { api, DateLabel, imageUrl } from "./client";

type User = { id: string; name: string; email: string };
type Tab = "Design" | "Budget" | "Brief" | "Reviews";

export default function Studio() {
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<PublicProject[]>([]);
  const [project, setProject] = useState<PublicProject | null>(null);
  const [ready, setReady] = useState(false);
  const [providerReady, setProviderReady] = useState(false);
  const [tab, setTab] = useState<Tab>("Design");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [newProject, setNewProject] = useState(false);
  const [jobId, setJobId] = useState("");
  const [sharedUrl, setSharedUrl] = useState("");
  const [camera, setCamera] = useState(false);
  const [compare, setCompare] = useState(false);
  const [compareId, setCompareId] = useState("");
  const [wipe, setWipe] = useState(50);
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("Modern");
  const photoRef = useRef<HTMLInputElement>(null);
  const conceptRef = useRef<HTMLInputElement>(null);

  async function load() {
    const data = await api();
    setUser(data.user);
    setProjects(data.projects);
    setProviderReady(data.providerReady);
    return data.projects as PublicProject[];
  }
  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    function leave(event: BeforeUnloadEvent) {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [dirty]);

  function adopt(value: PublicProject) {
    setProject(value);
    setDirty(false);
    setProjects((current) => [
      value,
      ...current.filter((p) => p.id !== value.id),
    ]);
  }
  async function run(action: () => Promise<void>) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setBusy(false);
    }
  }
  function edit(changes: Partial<PublicProject>) {
    if (project && !busy && !jobId) {
      setProject({ ...project, ...changes });
      setDirty(true);
    }
  }
  async function save() {
    if (!project) return;
    const saved = await api(`/projects/${project.id}`, {
      method: "PATCH",
      body: JSON.stringify(project),
    });
    adopt(saved);
    return saved as PublicProject;
  }
  async function selectProject(value: PublicProject) {
    await run(async () => {
      if (dirty) await save();
      const fresh = await api(`/projects/${value.id}`);
      adopt(fresh);
      const active = fresh.jobs.find((j: { status: string }) =>
        ["starting", "processing"].includes(j.status),
      );
      setJobId(active?.id || "");
      setSharedUrl("");
      setCamera(false);
      setCompare(false);
      setTab("Design");
    });
  }
  async function upload(
    file: File | Blob,
    kind: "source" | "concept",
    name?: string,
  ) {
    if (!project) return;
    await run(async () => {
      if (dirty) await save();
      const form = new FormData();
      form.append("file", file, name || (file as File).name || "room.jpg");
      form.append("kind", kind);
      adopt(
        await api(`/projects/${project.id}/assets`, {
          method: "POST",
          body: form,
        }),
      );
      setCamera(false);
      setNotice(kind === "source" ? "Room photo saved." : "Concept saved.");
    });
  }
  useEffect(() => {
    if (!jobId || !project) return;
    const id = project.id;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    async function poll() {
      try {
        const result = await api(`/projects/${id}/jobs/${jobId}`);
        if (stopped) return;
        failures = 0;
        if (result.job.status === "succeeded") {
          adopt(result.project);
          setJobId("");
          setNotice("Your new concept is ready.");
          return;
        }
        if (result.job.status === "failed") {
          setJobId("");
          setError(result.job.error);
          return;
        }
      } catch (e) {
        if (stopped) return;
        failures++;
        if (failures >= 5) {
          setJobId("");
          setError(
            "Could not check generation progress. Reopen the project to resume.",
          );
          return;
        }
      }
      timer = setTimeout(poll, 3000);
    }
    poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [jobId, project?.id]);

  async function create(form: HTMLFormElement) {
    const values = new FormData(form);
    await run(async () => {
      if (dirty) await save();
      adopt(
        await api("/projects", {
          method: "POST",
          body: JSON.stringify({
            name: values.get("name"),
            client: values.get("client"),
            budget: Number(values.get("budget")),
            brief: values.get("brief"),
          }),
        }),
      );
      setNewProject(false);
      setTab("Brief");
      setSharedUrl("");
      setCompare(false);
      setJobId("");
    });
  }
  async function sample() {
    await run(async () => {
      const created = await api("/projects", {
        method: "POST",
        body: JSON.stringify({
          name: "Living room refresh (sample)",
          client: "Sample client",
          budget: 150000,
          brief:
            "A comfortable living room with a reading corner. Warm neutrals and natural materials.",
          retain: "Existing floor, windows, and TV unit",
          measurements: "Add verified site measurements before ordering.",
        }),
      });
      let current = created;
      for (const [path, kind, label] of [
        ["/original-pic.jpg", "source", "Original room"],
        ["/generated-pic-2.jpg", "concept", "Sample concept"],
      ]) {
        const blob = await (await fetch(path)).blob();
        const form = new FormData();
        form.append("file", blob, "sample.jpg");
        form.append("kind", kind);
        form.append("label", label);
        current = await api(`/projects/${created.id}/assets`, {
          method: "POST",
          body: form,
        });
      }
      const lines = [
        {
          name: "Three-seat sofa",
          category: "Furniture",
          quantity: 1,
          unitPrice: 52000,
        },
        {
          name: "Reading chair",
          category: "Furniture",
          quantity: 1,
          unitPrice: 18500,
        },
        {
          name: "Floor lamp",
          category: "Lighting",
          quantity: 1,
          unitPrice: 7800,
        },
        {
          name: "Rug and cushion set",
          category: "Soft furnishings",
          quantity: 1,
          unitPrice: 16400,
        },
        {
          name: "Delivery and installation",
          category: "Services",
          quantity: 1,
          unitPrice: 9000,
        },
      ].map((line) => ({
        ...line,
        id: crypto.randomUUID(),
        supplier: "Sample estimate",
        url: "",
        status: "estimate",
      }));
      current = await api(`/projects/${created.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...current, lines }),
      });
      adopt(current);
      setTab("Design");
      setNotice(
        "Sample project created. All prices are illustrative estimates.",
      );
    });
  }
  const selected = project?.versions.find(
    (v) => v.id === project.selectedVersionId,
  );
  const before =
    project?.versions.find(
      (v) => v.id === compareId && v.id !== selected?.id,
    ) ||
    project?.versions.find(
      (v) => v.kind === "source" && v.id !== selected?.id,
    ) ||
    project?.versions.find((v) => v.id !== selected?.id);
  const totals = budgetTotals(project?.lines || [], project?.contingency || 0);

  if (!ready)
    return (
      <div className="studio-shell loading-screen">
        <Squares2X2Icon className="logo-mark" />
        <p>Opening your studio...</p>
      </div>
    );
  if (!user)
    return (
      <AccountScreen
        onSuccess={async () => {
          await load();
        }}
        initialError={error}
      />
    );

  return (
    <div className="studio-shell">
      <a className="skip-link" href="#studio-main">
        Skip to project
      </a>
      <header className="studio-header">
        <a className="studio-brand" href="/studio">
          <Squares2X2Icon />
          roomGPT <span>Studio</span>
        </a>
        <div className="studio-account">
          <span>{user.name}</span>
          <button
            className="icon-button"
            title="Sign out"
            aria-label="Sign out"
            disabled={busy || dirty || !!jobId}
            onClick={() =>
              run(async () => {
                await api("/auth", { method: "DELETE" });
                setUser(null);
                setProject(null);
                setProjects([]);
              })
            }
          >
            <ArrowRightOnRectangleIcon />
          </button>
        </div>
      </header>
      <div className="studio-layout">
        <aside className="project-sidebar">
          <div className="sidebar-title">
            <span>Projects</span>
            <button
              title="New project"
              aria-label="New project"
              className="icon-button"
              disabled={busy || !!jobId}
              onClick={() => setNewProject(true)}
            >
              <PlusIcon />
            </button>
          </div>
          <div className="project-list">
            {projects.map((item) => (
              <button
                key={item.id}
                className={`project-link ${project?.id === item.id ? "active" : ""}`}
                onClick={() => selectProject(item)}
                disabled={busy || !!jobId}
              >
                <span className="project-icon">
                  <PhotoIcon />
                </span>
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.client}</small>
                </span>
                <ChevronRightIcon />
              </button>
            ))}
          </div>
          <div className="sidebar-bottom">
            <span className="status-dot" />
            Private studio workspace
            <a href="/dream">
              Classic room generator <ChevronRightIcon />
            </a>
          </div>
        </aside>
        <main id="studio-main" className="studio-main">
          {error && (
            <div className="studio-alert error" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <XMarkIcon />
              </button>
            </div>
          )}
          {notice && (
            <div className="studio-alert success" role="status">
              {notice}
              <button
                aria-label="Dismiss message"
                onClick={() => setNotice("")}
              >
                <XMarkIcon />
              </button>
            </div>
          )}
          {!project ? (
            <section className="empty-workspace">
              <div className="empty-photo">
                <img
                  src="/generated-pic-2.jpg"
                  alt="Sample redesigned living room"
                />
              </div>
              <div className="empty-copy">
                <span className="eyebrow">Your workspace</span>
                <h1>
                  Every room starts
                  <br />
                  with a conversation.
                </h1>
                <p>Create a client project or explore a sample living room.</p>
                <button
                  className="primary-button"
                  onClick={() => setNewProject(true)}
                >
                  <PlusIcon />
                  New project
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={sample}
                >
                  Open sample project
                  <ChevronRightIcon />
                </button>
              </div>
            </section>
          ) : (
            <>
              <div className="project-heading">
                <div>
                  <div className="breadcrumb">
                    Projects <ChevronRightIcon /> {project.client}
                  </div>
                  <h1>{project.name}</h1>
                  <p>
                    {project.versions.length} images <span> / </span> Updated{" "}
                    <DateLabel value={project.updatedAt} />
                  </p>
                </div>
                <div className="heading-actions">
                  <span className={dirty ? "save-state unsaved" : "save-state"}>
                    {dirty ? "Unsaved changes" : "All changes saved"}
                  </span>
                  <button
                    className="secondary-button"
                    disabled={busy || !dirty || !!jobId}
                    onClick={() =>
                      run(async () => {
                        await save();
                        setNotice("Project saved.");
                      })
                    }
                  >
                    <CheckIcon />
                    Save
                  </button>
                  <button
                    className="primary-button"
                    disabled={busy || !!jobId}
                    onClick={() =>
                      run(async () => {
                        const current = dirty ? await save() : project;
                        const share = await api(
                          `/projects/${project.id}/share`,
                          {
                            method: "POST",
                            body: JSON.stringify({
                              revision: current!.revision,
                            }),
                          },
                        );
                        setSharedUrl(share.url);
                        const fresh = await api(`/projects/${project.id}`);
                        adopt(fresh);
                        setTab("Reviews");
                      })
                    }
                  >
                    <LinkIcon />
                    Share proposal
                  </button>
                </div>
              </div>
              <div
                className="project-tabs"
                role="tablist"
                aria-label="Project views"
              >
                {(["Design", "Budget", "Brief", "Reviews"] as Tab[]).map(
                  (name) => (
                    <button
                      key={name}
                      role="tab"
                      aria-selected={tab === name}
                      className={tab === name ? "active" : ""}
                      onClick={() => setTab(name)}
                    >
                      {name}
                      {name === "Budget" && <span>{project.lines.length}</span>}
                      {name === "Reviews" && (
                        <span>{project.shares.length}</span>
                      )}
                    </button>
                  ),
                )}
                <div className="budget-summary">
                  <span>Project estimate</span>
                  <strong
                    className={
                      totals.total > project.budget ? "over-budget" : ""
                    }
                  >
                    {money(totals.total)}
                  </strong>
                  <small>of {money(project.budget)}</small>
                </div>
              </div>
              <fieldset className="workspace-fields" disabled={busy || !!jobId}>
                {tab === "Design" && (
                  <div className="design-layout">
                    <section className="design-canvas">
                      <div className="canvas-toolbar">
                        <div className="segmented">
                          <button
                            className={!compare ? "active" : ""}
                            onClick={() => setCompare(false)}
                          >
                            Single view
                          </button>
                          <button
                            className={compare ? "active" : ""}
                            disabled={
                              !selected ||
                              !before ||
                              project.versions.length < 2
                            }
                            onClick={() => setCompare(true)}
                          >
                            Compare
                          </button>
                        </div>
                        <div className="toolbar-actions">
                          <button
                            className="icon-button"
                            title="Add room photo"
                            aria-label="Add room photo"
                            disabled={busy || !!jobId}
                            onClick={() => photoRef.current?.click()}
                          >
                            <PhotoIcon />
                          </button>
                          <button
                            className="icon-button"
                            title="Open camera"
                            aria-label="Open camera"
                            disabled={busy || !!jobId}
                            onClick={() => setCamera(!camera)}
                          >
                            <CameraIcon />
                          </button>
                          {selected && (
                            <a
                              className="icon-button"
                              title="Download selected image"
                              aria-label="Download selected image"
                              href={imageUrl(selected.assetId)}
                              download={`${selected.label}.jpg`}
                            >
                              <ArrowDownTrayIcon />
                            </a>
                          )}
                        </div>
                      </div>
                      {camera ? (
                        <div className="studio-camera">
                          <LiveRoomPreview
                            theme="Modern"
                            rawCapture
                            onCapture={async (url, name) =>
                              upload(
                                await (await fetch(url)).blob(),
                                "source",
                                name,
                              )
                            }
                          />
                        </div>
                      ) : selected ? (
                        <div className="room-stage">
                          <img
                            src={imageUrl(selected.assetId)}
                            alt={selected.label}
                          />
                          {compare && before && (
                            <>
                              <div
                                className="comparison-layer"
                                style={{
                                  clipPath: `inset(0 ${100 - wipe}% 0 0)`,
                                }}
                              >
                                <img
                                  src={imageUrl(before.assetId)}
                                  alt={`Comparison: ${before.label}`}
                                />
                              </div>
                              <span className="comparison-label left">
                                {before.label}
                              </span>
                              <span className="comparison-label right">
                                {selected.label}
                              </span>
                              <div
                                className="wipe-line"
                                style={{ left: `${wipe}%` }}
                              />
                              <input
                                className="wipe-input"
                                type="range"
                                min="0"
                                max="100"
                                value={wipe}
                                onChange={(e) =>
                                  setWipe(Number(e.target.value))
                                }
                                aria-label="Comparison position"
                              />
                            </>
                          )}
                          {!!jobId && (
                            <div className="generating">
                              <ArrowPathIcon className="spin" />
                              <strong>Design in progress</strong>
                              <span>You can keep this project open.</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="room-placeholder">
                          <PhotoIcon />
                          <h2>Add the room</h2>
                          <button
                            className="primary-button"
                            disabled={busy}
                            onClick={() => photoRef.current?.click()}
                          >
                            <PlusIcon />
                            Upload room photo
                          </button>
                          <button
                            className="text-button"
                            onClick={() => setCamera(true)}
                          >
                            Use camera
                          </button>
                        </div>
                      )}
                      <div className="image-caption">
                        <span>{selected?.label || "No image selected"}</span>
                        <span>
                          {selected?.kind === "concept"
                            ? "Design concept / verify on site"
                            : "Source photograph"}
                        </span>
                      </div>
                      {selected?.prompt && (
                        <p className="concept-instruction">{selected.prompt}</p>
                      )}
                      {compare && (
                        <label className="comparison-select">
                          Compare against
                          <select
                            value={before?.id || ""}
                            onChange={(e) => setCompareId(e.target.value)}
                          >
                            {project.versions
                              .filter((v) => v.id !== selected?.id)
                              .map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.label}
                                </option>
                              ))}
                          </select>
                        </label>
                      )}
                      <div className="version-heading">
                        <h2>Room history</h2>
                        <button
                          className="text-button"
                          disabled={busy || !!jobId}
                          onClick={() => conceptRef.current?.click()}
                        >
                          <PlusIcon />
                          Upload concept
                        </button>
                      </div>
                      <div className="version-strip">
                        {project.versions.map((version, index) => (
                          <button
                            key={version.id}
                            title={`${version.label}: ${new Date(version.createdAt).toLocaleString("en-IN")}`}
                            disabled={!!jobId}
                            className={`version-item ${selected?.id === version.id ? "active" : ""}`}
                            onClick={() =>
                              edit({ selectedVersionId: version.id })
                            }
                          >
                            <img
                              src={imageUrl(version.assetId)}
                              alt={version.label}
                            />
                            <span>{version.label}</span>
                            <small>
                              {version.kind === "source"
                                ? "Original"
                                : `Version ${index + 1}`}
                            </small>
                          </button>
                        ))}
                      </div>
                    </section>
                    <aside className="design-controls">
                      <div className="section-label">Design direction</div>
                      <h2>
                        Make room for
                        <br />
                        something better.
                      </h2>
                      <label>
                        Style
                        <select
                          value={style}
                          onChange={(e) => setStyle(e.target.value)}
                        >
                          {[
                            "Modern",
                            "Minimalist",
                            "Vintage",
                            "Tropical",
                            "Professional",
                            "Scandinavian",
                            "Contemporary Indian",
                          ].map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        What would you change?
                        <textarea
                          value={prompt}
                          onChange={(e) => setPrompt(e.target.value)}
                          maxLength={2000}
                          rows={5}
                          placeholder="Replace the sofa with a compact linen sectional and add a reading lamp."
                        />
                      </label>
                      <div className="retain-summary">
                        <span>Keep in the room</span>
                        <p>
                          {project.retain ||
                            "Room geometry, walls, windows, and doors"}
                        </p>
                        <button
                          className="text-button"
                          onClick={() => setTab("Brief")}
                        >
                          Edit brief
                          <ChevronRightIcon />
                        </button>
                      </div>
                      <button
                        className="primary-button generate-button"
                        disabled={
                          busy ||
                          !!jobId ||
                          !selected ||
                          !prompt.trim() ||
                          !providerReady
                        }
                        onClick={() =>
                          run(async () => {
                            if (dirty) await save();
                            const result = await api(
                              `/projects/${project.id}/generate`,
                              {
                                method: "POST",
                                body: JSON.stringify({
                                  baseId: selected!.id,
                                  prompt,
                                  style,
                                }),
                              },
                            );
                            setJobId(result.jobId);
                          })
                        }
                      >
                        <ArrowPathIcon className={jobId ? "spin" : ""} />
                        {jobId ? "Generating concept..." : "Generate concept"}
                      </button>
                      {!providerReady && (
                        <p className="service-note">
                          AI generation unavailable. You can upload a designer
                          concept.
                        </p>
                      )}
                      <div className="control-divider" />
                      <div className="section-label">Project budget</div>
                      <div className="control-budget">
                        {money(project.budget)}
                      </div>
                      <div className="budget-track">
                        <span
                          style={{
                            width: `${project.budget ? Math.min(100, (totals.total / project.budget) * 100) : 0}%`,
                          }}
                        />
                      </div>
                      <p
                        className={
                          totals.total > project.budget
                            ? "over-budget"
                            : "muted"
                        }
                      >
                        {money(Math.abs(project.budget - totals.total))}{" "}
                        {totals.total > project.budget
                          ? "over budget"
                          : "remaining"}
                      </p>
                      <button
                        className="text-button"
                        onClick={() => setTab("Budget")}
                      >
                        Open budget worksheet
                        <ChevronRightIcon />
                      </button>
                    </aside>
                  </div>
                )}
                {tab === "Budget" && (
                  <BudgetEditor project={project} edit={edit} />
                )}
                {tab === "Brief" && (
                  <section className="brief-layout">
                    <div className="form-panel">
                      <div className="section-label">Project details</div>
                      <h2>A clear starting point.</h2>
                      <label>
                        Project name
                        <input
                          value={project.name}
                          maxLength={150}
                          onChange={(e) => edit({ name: e.target.value })}
                        />
                      </label>
                      <div className="form-row">
                        <label>
                          Client
                          <input
                            value={project.client}
                            maxLength={150}
                            onChange={(e) => edit({ client: e.target.value })}
                          />
                        </label>
                        <label>
                          Budget (INR)
                          <input
                            type="number"
                            min="0"
                            max="100000000"
                            value={project.budget}
                            onChange={(e) =>
                              edit({ budget: Number(e.target.value) })
                            }
                          />
                        </label>
                      </div>
                      <label>
                        Client brief
                        <textarea
                          rows={4}
                          maxLength={2000}
                          value={project.brief}
                          onChange={(e) => edit({ brief: e.target.value })}
                        />
                      </label>
                      <label>
                        Existing items and finishes to retain
                        <textarea
                          rows={3}
                          maxLength={2000}
                          value={project.retain}
                          onChange={(e) => edit({ retain: e.target.value })}
                        />
                      </label>
                      <label>
                        Verified measurements and site notes
                        <textarea
                          rows={3}
                          maxLength={2000}
                          value={project.measurements}
                          onChange={(e) =>
                            edit({ measurements: e.target.value })
                          }
                        />
                      </label>
                    </div>
                    <aside className="brief-aside">
                      <PhotoIcon />
                      <h3>Living room</h3>
                      <p>
                        {
                          project.versions.filter((v) => v.kind === "source")
                            .length
                        }{" "}
                        source photographs
                      </p>
                      <button
                        className="secondary-button"
                        onClick={() => setTab("Design")}
                      >
                        Open room images
                        <ChevronRightIcon />
                      </button>
                      <div className="control-divider" />
                      <button
                        className="danger-button"
                        disabled={busy || !!jobId}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Delete ${project.name} and revoke its review links?`,
                            )
                          )
                            run(async () => {
                              await api(`/projects/${project.id}`, {
                                method: "DELETE",
                              });
                              setProject(null);
                              setDirty(false);
                              await load();
                            });
                        }}
                      >
                        <TrashIcon />
                        Delete project
                      </button>
                    </aside>
                  </section>
                )}
                {tab === "Reviews" && (
                  <section className="reviews-layout">
                    <div className="review-list">
                      <div className="section-label">Client decisions</div>
                      <h2>One proposal. A clear decision.</h2>
                      {sharedUrl && (
                        <div className="share-result">
                          <label>
                            Review link
                            <input
                              readOnly
                              value={sharedUrl}
                              onFocus={(e) => e.target.select()}
                            />
                          </label>
                          <button
                            className="secondary-button"
                            onClick={() =>
                              run(async () => {
                                await navigator.clipboard.writeText(sharedUrl);
                                setNotice("Review link copied.");
                              })
                            }
                          >
                            <DocumentDuplicateIcon />
                            Copy
                          </button>
                          <a
                            className="secondary-button"
                            href={sharedUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open
                            <ChevronRightIcon />
                          </a>
                        </div>
                      )}
                      {project.shares.length === 0 && (
                        <div className="inline-empty">
                          <LinkIcon />
                          <p>No proposal shared yet.</p>
                          <span>
                            Select a concept and add budget items to prepare a
                            client review.
                          </span>
                        </div>
                      )}
                      {project.shares
                        .slice()
                        .reverse()
                        .map((share) => (
                          <article key={share.id} className="review-record">
                            <div className="review-record-heading">
                              <div>
                                <strong>{share.snapshot.version.label}</strong>
                                <small>
                                  Revision {share.snapshot.revision} /{" "}
                                  <DateLabel value={share.snapshot.createdAt} />
                                </small>
                              </div>
                              <span
                                className={`review-status ${share.entries.some((e) => e.action === "approve") ? "approved" : ""}`}
                              >
                                {share.revoked
                                  ? "Revoked"
                                  : new Date(share.expiresAt).getTime() <
                                      Date.now()
                                    ? "Expired"
                                    : share.entries.some(
                                          (e) => e.action === "approve",
                                        )
                                      ? "Approved"
                                      : share.entries.some(
                                            (e) => e.action === "changes",
                                          )
                                        ? "Changes requested"
                                        : "Awaiting review"}
                              </span>
                            </div>
                            <p>
                              {money(
                                budgetTotals(
                                  share.snapshot.lines,
                                  share.snapshot.contingency,
                                ).total,
                              )}{" "}
                              / {share.snapshot.lines.length} budget items
                            </p>
                            {share.snapshot.revision !== project.revision && (
                              <small className="muted">
                                An earlier saved proposal. Current project is
                                revision {project.revision}.
                              </small>
                            )}
                            <div className="review-entries">
                              {share.entries.map((entry) => (
                                <div key={entry.id} className="review-entry">
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
                                </div>
                              ))}
                            </div>
                            {!share.revoked && (
                              <button
                                className="text-button danger"
                                disabled={busy}
                                onClick={() =>
                                  run(async () => {
                                    await api(
                                      `/projects/${project.id}/share/${share.id}`,
                                      { method: "DELETE" },
                                    );
                                    adopt(await api(`/projects/${project.id}`));
                                    setSharedUrl("");
                                  })
                                }
                              >
                                Revoke link
                              </button>
                            )}
                          </article>
                        ))}
                    </div>
                    <aside className="brief-aside">
                      <div className="section-label">Selected concept</div>
                      {selected && (
                        <img
                          className="review-thumb"
                          src={imageUrl(selected.assetId)}
                          alt={selected.label}
                        />
                      )}
                      <h3>{selected?.label || "Choose a concept"}</h3>
                      <p>Estimate {money(totals.total)}</p>
                      <p className="muted">
                        Each review preserves its image and budget. Links expire
                        after 7 days.
                      </p>
                      <button
                        className="secondary-button"
                        onClick={() =>
                          run(async () => {
                            if (dirty) await save();
                            adopt(await api(`/projects/${project.id}`));
                            setNotice("Reviews refreshed.");
                          })
                        }
                      >
                        <ArrowPathIcon />
                        Refresh reviews
                      </button>
                    </aside>
                  </section>
                )}
              </fieldset>
            </>
          )}
          <footer className="studio-footer">
            <span>roomGPT Studio</span>
            <span>Concepts to client decisions.</span>
          </footer>
        </main>
      </div>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-label="Upload room photo"
        ref={photoRef}
        onChange={(e) => {
          if (e.target.files?.[0]) upload(e.target.files[0], "source");
          e.target.value = "";
        }}
      />
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-label="Upload designer concept"
        ref={conceptRef}
        onChange={(e) => {
          if (e.target.files?.[0]) upload(e.target.files[0], "concept");
          e.target.value = "";
        }}
      />
      {newProject && (
        <Dialog
          open={newProject}
          onClose={() => {
            if (!busy) setNewProject(false);
          }}
          className="studio-shell studio-dialog"
        >
          <div className="modal-backdrop">
            <Dialog.Panel className="studio-modal">
              <div className="modal-heading">
                <Dialog.Title as="h2">New client project</Dialog.Title>
                <button
                  className="icon-button"
                  aria-label="Close new project"
                  disabled={busy}
                  onClick={() => setNewProject(false)}
                >
                  <XMarkIcon />
                </button>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  create(e.currentTarget);
                }}
              >
                <label>
                  Project name
                  <input
                    autoFocus
                    name="name"
                    required
                    maxLength={150}
                    placeholder="Indiranagar living room"
                  />
                </label>
                <label>
                  Client name
                  <input name="client" required maxLength={150} />
                </label>
                <label>
                  Room budget (INR)
                  <input
                    type="number"
                    min="0"
                    max="100000000"
                    name="budget"
                    defaultValue={150000}
                    required
                  />
                </label>
                <label>
                  Client brief
                  <textarea name="brief" rows={3} maxLength={2000} />
                </label>
                {error && (
                  <p role="alert" className="error-text">
                    {error}
                  </p>
                )}
                <button className="primary-button" disabled={busy}>
                  <PlusIcon />
                  {busy ? "Creating..." : "Create project"}
                </button>
              </form>
            </Dialog.Panel>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function AccountScreen({
  onSuccess,
  initialError,
}: {
  onSuccess: () => Promise<void>;
  initialError: string;
}) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  return (
    <main className="studio-shell account-screen">
      <div className="account-photo">
        <img
          src="/generated-pic-2.jpg"
          alt="A sample room design with natural furnishings"
        />
        <a className="studio-brand" href="/studio">
          <Squares2X2Icon />
          roomGPT <span>Studio</span>
        </a>
        <div className="account-photo-caption">
          A room, considered.<small>Sample design / roomGPT</small>
        </div>
      </div>
      <section className="account-form">
        <span className="eyebrow">Your design practice</span>
        <h1>{mode === "register" ? "Open your studio." : "Welcome back."}</h1>
        <div className="segmented">
          <button
            className={mode === "register" ? "active" : ""}
            onClick={() => {
              setMode("register");
              setError("");
            }}
          >
            Create account
          </button>
          <button
            className={mode === "login" ? "active" : ""}
            onClick={() => {
              setMode("login");
              setError("");
            }}
          >
            Sign in
          </button>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            try {
              await api("/auth", {
                method: "POST",
                body: JSON.stringify({
                  mode,
                  name: form.get("name"),
                  email: form.get("email"),
                  password: form.get("password"),
                }),
              });
              await onSuccess();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {mode === "register" && (
            <label>
              Studio name
              <input
                autoComplete="organization"
                name="name"
                maxLength={100}
                required
              />
            </label>
          )}
          <label>
            Email
            <input
              type="email"
              name="email"
              maxLength={254}
              autoComplete="email"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              aria-label="Password"
              name="password"
              minLength={10}
              maxLength={128}
              autoComplete={
                mode === "register" ? "new-password" : "current-password"
              }
              required
            />
            <small>At least 10 characters</small>
          </label>
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
          <button className="primary-button" disabled={busy}>
            {busy
              ? "Opening..."
              : mode === "register"
                ? "Create studio"
                : "Sign in"}
            <ChevronRightIcon />
          </button>
        </form>
        <a className="text-button" href="/dream">
          <ArrowLeftIcon />
          Classic room generator
        </a>
      </section>
    </main>
  );
}

function BudgetEditor({
  project,
  edit,
}: {
  project: PublicProject;
  edit: (value: Partial<PublicProject>) => void;
}) {
  const totals = budgetTotals(project.lines, project.contingency);
  const updateLine = (id: string, update: Partial<BudgetLine>) =>
    edit({
      lines: project.lines.map((line) =>
        line.id === id ? { ...line, ...update } : line,
      ),
    });
  function download() {
    const cell = (value: unknown) =>
      `"${String(value)
        .replace(/"/g, '""')
        .replace(/^\s*[=+@-]/, "'$&")}"`;
    const rows: unknown[][] = [
      [project.name, project.client],
      [
        "Item",
        "Category",
        "Quantity",
        "Unit price (INR)",
        "Total (INR)",
        "Supplier",
        "URL",
        "Status",
      ],
      ...project.lines.map((line) => [
        line.name,
        line.category,
        line.quantity,
        line.unitPrice,
        line.quantity * line.unitPrice,
        line.supplier,
        line.url,
        line.status,
      ]),
      ["Subtotal", totals.subtotal],
      [`Contingency (${project.contingency}%)`, totals.reserve],
      ["Total", totals.total],
      ["Room budget", project.budget],
    ];
    const url = URL.createObjectURL(
      new Blob(
        ["\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n")],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "room-budget.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section className="budget-view">
      <div className="section-heading">
        <div>
          <span className="section-label">Cost planning</span>
          <h2>Good design. Clear numbers.</h2>
        </div>
        <div className="heading-actions">
          <button className="secondary-button" onClick={download}>
            <ArrowDownTrayIcon />
            Export CSV
          </button>
          <button
            className="primary-button"
            onClick={() =>
              edit({
                lines: [
                  ...project.lines,
                  {
                    id: crypto.randomUUID(),
                    name: "New item",
                    category: "Furniture",
                    quantity: 1,
                    unitPrice: 0,
                    supplier: "",
                    url: "",
                    status: "estimate",
                  },
                ],
              })
            }
          >
            <PlusIcon />
            Add item
          </button>
        </div>
      </div>
      <div className="budget-table-wrap">
        <table className="budget-table">
          <thead>
            <tr>
              <th>Item / category</th>
              <th>Supplier / link</th>
              <th>Qty</th>
              <th>Unit price (INR)</th>
              <th>Total</th>
              <th>Price status</th>
              <th>
                <span className="sr-only">Delete</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {project.lines.map((line) => (
              <tr key={line.id}>
                <td>
                  <input
                    aria-label="Item name"
                    maxLength={200}
                    value={line.name}
                    onChange={(e) =>
                      updateLine(line.id, { name: e.target.value })
                    }
                  />
                  <select
                    aria-label="Item category"
                    value={line.category}
                    onChange={(e) =>
                      updateLine(line.id, { category: e.target.value })
                    }
                  >
                    {[
                      "Furniture",
                      "Lighting",
                      "Soft furnishings",
                      "Finishes",
                      "Services",
                      "Other",
                    ].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    aria-label="Supplier name"
                    maxLength={200}
                    value={line.supplier}
                    placeholder="Supplier name"
                    onChange={(e) =>
                      updateLine(line.id, { supplier: e.target.value })
                    }
                  />
                  <input
                    type="url"
                    aria-label="Supplier link"
                    maxLength={1000}
                    value={line.url}
                    placeholder="https://"
                    onChange={(e) =>
                      updateLine(line.id, { url: e.target.value })
                    }
                  />
                </td>
                <td>
                  <input
                    aria-label="Quantity"
                    type="number"
                    min="0"
                    max="10000"
                    step="0.1"
                    value={line.quantity}
                    onChange={(e) =>
                      updateLine(line.id, { quantity: Number(e.target.value) })
                    }
                  />
                </td>
                <td>
                  <input
                    aria-label="Unit price"
                    type="number"
                    min="0"
                    max="100000000"
                    step="0.01"
                    value={line.unitPrice}
                    onChange={(e) =>
                      updateLine(line.id, { unitPrice: Number(e.target.value) })
                    }
                  />
                </td>
                <td className="number-cell">
                  {money(line.quantity * line.unitPrice)}
                </td>
                <td>
                  <select
                    aria-label="Price status"
                    value={line.status}
                    onChange={(e) =>
                      updateLine(line.id, {
                        status: e.target.value as BudgetLine["status"],
                      })
                    }
                  >
                    <option value="estimate">Estimate</option>
                    <option value="quoted">Quoted</option>
                  </select>
                </td>
                <td>
                  <button
                    className="icon-button danger"
                    title={`Remove ${line.name}`}
                    aria-label={`Remove ${line.name}`}
                    onClick={() =>
                      edit({
                        lines: project.lines.filter(
                          (item) => item.id !== line.id,
                        ),
                      })
                    }
                  >
                    <TrashIcon />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!project.lines.length && (
          <div className="inline-empty">
            <p>No budget items yet.</p>
            <span>Add furniture, finishes, delivery, and installation.</span>
          </div>
        )}
      </div>
      <div className="budget-bottom">
        <div className="budget-guidance">
          <span className="section-label">Price confidence</span>
          <p>
            Quoted prices come from your suppliers. Estimates remain provisional
            until confirmed.
          </p>
          <p>
            Include delivery, installation, and applicable taxes as separate
            items.
          </p>
        </div>
        <dl className="budget-totals">
          <div>
            <dt>Subtotal</dt>
            <dd>{money(totals.subtotal)}</dd>
          </div>
          <div>
            <dt>
              <label>
                Contingency
                <input
                  aria-label="Contingency percent"
                  type="number"
                  min="0"
                  max="100"
                  value={project.contingency}
                  onChange={(e) =>
                    edit({ contingency: Number(e.target.value) })
                  }
                />
                %
              </label>
            </dt>
            <dd>{money(totals.reserve)}</dd>
          </div>
          <div className="grand-total">
            <dt>Project estimate</dt>
            <dd>{money(totals.total)}</dd>
          </div>
          <div className={totals.total > project.budget ? "over-budget" : ""}>
            <dt>
              {totals.total > project.budget
                ? "Over budget"
                : "Budget remaining"}
            </dt>
            <dd>{money(Math.abs(project.budget - totals.total))}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
