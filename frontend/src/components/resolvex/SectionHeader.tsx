import type { ReactNode } from "react";
import { Badge } from "./Badge";

interface SectionHeaderProps {
  eyebrow?: string | undefined;
  title: string;
  description?: string | undefined;
  align?: "left" | "center" | undefined;
  actions?: ReactNode | undefined;
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  align = "left",
  actions,
}: SectionHeaderProps) {
  const isCenter = align === "center";

  return (
    <div
      className={`flex flex-col gap-3 ${
        isCenter
          ? "items-center text-center mx-auto max-w-2xl"
          : "sm:flex-row sm:items-end sm:justify-between"
      }`}
    >
      <div className={isCenter ? "space-y-2.5" : "space-y-2 max-w-2xl"}>
        {eyebrow && <Badge tone="violet">{eyebrow}</Badge>}
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">{title}</h2>
        {description && (
          <p className="text-sm sm:text-base leading-relaxed text-slate-400">{description}</p>
        )}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
