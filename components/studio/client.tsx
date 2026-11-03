"use client";

export async function api(path = "", options: RequestInit = {}) {
  const response = await fetch(`/api/studio${path}`, {
    ...options,
    headers:
      options.body instanceof FormData
        ? options.headers
        : { "Content-Type": "application/json", ...options.headers },
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "The request failed.");
  return data;
}
export const imageUrl = (asset: string, review?: string) =>
  `/api/studio/media/${asset}${review ? `?review=${review}` : ""}`;
export function DateLabel({ value }: { value: string }) {
  return (
    <time dateTime={value}>
      {new Date(value).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      })}
    </time>
  );
}
