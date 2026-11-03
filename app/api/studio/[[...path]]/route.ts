import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import {
  BudgetLine,
  RoomVersion,
  Share,
  StudioProject,
} from "../../../../utils/studio-model";
import {
  accountForSession,
  hash,
  imageExtension,
  ownProject,
  passwordDigest,
  publicProject,
  rateLimit,
  readAsset,
  readDatabase,
  saveAsset,
  StudioError,
  token,
  touch,
  transaction,
  validPassword,
} from "../../../../utils/studio-store";
import {
  provider,
  refreshGeneration,
} from "../../../../utils/studio-generation";
import { limitedBytes } from "../../../../utils/studio-body";
import { studioPublicOrigin } from "../../../../utils/studio-config";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
const sessionName = "room-studio-session";
const maxImage = 3 * 1024 * 1024;
const json = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
const now = () => new Date().toISOString();

function text(value: unknown, label: string, max = 2000, required = false) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    throw new StudioError(`Enter a valid ${label}.`);
  return value.trim();
}
function number(value: unknown, label: string, maximum = 100000000) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > maximum
  )
    throw new StudioError(`Enter a valid ${label}.`);
  return value;
}
async function body(req: NextRequest) {
  const raw = (await limitedBytes(req.body, 100000)).toString("utf8");
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error();
    return data;
  } catch {
    throw new StudioError("Invalid request.");
  }
}
function budgetLines(value: unknown): BudgetLine[] {
  if (!Array.isArray(value) || value.length > 100)
    throw new StudioError("Use up to 100 budget items.");
  return value.map((line) => {
    if (!line || typeof line !== "object")
      throw new StudioError("Invalid budget item.");
    const url = text(line.url, "supplier link", 1000);
    if (url) {
      try {
        if (!["https:", "http:"].includes(new URL(url).protocol))
          throw new Error();
      } catch {
        throw new StudioError("Supplier links must use http or https.");
      }
    }
    if (!["estimate", "quoted"].includes(line.status))
      throw new StudioError("Invalid quote status.");
    return {
      id: text(line.id, "item ID", 100, true),
      name: text(line.name, "item name", 200, true),
      category: text(line.category, "category", 100),
      quantity: number(line.quantity, "quantity", 10000),
      unitPrice: number(line.unitPrice, "price"),
      supplier: text(line.supplier, "supplier", 200),
      url,
      status: line.status,
    };
  });
}
function activeShare(projects: StudioProject[], raw: string) {
  if (!/^[a-f0-9]{64}$/.test(raw))
    throw new StudioError("Review link not found or expired.", 404);
  for (const project of projects) {
    const share = project.shares.find(
      (item) =>
        item.tokenHash === hash(raw) &&
        !item.revoked &&
        new Date(item.expiresAt).getTime() > Date.now(),
    );
    if (share) return { project, share };
  }
  throw new StudioError("Review link not found or expired.", 404);
}

