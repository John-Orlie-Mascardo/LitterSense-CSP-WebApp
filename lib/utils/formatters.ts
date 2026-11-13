export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs.toString().padStart(2, "0")}s`;
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function getDeltaLabel(value: number): {
  color: string;
  label: string;
} {
  if (value < 10) {
    return { color: "bg-green-500", label: "Normal" };
  } else {
    return { color: "bg-red-500", label: "Abnormal" };
  }
}

export function getHealthLogTypeColor(type: string): {
  bg: string;
  text: string;
} {
  switch (type) {
    case "Vet Visit":
      return { bg: "bg-blue-100", text: "text-blue-700" };
    case "Medication":
      return { bg: "bg-purple-100", text: "text-purple-700" };
    case "Observation":
      return { bg: "bg-amber-100", text: "text-amber-700" };
    default:
      return { bg: "bg-gray-100", text: "text-gray-700" };
  }
}

export function calculateAge(dobString: string): string {
  // Expected format: "YYYY-MM" or "YYYY-MM-DD"
  const dob = new Date(dobString);
  const now = new Date();
  
  let years = now.getFullYear() - dob.getFullYear();
  const months = now.getMonth() - dob.getMonth();
  
  if (months < 0) {
    years--;
  }
  
  if (years < 1) {
    const totalMonths = months < 0 ? 12 + months : months;
    return `${totalMonths} mo`;
  }
  
  return `${years} yr${years > 1 ? "s" : ""}`;
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}
