import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { STORE_NAME } from "@/lib/brand";
import {
  PRIVACY_CONTACT_EMAIL,
  PRIVACY_CONTACT_PHONE,
  privacySections,
} from "@/lib/dpdp/privacy-content";

export const metadata = {
  title: `Privacy Policy — ${STORE_NAME}`,
  description: "How we collect, use, and protect your personal data.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--whatsapp-bg)]">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-black/5 bg-[#075e54] px-4 text-white safe-top">
        <Link
          href="/"
          className="rounded-full p-1.5 text-white/90 transition-colors hover:bg-white/10"
          aria-label="Back"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-base font-semibold">Privacy Policy</h1>
      </header>

      <main className="mx-auto max-w-2xl overflow-x-hidden px-4 py-8">
        <p className="text-sm leading-relaxed text-gray-600">
          {STORE_NAME} is committed to protecting your personal data in
          accordance with India&apos;s Digital Personal Data Protection Act
          (DPDP). This policy explains what we collect, why, and your rights.
        </p>

        <div className="mt-8 space-y-8">
          {privacySections.map((section) => (
            <section key={section.title}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[#075e54]">
                {section.title}
              </h2>
              <ul className="mt-3 space-y-2">
                {section.items.map((item) => (
                  <li
                    key={item}
                    className="flex gap-2 text-sm leading-relaxed text-gray-700"
                  >
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#128c7e]" />
                    <span className="min-w-0 break-words">{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="mt-10 rounded-xl border border-[#128c7e]/20 bg-white p-4 text-sm text-gray-600">
          <p className="font-medium text-gray-900">Questions about your data?</p>
          <p className="mt-1">
            Email{" "}
            <a
              href={`mailto:${PRIVACY_CONTACT_EMAIL}`}
              className="text-[#128c7e] underline-offset-2 hover:underline"
            >
              {PRIVACY_CONTACT_EMAIL}
            </a>{" "}
            or call {PRIVACY_CONTACT_PHONE}.
          </p>
          <Link
            href="/my-data"
            className="mt-3 inline-flex text-sm font-medium text-[#128c7e] hover:underline"
          >
            Manage My Data →
          </Link>
        </div>
      </main>
    </div>
  );
}
