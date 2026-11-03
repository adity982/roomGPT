import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { budgetTotals, money } from "../utils/studio-model";

let route: typeof import("../app/api/studio/[[...path]]/route");
let store: typeof import("../utils/studio-store");
let directory: string;
let projectId: string;
let baseId: string;
let providerStatus = "processing";
let outputUrl = "https://replicate.delivery/test/generated.jpg";
let webhookUrl = "";
let startRequests = 0;
const originalFetch = globalThis.fetch;
const session = "test-session-token";
const image = Buffer.from([255, 216, 255, 224, 1, 2, 3, 4]);

test("budgets preserve paise in totals and client-facing currency", () => {
  const totals = budgetTotals(
    [
      {
        id: "item",
        name: "Fabric",
        category: "Finishes",
        quantity: 2,
        unitPrice: 1234.56,
        supplier: "",
        url: "",
        status: "quoted",
      },
    ],
    10,
  );
  assert.deepEqual(totals, {
    subtotal: 2469.12,
    reserve: 246.91,
    total: 2716.03,
  });
  assert.match(money(totals.total), /2,716\.03/);
  assert.match(money(150000), /1,50,000$/);
});

before(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "room-studio-test-"));
  process.env.STUDIO_DATA_DIR = directory;
  process.env.REPLICATE_API_KEY = "fake-test-token";
  process.env.STUDIO_PUBLIC_URL = "https://studio.example.test";
  store = await import("../utils/studio-store");
  route = await import("../app/api/studio/[[...path]]/route");
  const assetId = await store.saveAsset(image, "jpg");
  projectId = "test-project";
  baseId = "test-source";
  await store.transaction((db) => {
    db.accounts.push({
      id: "owner",
      name: "Studio",
      email: "test@example.test",
      salt: "test",
      passwordHash: "test",
    });
    db.sessions.push({
      hash: store.hash(session),
      userId: "owner",
      expiresAt: Date.now() + 60000,
    });
    db.projects.push({
      id: projectId,
      ownerId: "owner",
      name: "Room",
      client: "Client",
      budget: 100000,
      brief: "Reading corner",
      retain: "Existing floor",
      measurements: "4m x 5m",
      contingency: 10,
      lines: [],
      versions: [
        {
          id: baseId,
          label: "Room",
          kind: "source",
          assetId,
          prompt: "",
          createdAt: new Date().toISOString(),
        },
      ],
      selectedVersionId: baseId,
      jobs: [],
      shares: [],
      revision: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (
      url.endsWith("/models/black-forest-labs/flux-kontext-pro/predictions")
    ) {
      startRequests++;
      const payload = JSON.parse(init!.body as string);
      assert.match(payload.input.prompt, /Existing floor/);
      assert.match(payload.input.input_image, /^data:image\/jpeg;base64,/);
      assert.deepEqual(payload.webhook_events_filter, ["completed"]);
      webhookUrl = payload.webhook;
      return Response.json({
        id: `prediction-${startRequests}`,
        status: "starting",
      });
    }
    if (url.startsWith("https://api.replicate.com/v1/predictions/"))
      return Response.json({ status: providerStatus, output: outputUrl });
    if (url === "https://replicate.delivery/test/generated.jpg")
      return new Response(image, { headers: { "Content-Type": "image/jpeg" } });
    throw new Error(`Unexpected network request: ${url}`);
  }) as typeof fetch;
});
after(async () => {
  globalThis.fetch = originalFetch;
  delete process.env.REPLICATE_API_KEY;
  delete process.env.STUDIO_PUBLIC_URL;
  delete process.env.STUDIO_DATA_DIR;
  await fs.rm(directory, { recursive: true, force: true });
});

async function request(
  parts: string[],
  method: "GET" | "POST" = "GET",
  data?: unknown,
  url?: string,
) {
  return route[method](
    new NextRequest(
      url || `http://localhost:3101/api/studio/${parts.join("/")}`,
      {
        method,
        headers: {
          cookie: `room-studio-session=${session}`,
          "content-type": "application/json",
        },
        ...(data ? { body: JSON.stringify(data) } : {}),
      },
    ),
    { params: Promise.resolve({ path: parts }) },
  );
}
async function generate() {
  const response = await request(["projects", projectId, "generate"], "POST", {
    baseId,
    prompt: "Replace the sofa",
    style: "Modern",
  });
  assert.equal(response.status, 202);
  return (await response.json()).jobId as string;
}

test("async generation persists private output exactly once through callback and polling", async () => {
  const jobId = await generate();
  const duplicate = await request(["projects", projectId, "generate"], "POST", {
    baseId,
    prompt: "Another",
    style: "Modern",
  });
  assert.equal(duplicate.status, 409);
  assert.equal(startRequests, 1);
  const processing = await (
    await request(["projects", projectId, "jobs", jobId])
  ).json();
  assert.equal(processing.job.status, "processing");
  assert.equal(processing.job.callbackHash, undefined);
  assert.equal(processing.project.jobs[0].callbackHash, undefined);
  const unauthorized = await request(
    ["completion", projectId, jobId],
    "POST",
    {},
    `https://studio.example.test/api/studio/completion/${projectId}/${jobId}?token=wrong`,
  );
  assert.equal(unauthorized.status, 404);
  providerStatus = "succeeded";
  assert.equal(
    (await request(["completion", projectId, jobId], "POST", {}, webhookUrl))
      .status,
    200,
  );
  assert.equal(
    (await request(["completion", projectId, jobId], "POST", {}, webhookUrl))
      .status,
    200,
  );
  const complete = await (
    await request(["projects", projectId, "jobs", jobId])
  ).json();
  assert.equal(complete.job.status, "succeeded");
  assert.equal(complete.project.versions.length, 2);
  const generated = complete.project.versions[1];
  assert.equal(generated.baseId, baseId);
  assert.equal(generated.prompt, "Replace the sofa");
  assert.deepEqual(await store.readAsset(generated.assetId), image);
});

test("provider failure and job expiry are terminal and do not add concepts", async () => {
  providerStatus = "failed";
  const jobId = await generate();
  const failed = await (
    await request(["projects", projectId, "jobs", jobId])
  ).json();
  assert.equal(failed.job.status, "failed");
  assert.equal(failed.project.versions.length, 2);
  const expiredId = await generate();
  await store.transaction((db) => {
    db.projects[0].jobs.find((j) => j.id === expiredId)!.createdAt = new Date(
      Date.now() - 11 * 60000,
    ).toISOString();
  });
  const expired = await (
    await request(["projects", projectId, "jobs", expiredId])
  ).json();
  assert.equal(expired.job.status, "failed");
  assert.match(expired.job.error, /timed out/);
});

test("unexpected provider output hosts are rejected", async () => {
  providerStatus = "succeeded";
  outputUrl = "https://attacker.example/image.jpg";
  const jobId = await generate();
  const response = await request(["projects", projectId, "jobs", jobId]);
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /Invalid provider/);
});

test("expired review links cannot read or approve a snapshot", async () => {
  const raw = store.token();
  await store.transaction((db) => {
    const project = db.projects[0];
    project.shares.push({
      id: "expired",
      tokenHash: store.hash(raw),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      revoked: false,
      entries: [],
      snapshot: {
        projectName: "Room",
        client: "Client",
        version: project.versions[1],
        lines: [],
        budget: 100000,
        contingency: 10,
        revision: 1,
        createdAt: new Date().toISOString(),
      },
    });
  });
  assert.equal((await request(["review", raw])).status, 404);
  assert.equal(
    (
      await request(["review", raw], "POST", {
        name: "Client",
        action: "approve",
      })
    ).status,
    404,
  );
});
