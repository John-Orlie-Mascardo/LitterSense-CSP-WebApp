import { mockCats } from "@/lib/mockData";
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
