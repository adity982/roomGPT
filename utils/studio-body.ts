import { StudioError } from "./studio-store";

export async function limitedBytes(
  stream: ReadableStream<Uint8Array> | null,
  maximum: number,
) {
  if (!stream) return Buffer.alloc(0);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new StudioError("Request is too large.", 413);
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally {
    reader.releaseLock();
  }
}
