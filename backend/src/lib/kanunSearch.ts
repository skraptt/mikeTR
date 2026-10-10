import { createClient } from "@supabase/supabase-js";

export type KanunMaddesiMatch = {
  id: string;
  madde_no: string;
  icerik: string;
  embedding: number[] | null;
  created_at: string;
  similarity: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options?: {
    retries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    factor?: number;
  },
): Promise<T> {
  const retries = options?.retries ?? 3;
  const initialDelayMs = options?.initialDelayMs ?? 500;
  const maxDelayMs = options?.maxDelayMs ?? 5000;
  const factor = options?.factor ?? 2;

  let attempt = 0;
  let delay = initialDelayMs;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt += 1;
      if (attempt > retries) throw error;
      const jitter = Math.floor(Math.random() * delay * 0.2);
      const waitMs = Math.min(maxDelayMs, delay + jitter);
      await sleep(waitMs);
      delay = Math.min(maxDelayMs, delay * factor);
    }
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export async function createTextEmbedding(text: string): Promise<number[]> {
  const apiKey = requireEnv("OPENAI_API_KEY");

  const payload = await retryWithBackoff(async () => {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `OpenAI embedding request failed (${response.status}): ${detail}`,
      );
    }

    return (await response.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };
  }, { retries: 4, initialDelayMs: 500, maxDelayMs: 6000 });

  const embedding = payload.data?.[0]?.embedding;
  if (!embedding || embedding.length === 0) {
    throw new Error("OpenAI embedding response did not include an embedding vector");
  }

  return embedding;
}

export async function searchKanunMaddeleri(params: {
  query: string;
  limit: number;
  matchThreshold: number;
}): Promise<KanunMaddesiMatch[]> {
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SECRET_KEY");
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const embedding = await createTextEmbedding(params.query);
  return await retryWithBackoff(async () => {
    const { data, error } = await db.rpc("match_kanun_maddeleri", {
      query_embedding: embedding,
      match_count: params.limit,
      match_threshold: params.matchThreshold,
    });

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []) as KanunMaddesiMatch[];
  });
}