"use client";

import { useCallback, useState } from "react";
import { Loader2, Search, Scale, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { searchKanunMaddeleri } from "@/app/lib/mikeApi";
import type { KanunMaddesiSearchResult } from "../shared/types";

const DEFAULT_LIMIT = 5;
const DEFAULT_THRESHOLD = 0.5;

function formatSimilarity(score: number): string {
    return `${Math.round(Math.max(0, Math.min(score, 1)) * 100)}%`;
}

function excerpt(text: string, maxLength = 220): string {
    const cleaned = text.replace(/\s+/g, " ").trim();
    if (cleaned.length <= maxLength) return cleaned;
    return `${cleaned.slice(0, maxLength).trimEnd()}...`;
}

function ResultCard({ result }: { result: KanunMaddesiSearchResult }) {
    return (
        <article className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold text-gray-900">
                            Madde {result.madde_no}
                        </h3>
                        <Badge variant="secondary" className="bg-blue-50 text-blue-700 hover:bg-blue-100">
                            {formatSimilarity(result.similarity)} uyum
                        </Badge>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                        Eşleşme skoru: {result.similarity.toFixed(3)}
                    </p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-700">
                    <Scale className="h-4 w-4" />
                </div>
            </div>

            <p className="mt-3 text-sm leading-6 text-gray-700">
                {excerpt(result.icerik)}
            </p>
        </article>
    );
}

export function KanunSearchPanel() {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<KanunMaddesiSearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasSearched, setHasSearched] = useState(false);

    const handleSearch = useCallback(async () => {
        const trimmed = query.trim();
        if (!trimmed || isSearching) return;

        setIsSearching(true);
        setError(null);
        setHasSearched(true);

        try {
            const nextResults = await searchKanunMaddeleri({
                query: trimmed,
                limit: DEFAULT_LIMIT,
                matchThreshold: DEFAULT_THRESHOLD,
            });
            setResults(nextResults);
        } catch (err) {
            const message =
                err instanceof Error ? err.message : "Arama sırasında beklenmeyen bir hata oluştu.";
            setError(message);
            setResults([]);
        } finally {
            setIsSearching(false);
        }
    }, [query, isSearching]);

    return (
        <section className="mt-8 w-full max-w-4xl mx-auto">
            <div className="overflow-hidden rounded-[28px] border border-blue-100 bg-white/95 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
                <div className="border-b border-gray-100 bg-gradient-to-r from-blue-50 via-white to-white px-5 py-4 sm:px-6">
                    <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm shadow-blue-600/20">
                            <Sparkles className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-blue-700">
                                Kanun maddelerinde akıllı arama
                            </p>
                            <h2 className="mt-0.5 text-lg font-semibold text-gray-900 sm:text-xl">
                                Sorunu yaz, en alakalı maddeleri kartlar halinde gör.
                            </h2>
                            <p className="mt-1 text-sm leading-6 text-gray-600">
                                Sorununuz açık kaynak BGE-M3 modeliyle vektöre çevrilir ve Supabase’deki maddelerle benzerlik araması yapılır.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="p-5 sm:p-6">
                    <div className="flex flex-col gap-3 sm:flex-row">
                        <div className="relative flex-1">
                            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <Input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        void handleSearch();
                                    }
                                }}
                                placeholder="Örn. kira sözleşmesinde depozito iadesi, alacak temerrüdü, ayıplı mal..."
                                className="h-12 rounded-2xl border-gray-200 bg-white pl-11 text-sm shadow-sm focus-visible:border-blue-500 focus-visible:ring-blue-500/20"
                            />
                        </div>
                        <Button
                            type="button"
                            onClick={() => void handleSearch()}
                            disabled={isSearching || !query.trim()}
                            className="h-12 rounded-2xl bg-gradient-to-b from-blue-600 to-blue-700 px-5 text-white shadow-lg shadow-blue-600/20 hover:from-blue-700 hover:to-blue-800"
                        >
                            {isSearching ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Aranıyor
                                </>
                            ) : (
                                <>
                                    <Search className="h-4 w-4" />
                                    Ara
                                </>
                            )}
                        </Button>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                        <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50">
                            Limit: {DEFAULT_LIMIT}
                        </Badge>
                        <Badge variant="outline" className="border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-50">
                            Eşik: {DEFAULT_THRESHOLD}
                        </Badge>
                        <span>Enter ile arama yapabilirsiniz.</span>
                    </div>

                    {error && (
                        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {error}
                        </div>
                    )}

                    {hasSearched && !error && results.length === 0 && !isSearching && (
                        <div className="mt-6 rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
                            Eşleşen madde bulunamadı. Sorguyu biraz daha açıklayıcı hale getirmeyi deneyin.
                        </div>
                    )}

                    {results.length > 0 && (
                        <div className="mt-6 grid gap-3">
                            {results.map((result) => (
                                <ResultCard key={result.id} result={result} />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}