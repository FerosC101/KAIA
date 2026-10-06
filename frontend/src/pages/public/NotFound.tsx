import { Link } from "react-router";
import { KaiaMark } from "@/components/kaia/Logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-5 text-center">
      <div>
        <KaiaMark className="mx-auto size-12" />
        <h1 className="mt-6 text-2xl font-bold text-foreground">This page isn't part of the pathway</h1>
        <p className="mt-2 text-muted-foreground">The link may be outdated or you may not have access.</p>
        <Button asChild className="mt-6">
          <Link to="/">Back to KAIA</Link>
        </Button>
      </div>
    </div>
  );
}
