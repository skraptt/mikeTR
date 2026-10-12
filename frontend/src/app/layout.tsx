import type { Metadata } from "next";
// Self-hosted Inter and EB Garamond; sets --font-inter and --font-eb-garamond.
import "./fonts/fonts.css";
import "./globals.css";
import { Providers } from "@/app/components/providers";
import { DEFAULT_LOCALE } from "@/shared/i18n";

// mikeTR: the app's own name and description, in the interface language.
const TITLE =
    DEFAULT_LOCALE === "tr"
        ? "mikeTR – Türk hukuku için yapay zekâ asistanı"
        : "mikeTR – AI assistant for Turkish law";
const DESCRIPTION =
    DEFAULT_LOCALE === "tr"
        ? "Belge inceleme, taslak hazırlama ve Türk mevzuatında araştırma için açık kaynak yapay zekâ asistanı."
        : "Open-source AI assistant for document review, drafting and research in Turkish legislation.";

export const metadata: Metadata = {
    metadataBase: new URL("https://miketr.me"),
    title: TITLE,
    description: DESCRIPTION,
    icons: {
        icon: [
            { url: "/icon.svg", type: "image/svg+xml" },
            { url: "/favicon.ico" },
        ],
        apple: "/apple-touch-icon.png",
    },
    openGraph: {
        type: "website",
        url: "https://miketr.me",
        siteName: "mikeTR",
        title: TITLE,
        description: DESCRIPTION,
        images: [
            {
                url: "/link-image.jpg",
                width: 1200,
                height: 651,
                alt: "mikeTR",
            },
        ],
    },
    twitter: {
        card: "summary_large_image",
        title: TITLE,
        description: DESCRIPTION,
        images: ["/link-image.jpg"],
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang={DEFAULT_LOCALE}>
            <body
                className="font-sans antialiased"
            >
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
