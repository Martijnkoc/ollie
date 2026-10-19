import type { Metadata } from "next";
import { ProjectList } from "@/components/project/ProjectList";

export const metadata: Metadata = { title: "Mijn projecten", robots: { index: false } };

export default function ProjectsPage() {
  return <ProjectList />;
}
