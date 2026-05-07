export const PRACTICE_OPTIONS = [
    "Genel İşlemler",
    "Kurumsal",
    "Finans",
    "Dava",
    "Gayrimenkul",
    "Vergi",
    "İstihdam",
    "Fikri Mülkiyet",
    "Rekabet",
    "Teknoloji İşlemleri",
    "Proje Finansmanı",
    "EC/VC",
    "Özel Sermaye",
    "Özel Kredi",
    "ECM",
    "DCM",
    "Lev Fin",
    "Tahkim",
    "Diğer",
] as const;

export type Practice = (typeof PRACTICE_OPTIONS)[number];
