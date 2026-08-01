import { LoadingSkeleton } from "@/components/states/LoadingSkeleton";

export default function Loading() {
  return (
    <div className="route-page">
      <LoadingSkeleton includeHeading label="Carregando área do aluno" variant="list" />
    </div>
  );
}
