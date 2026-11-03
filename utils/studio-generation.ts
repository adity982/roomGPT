import { randomUUID } from "crypto";
import { RoomVersion } from "./studio-model";
import { limitedBytes } from "./studio-body";
import {
  imageExtension,
  ownProject,
  publicProject,
  readDatabase,
  saveAsset,
  StudioError,
  touch,
  transaction,
} from "./studio-store";

export async function provider(path: string, init: RequestInit = {}) {
  const key = process.env.REPLICATE_API_KEY;
  if (!key)
    throw new StudioError(
      "AI generation is not configured. Add REPLICATE_API_KEY on the server, or upload a concept.",
      503,
    );
  const response = await fetch(`https://api.replicate.com/v1/${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "Cancel-After": "5m",
      ...init.headers,
    },
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  if (!response.ok)
    throw new StudioError(
      response.status === 429
        ? "The image provider is busy. Try again shortly."
        : "The image provider could not process this request. Check your API token and credit balance.",
      502,
    );
  return response.json();
}

// Polling and completion callbacks share an idempotent persistence path.
export async function refreshGeneration(
  userId: string,
  projectId: string,
  jobId: string,
) {
  const project = ownProject(await readDatabase(), userId, projectId);
  const job = project.jobs.find((item) => item.id === jobId);
  if (!job) throw new StudioError("Generation not found.", 404);
  const result = () => ({
    job: publicProject(project).jobs.find((j) => j.id === jobId),
    project: publicProject(project),
  });
  if (["succeeded", "failed"].includes(job.status)) return result();
  if (Date.now() - new Date(job.createdAt).getTime() > 10 * 60000) {
    return transaction((store) => {
      const target = ownProject(store, userId, projectId);
      const current = target.jobs.find((j) => j.id === jobId)!;
      if (!["succeeded", "failed"].includes(current.status)) {
        current.status = "failed";
        current.error = "Generation timed out. Please try again.";
      }
      return {
        job: publicProject(target).jobs.find((j) => j.id === jobId),
        project: publicProject(target),
      };
    });
  }
  if (!job.predictionId) return result();
  const prediction = await provider(
    `predictions/${encodeURIComponent(job.predictionId)}`,
  );
  let assetId: string | undefined;
  if (prediction.status === "succeeded") {
    const output = Array.isArray(prediction.output)
      ? prediction.output[0]
      : prediction.output;
    if (typeof output !== "string")
      throw new StudioError("The provider returned no image.", 502);
    const url = new URL(output);
    if (
      url.protocol !== "https:" ||
      !(
        url.hostname === "replicate.delivery" ||
        url.hostname.endsWith(".replicate.delivery")
      )
    )
      throw new StudioError("Invalid provider image location.", 502);
    const image = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.REPLICATE_API_KEY}` },
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
    if (!image.ok)
      throw new StudioError(
        "Could not save the generated image. Try refreshing.",
        502,
      );
    if (Number(image.headers.get("content-length")) > 12 * 1024 * 1024)
      throw new StudioError("Generated image is too large.", 502);
    const bytes = await limitedBytes(image.body, 3 * 1024 * 1024);
    assetId = await saveAsset(bytes, imageExtension(bytes));
  }
  return transaction((store) => {
    const target = ownProject(store, userId, projectId);
    const current = target.jobs.find((j) => j.id === jobId)!;
    if (!["succeeded", "failed"].includes(current.status)) {
      if (assetId) {
        const version: RoomVersion = {
          id: randomUUID(),
          label: `Concept ${target.versions.filter((v) => v.kind === "concept").length + 1}`,
          kind: "concept",
          assetId,
          baseId: job.baseId,
          prompt: job.prompt,
          createdAt: new Date().toISOString(),
        };
        target.versions.push(version);
        target.selectedVersionId = version.id;
        current.status = "succeeded";
        touch(target);
      } else if (["failed", "canceled"].includes(prediction.status)) {
        current.status = "failed";
        current.error =
          "The image provider could not finish this design. Try a different instruction.";
      }
    }
    return {
      job: publicProject(target).jobs.find((j) => j.id === jobId),
      project: publicProject(target),
    };
  });
}
