"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/configs/firebase";
import type { AdminUser, AdminCat } from "@/lib/data/mockData";
import { generateId } from "@/lib/utils/formatters";
import type { ToastParams } from "@/components/ui/Toast";

// ─── Context Shape ─────────────────────────────────────────────────────────

interface AdminContextType {
  users: AdminUser[];
  isLoading: boolean;
  toasts: Omit<ToastParams, "onClose">[];
  addToast: (message: string, type?: ToastParams["type"]) => void;
  dismissToast: (id: string) => void;
  handleSuspend: (userId: string) => void;
}

const AdminContext = createContext<AdminContextType>({
  users: [],
  isLoading: true,
  toasts: [],
  addToast: () => {},
  dismissToast: () => {},
  handleSuspend: () => {},
});

export const useAdmin = () => useContext(AdminContext);

// ─── Provider ─────────────────────────────────────────────────────────────

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toasts, setToasts] = useState<Omit<ToastParams, "onClose">[]>([]);

  const addToast = useCallback(
    (message: string, type: ToastParams["type"] = "info") => {
      setToasts((prev) => [...prev, { id: generateId(), message, type }]);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleSuspend = useCallback((userId: string) => {
    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId
          ? {
              ...u,
              status:
                u.status === "active"
                  ? ("inactive" as const)
                  : ("active" as const),
            }
          : u
      )
    );
  }, []);

  useEffect(() => {
    async function fetchUsers() {
      try {
        setIsLoading(true);
        const usersSnapshot = await getDocs(collection(db, "users"));
        const loadedUsers: AdminUser[] = [];

        for (const userDoc of usersSnapshot.docs) {
          const userData = userDoc.data();

          // Fetch cats sub-collection
          const catsSnapshot = await getDocs(
            collection(db, "users", userDoc.id, "cats")
          );
          // Fetch catDetails sub-collection for gender info
          const catDetailsSnapshot = await getDocs(
            collection(db, "users", userDoc.id, "catDetails")
          );

          const catDetailsMap: Record<string, { gender?: string }> = {};
          catDetailsSnapshot.forEach((detailDoc) => {
            const detailData = detailDoc.data();
            catDetailsMap[detailDoc.id] = { gender: detailData.gender };
          });

          const cats: AdminCat[] = [];
          catsSnapshot.forEach((catDoc) => {
            const catData = catDoc.data();
            const details = catDetailsMap[catDoc.id];
            cats.push({
              name: catData.name || "Unnamed",
              gender: details?.gender === "female" ? "female" : "male",
            });
          });

          // Determine registration date
          let registeredDate = "";
          if (userData.createdAt) {
            const ts = userData.createdAt.toDate
              ? userData.createdAt.toDate()
              : new Date(userData.createdAt);
            registeredDate = ts.toISOString().split("T")[0];
          }

          loadedUsers.push({
            id: userDoc.id,
            name:
              userData.fullName ||
              userData.displayName ||
              userData.email?.split("@")[0] ||
              "Unknown User",
            email: userData.email || "No email",
            registeredDate,
            status: "active" as const,
            cats,
          });
        }

        setUsers(loadedUsers);
      } catch (error) {
        console.error("Failed to fetch users:", error);
        addToast("Failed to load users from database.", "error");
      } finally {
        setIsLoading(false);
      }
    }

    fetchUsers();
  }, [addToast]);

  return (
    <AdminContext.Provider
      value={{ users, isLoading, toasts, addToast, dismissToast, handleSuspend }}
    >
      {children}
    </AdminContext.Provider>
  );
}
