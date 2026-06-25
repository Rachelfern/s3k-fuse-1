import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { S3KLogo } from "@/components/brand/s3k-logo";
import { S3KWordmark } from "@/components/brand/s3k-wordmark";
import { Button } from "@/components/ui/button";
import { mockBusiness } from "@/lib/mock/business";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center overflow-x-hidden bg-gradient-to-b from-[var(--whatsapp-accent)]/10 via-background to-background px-4 py-8 sm:px-6">
      <div className="flex w-full max-w-md flex-col items-center gap-8 text-center">
        <S3KLogo size="lg" />

        <div className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight">
            <S3KWordmark className="text-3xl" />
          </h1>
          <p className="text-muted-foreground text-base leading-relaxed">
            Order food through a WhatsApp-style chat powered by AI.
          </p>
          <p className="text-sm text-[var(--whatsapp-accent)]/80">{mockBusiness.tagline}</p>
        </div>

        <Button
          asChild
          size="lg"
          className="h-12 w-full max-w-xs rounded-xl text-base font-semibold shadow-lg shadow-[var(--whatsapp-primary)]/20"
        >
          <Link href="/chat">
            <MessageCircle className="size-5" />
            Try demo chat
          </Link>
        </Button>

        <p className="text-muted-foreground text-xs">
          Demo with {mockBusiness.name} · mock data only
        </p>
      </div>
    </main>
  );
}
