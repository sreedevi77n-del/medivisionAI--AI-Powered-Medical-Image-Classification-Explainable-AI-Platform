import { getStore } from "@netlify/blobs";

const store = () => getStore("scan-images");

export async function saveImage(key: string, bytes: ArrayBuffer, contentType: string) {
  await store().set(key, bytes, { metadata: { contentType } });
}

export async function loadImage(key: string) {
  const res = await store().getWithMetadata(key, { type: "arrayBuffer" });
  if (!res) return null;
  return { bytes: res.data as ArrayBuffer, contentType: String(res.metadata?.contentType ?? "image/jpeg") };
}
