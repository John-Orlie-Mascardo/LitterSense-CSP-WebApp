"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db, auth } from "@/lib/configs/firebase";
import { useAuth } from "@/lib/contexts/AuthContext";
import type { DeleteRequest } from "@/lib/data/mockData";

interface DeleteRequestContextType {
  requests: DeleteRequest[];
  isLoading: boolean;
  getUserRequest: (userId: string) => DeleteRequest | undefined;
  submitRequest: (
    userId: string,
    userName: string,
    userEmail: string,
    reason: string,
  ) => Promise<void>;
  approveRequest: (id: string) => Promise<void>;
  rejectRequest: (id: string) => Promise<void>;
  deleteApprovedAccount: (requestId: string, userId: string) => Promise<void>;
}

const DeleteRequestContext = createContext<DeleteRequestContextType>({
  requests: [],
  isLoading: true,
  getUserRequest: () => undefined,
  submitRequest: async () => {},
  approveRequest: async () => {},
  rejectRequest: async () => {},
  deleteApprovedAccount: async () => {},
});

export const useDeleteRequest = () => useContext(DeleteRequestContext);

function timestampToDateStr(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString().split("T")[0];
  }
  if (typeof value === "string") return value;
  return "";
}

export function DeleteRequestProvider({ children }: { children: ReactNode }) {
  const { user, isAdmin } = useAuth();
  const [requests, setRequests] = useState<DeleteRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      return;
    }

    const deleteRequestsRef = collection(db, "deleteRequests");
    const requestsQuery = isAdmin
      ? deleteRequestsRef
      : query(deleteRequestsRef, where("userId", "==", user.uid));

    const unsubscribe = onSnapshot(
      requestsQuery,
      (snapshot) => {
        const loaded: DeleteRequest[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            userId: data.userId ?? "",
            userName: data.userName ?? "",
            userEmail: data.userEmail ?? "",
            requestedDate: timestampToDateStr(data.requestedDate),
            status: data.status ?? "pending",
            reason: data.reason,
            resolvedDate: data.resolvedDate
              ? timestampToDateStr(data.resolvedDate)
              : undefined,
          };
        });

        loaded.sort((a, b) => {
          if (a.status === "pending" && b.status !== "pending") return -1;
          if (a.status !== "pending" && b.status === "pending") return 1;
          return b.requestedDate.localeCompare(a.requestedDate);
        });

        setRequests(loaded);
        setIsLoading(false);
      },
      (error) => {
        console.error("Failed to listen to delete requests:", error);
        setIsLoading(false);
      },
    );

    return () => unsubscribe();
  }, [user, isAdmin]);

  function getUserRequest(userId: string): DeleteRequest | undefined {
    return requests.find((request) => request.userId === userId);
  }

  async function submitRequest(
    userId: string,
    userName: string,
    userEmail: string,
    reason: string,
  ) {
    await addDoc(collection(db, "deleteRequests"), {
      userId,
      userName,
      userEmail,
      requestedDate: serverTimestamp(),
      status: "pending",
      reason: reason || "No reason provided",
    });
  }

  async function approveRequest(id: string) {
    await updateDoc(doc(db, "deleteRequests", id), {
      status: "approved",
      resolvedDate: serverTimestamp(),
    });
  }

  async function rejectRequest(id: string) {
    await updateDoc(doc(db, "deleteRequests", id), {
      status: "rejected",
      resolvedDate: serverTimestamp(),
    });
  }

  async function deleteApprovedAccount(
    requestId: string,
    userId: string,
  ): Promise<void> {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error("Not signed in.");
    const idToken = await currentUser.getIdToken();

    const res = await fetch("/api/admin/delete-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken, userId, requestId }),
    });

    const data = (await res.json()) as { error?: string };
    if (!res.ok) throw new Error(data.error ?? "Failed to delete account.");
  }

  const visibleRequests = user ? requests : [];
  const visibleIsLoading = user ? isLoading : false;

  return (
    <DeleteRequestContext.Provider
      value={{
        requests: visibleRequests,
        isLoading: visibleIsLoading,
        getUserRequest,
        submitRequest,
        approveRequest,
        rejectRequest,
        deleteApprovedAccount,
      }}
    >
      {children}
    </DeleteRequestContext.Provider>
  );
}
