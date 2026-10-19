"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { newProject } from "@/lib/projects/factory";
import { saveProject } from "@/lib/projects/store";

/** Creates an empty project in this browser and opens it. */
export default function NewProjectPage() {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const p = newProject();
    saveProject(p)
      .then(() => router.replace(`/project/${p.id}`))
      .catch(() => setError(true));
  }, [router]);

  return (
    <div className="container app-shell">
      <p className="muted" role="status">
        {error ? "Je browser staat lokaal opslaan niet toe. Probeer een gewoon (niet-privé) venster." : "Nieuw project maken…"}
      </p>
    </div>
  );
}
