import { RequestFingerprint } from "@/types/fingerprint";

export async function ping() {
  return fetch("http://localhost:3001/analyze/ping", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hello: "world" }),
  }).then((r) => r.json());
}

export async function analyze(fingerprints: RequestFingerprint[], description: string) {
  return fetch("http://localhost:3001/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fingerprints, description }),
  }).then(r => r.json());
}

export async function initializeStream(sessionId: string, description: string) {
  const response = await fetch("http://localhost:3001/analyze/stream/init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, description }),
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : { success: true };
}

export async function sendChunk(sessionId: string, chunk: RequestFingerprint[]) {
  const response = await fetch("http://localhost:3001/analyze/stream/chunk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, chunk }),
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : { success: true };
}

export async function finalizeStream(sessionId: string) {
  const response = await fetch("http://localhost:3001/analyze/stream/finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const text = await response.text();
  if (!text) {
    throw new Error("Empty response from server");
  }
  return JSON.parse(text);
}

export async function cleanupStream(sessionId: string) {
  const response = await fetch(`http://localhost:3001/analyze/stream/${sessionId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : { success: true };
}

export async function generateCurl(entry: any) {
  const response = await fetch("http://localhost:3001/analyze/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entry }),
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const text = await response.text();
  if (!text) {
    throw new Error("Empty response from server");
  }
  return JSON.parse(text);
}
