import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Vazirmatn } from "next/font/google";

import { routing, direction, type Locale } from "@/i18n/routing";
import { THEME_SCRIPT } from "@/components/theme-switch";
import "../globals.css";

/**
 * One face for both editions. Vazirmatn carries Latin as well as Arabic
 * script, so the Persian and English editions stay recognisably one
 * application. Only 400 and 500 are loaded and nothing goes heavier: Persian
 * letterforms carry a lot of ink already and 700 closes the counters up.
 */
const vazir = Vazirmatn({
  subsets: ["arabic", "latin"],
  weight: ["400", "500"],
  variable: "--font-vazir",
  display: "swap",
});

/**
 * The description was one English sentence for both editions, so the Persian
 * page described itself in English — to a search engine, and in the preview
 * card of every link anybody ever pasted. It is the one piece of text on the
 * page that nobody looking at the page can see, which is why it sat wrong for
 * so long. It comes from the messages now, like everything else.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const brand = await getTranslations({ locale, namespace: "brand" });
  return {
    // Both scripts, in both editions: it is the same application read by two
    // readers, and the title bar is where that is most obvious.
    title: "Shenava Session · شنوای جلسه",
    description: brand("description"),
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} dir={direction[locale as Locale]} className={vazir.variable} suppressHydrationWarning>
      <head>
        {/* Before the first paint, or the reader sees the wrong edition for a
            frame on every navigation. It only ever ADDS the attribute — the
            stylesheet already falls back to `prefers-color-scheme` when it is
            absent, which is what "system" means. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
