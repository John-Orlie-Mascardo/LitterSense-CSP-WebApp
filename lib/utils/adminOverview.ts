import type { AdminUser } from "@/lib/data/mockData";
import type { AdminDeletionRequest } from "@/lib/utils/adminDeletionRequests";

export function summarizeAdminOverview(
  users: AdminUser[],
  requests: AdminDeletionRequest[],
) {
  const allCats = users.flatMap((user) => user.cats);
  return {
    totalUsers: users.length,
    activeUsers: users.filter((user) => user.status === "active").length,
    totalCats: allCats.length,
    maleCats: allCats.filter((cat) => cat.gender === "male").length,
    femaleCats: allCats.filter((cat) => cat.gender === "female").length,
    pendingDeletes: requests.filter((request) => request.status === "pending").length,
  };
}
