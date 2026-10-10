import { useState } from "react";
import { Link } from "react-router";
import { KaiaLogo } from "@/components/kaia/Logo";
import { Button } from "@/components/ui/button";
import { ROLE_HOME, useAuth } from "@/lib/auth";

// Hotlinked for now; self-host under /public before launch so no third party sees visitors.
const HERO_PHOTO = "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=800&q=80";

/**
 * Mobile-first landing screen, built in layers:
 *   1. full-bleed lifestyle photo
 *   2. cream gradient fading from the top so the headline sits on solid cream
 *   3. a soft bottom gradient so the actions stay legible over the photo
 *   4. content: logo + headline at the top, actions anchored to the bottom
 */
export default function Landing() {
  const { user } = useAuth();
  const [photoFailed, setPhotoFailed] = useState(false);

  return (
    <main className="relative h-dvh min-h-[600px] w-full overflow-hidden bg-sunken">
      {/* 1 — photo, with a soft brand wash if it cannot load */}
      {photoFailed ? (
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(70%_55%_at_50%_75%,rgb(201_183_217/0.75),transparent_70%),radial-gradient(60%_45%_at_20%_95%,rgb(138_63_74/0.35),transparent_70%)]"
        />
      ) : (
        <img
          src={HERO_PHOTO}
          alt=""
          aria-hidden
          fetchPriority="high"
          onError={() => setPhotoFailed(true)}
          className="absolute inset-0 size-full object-cover object-[center_35%]"
        />
      )}

      {/* 2 — top cream fade: solid behind the text, clear by mid-screen so her face shows */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[62%] bg-gradient-to-b from-background from-35% via-background/70 via-55% to-transparent"
      />

      {/* 3 — subtle bottom fade for button legibility */}
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-[34%] bg-gradient-to-t from-background/90 via-background/45 to-transparent" />

      {/* 4 — content */}
      <div className="relative mx-auto flex h-full w-full max-w-md flex-col px-6 pb-safe pt-[max(2.5rem,env(safe-area-inset-top))]">
        <header className="flex flex-col items-center text-center">
          <KaiaLogo />
          <h1 className="mt-8 text-[38px] leading-[1.12] text-primary sm:text-[44px]">
            Screen earlier.
            <br />
            Understand better.
            <br />
            Reach care.
          </h1>
        </header>

        <div className="mt-auto flex flex-col gap-3 pb-4">
          <Button asChild size="lg" className="w-full">
            <Link to={user ? ROLE_HOME[user.role] : "/register"}>{user ? "Open KAIA" : "Get Started"}</Link>
          </Button>
          {!user && (
            <Button
              asChild
              size="lg"
              variant="outline"
              className="w-full border-primary bg-transparent text-primary hover:border-primary hover:bg-background/60"
            >
              <Link to="/login">Log In</Link>
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}
