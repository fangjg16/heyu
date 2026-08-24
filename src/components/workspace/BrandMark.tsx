import { cn } from "@/lib/utils";

export function BrandMark({
  className,
  alt = "合域",
}: {
  className?: string;
  alt?: string;
}) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}brand/heyu-mark.png`}
      alt={alt}
      className={cn("object-contain", className)}
    />
  );
}