async function dispatch(req: NextRequest, parts: string[]) {
  const [resource, id, action, itemId] = parts;
  const method = req.method;
  if (!["GET", "HEAD"].includes(method)) {
    const origin = req.headers.get("origin");
    if (origin && origin !== new URL(req.url).origin)
      throw new StudioError("Request origin is not allowed.", 403);
  }
  const rawSession = req.cookies.get(sessionName)?.value;

  if (resource === "completion" && method === "POST") {
    const store = await readDatabase();
    const project = store.projects.find((p) => p.id === id);
    const job = project?.jobs.find((j) => j.id === action);
    const secret = req.nextUrl.searchParams.get("token") || "";
    if (!project || !job?.callbackHash || job.callbackHash !== hash(secret))
      throw new StudioError("Callback not found.", 404);
    // Fetch the authoritative prediction; never trust callback output or URLs.
    if (!job.predictionId)
      throw new StudioError("Generation is starting. Retry the callback.", 503);
    await refreshGeneration(project.ownerId, project.id, job.id);
    return json({ ok: true });
  }

  if (resource === "auth") {
    if (method === "DELETE") {
      await transaction((db) => {
        db.sessions = db.sessions.filter(
          (item) => item.hash !== hash(rawSession || ""),
        );
      });
      const response = json({ ok: true });
      response.cookies.delete(sessionName);
      return response;
    }
    if (method !== "POST") throw new StudioError("Method not allowed.", 405);
    const input = await body(req);
    const email = text(input.email, "email", 254, true).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new StudioError("Enter a valid email address.");
    const password = input.password;
    if (
      typeof password !== "string" ||
      password.length < 10 ||
      password.length > 128
    )
      throw new StudioError("Use a password between 10 and 128 characters.");
    if (!["register", "login"].includes(input.mode))
      throw new StudioError("Invalid account action.");
    await transaction((db) => rateLimit(db, `auth:${email}`, 12, 15 * 60000));
    const salt = token();
    const digest =
      input.mode === "register" ? await passwordDigest(password, salt) : "";
    const raw = token();
    const user = await transaction(async (db) => {
      let account = db.accounts.find((item) => item.email === email);
      if (input.mode === "register") {
        if (account)
          throw new StudioError(
            "An account already exists for this email. Sign in instead.",
            409,
          );
        account = {
          id: randomUUID(),
          name: text(input.name, "studio name", 100, true),
          email,
          salt,
          passwordHash: digest,
        };
        db.accounts.push(account);
      } else if (!(await validPassword(password, account)))
        throw new StudioError("Email or password is incorrect.", 401);
      if (!account) throw new StudioError("Unable to sign in.", 401);
      db.sessions = db.sessions.filter((item) => item.expiresAt > Date.now());
      db.sessions.push({
        hash: hash(raw),
        userId: account.id,
        expiresAt: Date.now() + 7 * 86400000,
      });
      return { id: account.id, name: account.name, email: account.email };
    });
    const response = json({ user });
    response.cookies.set(sessionName, raw, {
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(req.url).protocol === "https:",
      path: "/",
      maxAge: 7 * 86400,
    });
    return response;
  }

  if (resource === "review") {
    if (method === "GET") {
      const { share } = activeShare((await readDatabase()).projects, id);
      return json({
        snapshot: share.snapshot,
        entries: share.entries,
        expiresAt: share.expiresAt,
      });
    }
    if (method === "POST") {
      const input = await body(req);
      return json(
        await transaction((db) => {
          const { share, project } = activeShare(db.projects, id);
          rateLimit(db, `review:${share.id}`, 30, 3600000);
          if (!["comment", "changes", "approve"].includes(input.action))
            throw new StudioError("Invalid review action.");
          if (
            share.entries.some((entry) => entry.action === "approve") &&
            input.action !== "comment"
          )
            throw new StudioError(
              "This proposal is already approved. Ask the studio for a new proposal.",
              409,
            );
          const entry = {
            id: randomUUID(),
            name: text(input.name, "your name", 100, true),
            message: text(
              input.message || "",
              "comment",
              2000,
              input.action !== "approve",
            ),
            action: input.action as "comment" | "changes" | "approve",
            createdAt: now(),
          };
          share.entries.push(entry);
          project.updatedAt = now();
          return {
            snapshot: share.snapshot,
            entries: share.entries,
            expiresAt: share.expiresAt,
          };
        }),
      );
    }
    throw new StudioError("Method not allowed.", 405);
  }

  const db = await readDatabase();
  const account = accountForSession(db, rawSession);
  if (resource === "media" && method === "GET") {
    const rawReview = req.nextUrl.searchParams.get("review");
    let allowed = false;
    if (rawReview)
      allowed =
        activeShare(db.projects, rawReview).share.snapshot.version.assetId ===
        id;
    else if (account)
      allowed = db.projects.some(
        (project) =>
          project.ownerId === account.id &&
          project.versions.some((version) => version.assetId === id),
      );
    if (!allowed) throw new StudioError("Image not found.", 404);
    const bytes = await readAsset(id);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": id.endsWith("jpg")
          ? "image/jpeg"
          : id.endsWith("png")
            ? "image/png"
            : "image/webp",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  if (!resource && method === "GET")
    return json({
      user: account
        ? { id: account.id, email: account.email, name: account.name }
        : null,
      projects: account
        ? db.projects
            .filter((project) => project.ownerId === account.id)
            .map(publicProject)
        : [],
      providerReady: !!process.env.REPLICATE_API_KEY,
    });
  if (!account) throw new StudioError("Please sign in to your studio.", 401);
  const userId = account.id;

  if (resource === "projects" && !id && method === "POST") {
    const input = await body(req);
    const project: StudioProject = {
      id: randomUUID(),
      ownerId: userId,
      name: text(input.name, "project name", 150, true),
      client: text(input.client, "client name", 150, true),
      budget: number(input.budget, "room budget"),
      brief: text(input.brief || "", "brief"),
      retain: text(input.retain || "", "items to retain"),
      measurements: text(input.measurements || "", "measurements"),
      lines: [],
      contingency: 10,
      versions: [],
      selectedVersionId: "",
      jobs: [],
      shares: [],
      revision: 1,
      createdAt: now(),
      updatedAt: now(),
    };
    await transaction((store) => {
      if (store.projects.filter((p) => p.ownerId === userId).length >= 100)
        throw new StudioError("This studio has reached its 100 project limit.");
      store.projects.push(project);
    });
    return json(publicProject(project), 201);
  }
  if (resource !== "projects" || !id) throw new StudioError("Not found.", 404);
  const project = ownProject(db, userId, id);
  if (!action && method === "GET") return json(publicProject(project));
  if (!action && method === "DELETE") {
    await transaction((store) => {
      ownProject(store, userId, id);
      store.projects = store.projects.filter((p) => p.id !== id);
    });
    return json({ ok: true });
  }
  if (!action && method === "PATCH") {
    const input = await body(req);
    return json(
      await transaction((store) => {
        const target = ownProject(store, userId, id);
        if (input.revision !== target.revision)
          throw new StudioError(
            "This project changed in another tab. Refresh before saving.",
            409,
          );
        target.name = text(input.name, "project name", 150, true);
        target.client = text(input.client, "client name", 150, true);
        target.budget = number(input.budget, "budget");
        target.brief = text(input.brief, "brief");
        target.retain = text(input.retain, "items to retain");
        target.measurements = text(input.measurements, "measurements");
        target.lines = budgetLines(input.lines);
        target.contingency = number(input.contingency, "contingency", 100);
        if (
          input.selectedVersionId &&
          !target.versions.some((v) => v.id === input.selectedVersionId)
        )
          throw new StudioError("Select a valid version.");
        target.selectedVersionId = input.selectedVersionId || "";
        touch(target);
        return publicProject(target);
      }),
    );
  }
  if (action === "assets" && method === "POST") {
    const bytesIn = await limitedBytes(req.body, maxImage + 65536);
    const form = await new Response(new Uint8Array(bytesIn), {
      headers: { "content-type": req.headers.get("content-type") || "" },
    }).formData();
    const file = form.get("file");
    if (!file || typeof file === "string" || !file.size || file.size > maxImage)
      throw new StudioError("Choose an image smaller than 3 MB.");
    const bytes = Buffer.from(await file.arrayBuffer());
    const extension = imageExtension(bytes);
    const assetId = await saveAsset(bytes, extension);
    const kind = form.get("kind") === "concept" ? "concept" : "source";
    const label = text(
      form.get("label") ||
        (kind === "source" ? "Room photo" : "Uploaded concept"),
      "version name",
      100,
      true,
    );
    return json(
      await transaction((store) => {
        const target = ownProject(store, userId, id);
        if (target.versions.length >= 100)
          throw new StudioError("This project has reached its image limit.");
        const version: RoomVersion = {
          id: randomUUID(),
          label,
          kind,
          assetId,
          prompt: "",
          createdAt: now(),
        };
        target.versions.push(version);
        target.selectedVersionId = version.id;
        touch(target);
        return publicProject(target);
      }),
      201,
    );
  }
  if (action === "generate" && method === "POST") {
    if (!process.env.REPLICATE_API_KEY)
      throw new StudioError(
        "AI generation is not configured. Add REPLICATE_API_KEY on the server, or upload a concept.",
        503,
      );
    const input = await body(req);
    const base = project.versions.find(
      (version) => version.id === input.baseId,
    );
    if (!base) throw new StudioError("Choose a source photo or concept first.");
    const instruction = text(input.prompt, "design instruction", 2000, true);
    const style = text(input.style, "style", 80, true);
    const prompt = `Edit this real living room photo. ${instruction}. Style: ${style}. Client brief: ${project.brief}. Preserve these existing elements: ${project.retain || "walls, windows, doors and room geometry"}. Keep camera perspective, room dimensions, walls, windows and doors unchanged. Only change the requested furnishings and finishes. Photorealistic interior design concept, no text or watermarks. Budget context: INR ${project.budget}; this is a concept, not a measured construction plan.`;
    const jobId = randomUUID();
    const callbackToken = token();
    const callbackOrigin = studioPublicOrigin();
    if (callbackOrigin && new URL(callbackOrigin).protocol !== "https:")
      throw new StudioError("STUDIO_PUBLIC_URL must use HTTPS.", 503);
    await transaction((store) => {
      const target = ownProject(store, userId, id);
      target.jobs.forEach((job) => {
        if (
          ["starting", "processing"].includes(job.status) &&
          Date.now() - new Date(job.createdAt).getTime() > 10 * 60000
        ) {
          job.status = "failed";
          job.error = "Generation timed out.";
        }
      });
      if (
        target.jobs.some((job) =>
          ["starting", "processing"].includes(job.status),
        )
      )
        throw new StudioError(
          "A design is already generating for this project.",
          409,
        );
      rateLimit(store, `generate:${userId}`, 30, 86400000);
      if (target.versions.length >= 100)
        throw new StudioError("This project has reached its image limit.");
      target.jobs.push({
        id: jobId,
        baseId: base.id,
        prompt: instruction,
        callbackHash: hash(callbackToken),
        status: "starting",
        createdAt: now(),
      });
    });
    try {
      const bytes = await readAsset(base.assetId);
      const mime = base.assetId.endsWith("jpg")
        ? "jpeg"
        : base.assetId.split(".").pop();
      const prediction = await provider(
        "models/black-forest-labs/flux-kontext-pro/predictions",
        {
          method: "POST",
          body: JSON.stringify({
            input: {
              prompt,
              input_image: `data:image/${mime};base64,${bytes.toString("base64")}`,
              output_format: "jpg",
            },
            ...(callbackOrigin
              ? {
                  webhook: `${new URL(callbackOrigin).origin}/api/studio/completion/${id}/${jobId}?token=${callbackToken}`,
                  webhook_events_filter: ["completed"],
                }
              : {}),
          }),
        },
      );
      if (typeof prediction.id !== "string")
        throw new StudioError(
          "The provider returned an invalid generation job.",
          502,
        );
      await transaction((store) => {
        const job = ownProject(store, userId, id).jobs.find(
          (j) => j.id === jobId,
        )!;
        job.predictionId = prediction.id;
        job.status = "processing";
      });
      return json({ jobId }, 202);
    } catch (error) {
      await transaction((store) => {
        const job = ownProject(store, userId, id).jobs.find(
          (j) => j.id === jobId,
        )!;
        job.status = "failed";
        job.error =
          error instanceof Error ? error.message : "Generation failed.";
      });
      throw error;
    }
  }
  if (action === "jobs" && itemId && method === "GET") {
    return json(await refreshGeneration(userId, id, itemId));
  }
  if (action === "share" && method === "POST") {
    const input = await body(req);
    const raw = token();
    const share = await transaction((store) => {
      const target = ownProject(store, userId, id);
      if (input.revision !== target.revision)
        throw new StudioError(
          "Save or refresh the project before creating a review link.",
          409,
        );
      const version = target.versions.find(
        (v) => v.id === target.selectedVersionId,
      );
      if (!version || version.kind !== "concept")
        throw new StudioError("Select a concept before sending a proposal.");
      if (!target.lines.length)
        throw new StudioError(
          "Add at least one budget item before sending a proposal.",
        );
      if (
        target.shares.filter(
          (s) => !s.revoked && new Date(s.expiresAt).getTime() > Date.now(),
        ).length >= 20
      )
        throw new StudioError(
          "Revoke an existing review link before creating another.",
        );
      const result: Share = {
        id: randomUUID(),
        tokenHash: hash(raw),
        expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        revoked: false,
        snapshot: {
          projectName: target.name,
          client: target.client,
          version,
          lines: structuredClone(target.lines),
          budget: target.budget,
          contingency: target.contingency,
          revision: target.revision,
          createdAt: now(),
        },
        entries: [],
      };
      target.shares.push(result);
      return result;
    });
    return json(
      {
        url: `${new URL(req.url).origin}/review/${raw}`,
        shareId: share.id,
        expiresAt: share.expiresAt,
      },
      201,
    );
  }
  if (action === "share" && itemId && method === "DELETE") {
    await transaction((store) => {
      const share = ownProject(store, userId, id).shares.find(
        (s) => s.id === itemId,
      );
      if (!share) throw new StudioError("Review not found.", 404);
      share.revoked = true;
    });
    return json({ ok: true });
  }
  throw new StudioError("Not found.", 404);
}

async function handler(
  req: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
) {
  try {
    return await dispatch(req, (await context.params).path || []);
  } catch (error) {
    if (error instanceof StudioError)
      return json({ error: error.message }, error.status);
    console.error(
      "Studio request failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    return json(
      { error: "The request could not be completed. Please try again." },
      500,
    );
  }
}
export { handler as GET, handler as POST, handler as PATCH, handler as DELETE };
