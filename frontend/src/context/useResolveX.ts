import { useContext } from "react";
import { ResolveXContext, type ResolveXContextValue } from "./resolveXContextDef";

export function useResolveX(): ResolveXContextValue {
  const ctx = useContext(ResolveXContext);
  if (!ctx) {
    throw new Error("useResolveX must be used within ResolveXProvider");
  }
  return ctx;
}
