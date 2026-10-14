// Messages the backend composes around a provider or model name, so they
// cannot be dictionary keys (backend/src/lib/llm/providerErrors.ts and
// apiKeyErrors.ts, lib/ictihat/client.ts). {1}, {2} stand for the captured names.
export const trPatterns: ReadonlyArray<readonly [RegExp, string]> = [
    [
        /^(.+) isn't available in the region this server runs in\. Select a model from another provider\.$/,
        "{1}, bu sunucunun bulunduğu bölgede kullanılamıyor. Başka bir sağlayıcının modelini seçin.",
    ],
    [
        /^(.+) rate limit or quota reached\. Wait a moment and try again, or select another model\.$/,
        "{1} kullanım sınırına ulaşıldı. Biraz bekleyip tekrar deneyin ya da başka bir model seçin.",
    ],
    [
        /^The (.+) plan doesn't include (.+)\. Select another model, or upgrade the .+ plan\.$/,
        "{1} planınız {2} modelini kapsamıyor. Başka bir model seçin ya da {1} planınızı yükseltin.",
    ],
    [
        /^The (.+) account is out of credits\. Top up, or select another model\.$/,
        "{1} hesabınızda kredi kalmadı. Kredi yükleyin ya da başka bir model seçin.",
    ],
    [
        /^(.+) isn't available with the (.+) API key\. Select another model\.$/,
        "{1} modeli bu {2} API anahtarıyla kullanılamıyor. Başka bir model seçin.",
    ],
    [
        /^(.+) stopped responding, so the request was ended\. Please try again, or select another model\.$/,
        "{1} cevap vermeyi bıraktı, bu yüzden istek sonlandırıldı. Tekrar deneyin ya da başka bir model seçin.",
    ],
    [
        /^The (.+) API key was rejected\. If you added your own key, check it in Settings → Bring Your Own Keys; otherwise contact your administrator\.$/,
        "{1} API anahtarı reddedildi. Kendi anahtarınızı eklediyseniz Ayarlar → Kendi anahtarlarınız bölümünden kontrol edin; eklemediyseniz yöneticinize başvurun.",
    ],
    [
        /^Dates must be YYYY-MM-DD: (.+)\.$/,
        "Tarihler YYYY-AA-GG biçiminde olmalı: {1}.",
    ],
    [
        /^Unknown Yargıtay chamber: (.+)\.$/,
        "Bilinmeyen Yargıtay dairesi: {1}.",
    ],
];
