import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, MessageSquareMore } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/resolvex/Button";
import { Card } from "@/components/resolvex/Card";

export const Route = createFileRoute("/clarification")({
  component: UnifiedClarificationRedirectPage,
});

function UnifiedClarificationRedirectPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void navigate({ to: "/" });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <Card className="space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-cyan-500/15 text-cyan-300">
          <MessageSquareMore className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold text-white">
          Clarification runs inside the ResolveX Chatbot
        </h1>
        <p className="text-sm text-slate-300">
          ResolveX handles questions, identity options, and follow-up clarifications in one
          unified chat thread on the home page.
        </p>
        <div className="pt-2">
          <Link to="/">
            <Button iconRight={<ArrowRight className="h-4 w-4" />}>
              Continue in Unified Chat
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
