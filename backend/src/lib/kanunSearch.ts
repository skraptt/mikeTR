import type { Db } from "./supabase";

export type KanunMaddesiMatch = {
  id: string;
  kanun_no: string;
  kanun_adi: string;
  madde_no: string;
  baslik: string | null;
  icerik: string;
  created_at: string;
  similarity: number;
};

class NonRetryableError extends Error {}

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
      if (attempt > retries || error instanceof NonRetryableError) throw error;
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

// Her sağlayıcı kendi sütununa ve arama fonksiyonuna yazar; sorgu vektörü ile
// kayıtlı vektörler aynı modelden gelmezse benzerlik skorları anlamsızlaşır.
export const EMBEDDING_PROVIDERS = {
  "bge-m3": {
    dimensions: 1024,
    column: "embedding_bge_m3",
    matchFunction: "match_kanun_maddeleri_bge_m3",
  },
  openai: {
    dimensions: 1536,
    column: "embedding",
    matchFunction: "match_kanun_maddeleri",
  },
} as const;

export type EmbeddingProvider = keyof typeof EMBEDDING_PROVIDERS;

export function getEmbeddingProvider(): EmbeddingProvider {
  const name = process.env.EMBEDDING_PROVIDER?.trim() || "bge-m3";
  if (!(name in EMBEDDING_PROVIDERS)) {
    throw new Error(
      `Unknown EMBEDDING_PROVIDER "${name}" (expected: ${Object.keys(EMBEDDING_PROVIDERS).join(", ")})`,
    );
  }
  return name as EmbeddingProvider;
}

async function postEmbeddingRequest(
  label: string,
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<unknown> {
  return await retryWithBackoff(async () => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      const message = `${label} embedding request failed (${response.status}): ${detail}`;
      // 429 ve 5xx geçici olabilir; diğer 4xx'ler (geçersiz anahtar, hatalı istek) tekrar denenmez.
      const retryable = response.status === 429 || response.status >= 500;
      throw retryable ? new Error(message) : new NonRetryableError(message);
    }

    return await response.json();
  }, { retries: 4, initialDelayMs: 500, maxDelayMs: 6000 });
}

export async function createTextEmbeddings(
  texts: string[],
  provider: EmbeddingProvider = getEmbeddingProvider(),
): Promise<number[][]> {
  let embeddings: number[][] | undefined;

  if (provider === "bge-m3") {
    const baseUrl = process.env.OLLAMA_URL?.trim() || "http://localhost:11434";
    const payload = (await postEmbeddingRequest("Ollama", `${baseUrl}/api/embed`, {
      model: "bge-m3",
      input: texts,
    })) as { embeddings?: number[][] };
    embeddings = payload.embeddings;
  } else {
    const payload = (await postEmbeddingRequest(
      "OpenAI",
      "https://api.openai.com/v1/embeddings",
      { model: "text-embedding-3-small", input: texts },
      { Authorization: `Bearer ${requireEnv("OPENAI_API_KEY")}` },
    )) as { data?: Array<{ embedding?: number[] }> };
    embeddings = payload.data?.map((d) => d.embedding ?? []);
  }

  if (!embeddings || embeddings.length !== texts.length) {
    throw new Error(`${provider} response did not include ${texts.length} embedding vector(s)`);
  }
  const expected = EMBEDDING_PROVIDERS[provider].dimensions;
  for (const embedding of embeddings) {
    if (embedding.length !== expected) {
      throw new Error(
        `${provider} embedding has ${embedding.length} dimensions; expected ${expected}`,
      );
    }
  }

  return embeddings;
}

export async function searchKanunMaddeleri(
  db: Db,
  params: {
    query: string;
    limit: number;
    matchThreshold: number;
  },
): Promise<KanunMaddesiMatch[]> {
  const provider = getEmbeddingProvider();
  const [embedding] = await createTextEmbeddings([params.query], provider);
  return await retryWithBackoff(async () => {
    const { data, error } = await db.rpc(EMBEDDING_PROVIDERS[provider].matchFunction, {
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
