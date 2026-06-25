import { cn } from "@/lib/utils";

interface S3KWordmarkProps {
  className?: string;
}

export function S3KWordmark({ className }: S3KWordmarkProps) {
  return (
    <span className={cn("font-bold tracking-tight", className)}>
      S3K{" "}
      <span className="bg-gradient-to-r from-[var(--whatsapp-primary)] to-[var(--whatsapp-accent)] bg-clip-text text-transparent">
        Fuse
      </span>
    </span>
  );
}
