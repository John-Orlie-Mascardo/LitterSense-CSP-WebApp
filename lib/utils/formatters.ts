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

export function formatDateTime(dateStr: string, timeStr: string): string {
  const date = new Date(`${dateStr}T${timeStr}`);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatTimeAgo(dateStr: string, timeStr: string): string {
  const sessionDate = new Date(`${dateStr}T${timeStr}`);
  const now = new Date();
  const diffMs = now.getTime() - sessionDate.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hr ago`;
  if (diffDays === 1) return "Yesterday";
  return `${diffDays} days ago`;
}

export function getStatusColor(status: "healthy" | "watch" | "alert"): {
  bg: string;
  text: string;
  border: string;
  indicator: string;
} {
  switch (status) {
    case "healthy":
      return {
        bg: "bg-green-100",
        text: "text-green-700",
        border: "border-green-500",
        indicator: "bg-green-500",
      };
    case "watch":
      return {
        bg: "bg-amber-100",
        text: "text-amber-700",
        border: "border-amber-500",
        indicator: "bg-amber-500",
      };
    case "alert":
      return {
        bg: "bg-red-100",
        text: "text-red-700",
        border: "border-red-500",
        indicator: "bg-red-500",
      };
    default:
      return {
        bg: "bg-gray-100",
        text: "text-gray-700",
        border: "border-gray-500",
        indicator: "bg-gray-500",
      };
  }
}

export function getStatusLabel(status: "healthy" | "watch" | "alert"): string {
  switch (status) {
    case "healthy":
      return "Healthy";
    case "watch":
      return "Watch";
    case "alert":
      return "Alert — See vet";
    default:
      return "Unknown";
  }
}

export function getDeltaLabel(value: number): {
  color: string;
  label: string;
} {
  if (value < 10) {
    return { color: "bg-green-500", label: "Normal" };
  } else if (value < 20) {
    return { color: "bg-amber-500", label: "Elevated" };
  } else {
    return { color: "bg-red-500", label: "High" };
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
