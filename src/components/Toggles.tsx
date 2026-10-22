"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { favoriteAction, followAction } from "@/app/actions/social";
import { Bookmark } from "./Icons";

/** Optimistic, but always settles on what the server says. Logged-out visitors go to the login first. */
export function SaveButton({
  type,
  id,
  saved,
  loggedIn,
  title,
  variant = "round",
}: {
  type: "service" | "portfolio";
  id: string;
  saved: boolean;
  loggedIn: boolean;
  title: string;
  variant?: "round" | "button";
}) {
  const [on, setOn] = useState(saved);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const router = useRouter();
  function toggle() {
    if (!loggedIn) return router.push(`/inloggen?next=${encodeURIComponent(location.pathname + location.search)}`);
    const next = !on;
    setOn(next);
    setError(undefined);
    start(async () => {
      const res = await favoriteAction(type, id, next);
      if (!res.ok) {
        setOn(!next);
        setError(res.error);
      } else setOn(res.data);
    });
  }
  const label = on ? `${title} niet meer bewaren` : `${title} bewaren`;
  return (
    <>
      {variant === "round" ? (
        <button
          type="button"
          className="save-btn"
          aria-pressed={on}
          aria-label={label}
          title={on ? "Bewaard" : "Bewaren"}
          onClick={toggle}
          disabled={pending}
        >
          <Bookmark filled={on} />
        </button>
      ) : (
        <button type="button" className="btn secondary" aria-pressed={on} onClick={toggle} disabled={pending}>
          <Bookmark filled={on} className="" />
          {on ? "Bewaard" : "Bewaren"}
        </button>
      )}
      {error && (
        <span role="alert" className="visually-hidden">
          {error}
        </span>
      )}
    </>
  );
}

export function FollowButton({
  userId,
  following,
  loggedIn,
  name,
}: {
  userId: string;
  following: boolean;
  loggedIn: boolean;
  name: string;
}) {
  const [on, setOn] = useState(following);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const router = useRouter();
  function toggle() {
    if (!loggedIn) return router.push(`/inloggen?next=${encodeURIComponent(location.pathname)}`);
    const next = !on;
    setOn(next);
    setError(undefined);
    start(async () => {
      const res = await followAction(userId, next);
      if (!res.ok) {
        setOn(!next);
        setError(res.error);
      } else {
        setOn(res.data);
        router.refresh();
      }
    });
  }
  return (
    <>
      <button
        type="button"
        className={`btn ${on ? "secondary" : "white"}`}
        aria-pressed={on}
        aria-label={on ? `${name} niet meer volgen` : `${name} volgen`}
        onClick={toggle}
        disabled={pending}
      >
        {on ? "Volgend" : "Volgen"}
      </button>
      {error && (
        <p role="alert" className="notice error small" style={{ width: "100%" }}>
          {error}
        </p>
      )}
    </>
  );
}
