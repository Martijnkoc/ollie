"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { openInviteAction } from "@/app/actions/invites";

/** Moves the token from the URL fragment into an httpOnly cookie, then removes it from the address bar. */
export function InviteOpener({ hasInvite }: { hasInvite: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "opening" | "invalid">("idle");
  useEffect(() => {
    const token = window.location.hash.slice(1);
    if (!token) return;
    setState("opening");
    history.replaceState(null, "", window.location.pathname);
    openInviteAction(token).then((res) => {
      if (res.ok) router.refresh();
      else setState("invalid");
    });
  }, [router]);
  if (state === "opening") return <p role="status">Uitnodiging openen…</p>;
  if (state === "invalid")
    return (
      <p className="notice error" role="alert">
        Deze uitnodigingslink klopt niet. Controleer of je de hele link hebt gekopieerd.
      </p>
    );
  if (!hasInvite)
    return (
      <p className="notice" role="status">
        Open de uitnodigingslink die je hebt ontvangen. Deze pagina werkt alleen via die link.
      </p>
    );
  return null;
}
