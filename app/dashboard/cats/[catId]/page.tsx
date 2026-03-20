import { mockCats } from "@/lib/data/mockData";
import CatDetailClient from "./CatDetailClient";

// Generate static params for all cats
export function generateStaticParams() {
  return mockCats.map((cat) => ({
    catId: cat.id,
  }));
}

export default function CatDetailPage() {
  return <CatDetailClient />;
}
