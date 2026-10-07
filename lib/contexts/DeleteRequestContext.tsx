"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/configs/firebase";
import { useAuth } from "@/lib/contexts/AuthContext";
import {
  readAdminDeletionRequest,
  runAdminDeletionAction,
  type AdminDeletionRequest,
} from "@/lib/utils/adminDeletionRequests";

interface DeleteRequestContextType {
  requests: AdminDeletionRequest[];
  isLoading: boolean;
  approveRequest: (userId: string) => Promise<void>;
  rejectRequest: (userId: string) => Promise<void>;
}

const DeleteRequestContext = createContext<DeleteRequestContextType>({
  requests: [],
  isLoading: false,
  approveRequest: async () => {},
  rejectRequest: async () => {},
});

export const useDeleteRequest = () => useContext(DeleteRequestContext);

const statusRank = { pending: 0, failed: 1, processing: 2 } as const;

export function DeleteRequestProvider({ children }: { children: ReactNode }) {
  const { user, isAdmin } = useAuth();
  const [queueState, setQueueState] = useState<{
    adminUid: string | null;
    requests: AdminDeletionRequest[];
  }>({ adminUid: null, requests: [] });

  useEffect(() => {
    if (!user || !isAdmin) {
      return;
    }

    const activeRequests = query(
      collection(db, "users"),
      where("deletionStatus", "in", ["pending", "processing", "failed"]),
    );
    return onSnapshot(
      activeRequests,
      (snapshot) => {
        const loaded = snapshot.docs
          .map((userDoc) => readAdminDeletionRequest(userDoc.id, userDoc.data()))
          .filter((entry): entry is AdminDeletionRequest => entry !== null)
          .sort((a, b) =>
            statusRank[a.status] - statusRank[b.status] ||
            b.requestedDate.localeCompare(a.requestedDate),
          );
        setQueueState({ adminUid: user.uid, requests: loaded });
      },
      (error) => {
        console.error("Failed to listen to account deletion requests:", error);
        setQueueState({ adminUid: user.uid, requests: [] });
      },
    );
  }, [user, isAdmin]);

  const approveRequest = (userId: string) =>
    runAdminDeletionAction("approve", userId);
  const rejectRequest = (userId: string) =>
    runAdminDeletionAction("reject", userId);
  const requests = user && isAdmin && queueState.adminUid === user.uid
    ? queueState.requests
    : [];
  const isLoading = Boolean(user && isAdmin && queueState.adminUid !== user.uid);

  return (
    <DeleteRequestContext.Provider
      value={{ requests, isLoading, approveRequest, rejectRequest }}
    >
      {children}
    </DeleteRequestContext.Provider>
  );
}
