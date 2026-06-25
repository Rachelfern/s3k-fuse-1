import { cn } from "@/lib/utils";

interface S3KLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizes = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-12 text-base",
};

export function S3KLogo({ className, size = "md" }: S3KLogoProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-[var(--whatsapp-primary)] font-bold text-white shadow-md ring-2 ring-white/30",
        sizes[size],
        className
      )}
      aria-hidden
    >
      S3K
    </div>
  );
}
