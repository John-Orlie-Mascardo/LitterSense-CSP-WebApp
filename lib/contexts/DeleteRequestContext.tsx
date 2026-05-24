"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
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
import { db } from "@/lib/configs/firebase";
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
    reason: string
  ) => Promise<void>;
  approveRequest: (id: string) => Promise<void>;
  rejectRequest: (id: string) => Promise<void>;
}

const DeleteRequestContext = createContext<DeleteRequestContextType>({
  requests: [],
  isLoading: true,
  getUserRequest: () => undefined,
  submitRequest: async () => {},
  approveRequest: async () => {},
  rejectRequest: async () => {},
});

export const useDeleteRequest = () => useContext(DeleteRequestContext);

// Helper to convert Firestore Timestamp to ISO date string
function timestampToDateStr(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString().split("T")[0];
  }
  if (typeof value === "string") return value;
  return "";
}

export function DeleteRequestProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isAdmin } = useAuth();
  const [requests, setRequests] = useState<DeleteRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Real-time listener — admin sees all, regular users see only their own
  useEffect(() => {
    if (!user) {
      setRequests([]);
      setIsLoading(false);
      return;
    }

    const deleteRequestsRef = collection(db, "deleteRequests");

    // Admin gets all requests; regular users get only their own
    const q = isAdmin
      ? deleteRequestsRef
      : query(deleteRequestsRef, where("userId", "==", user.uid));

    const unsub = onSnapshot(
      q,
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

        // Sort: pending first, then by requestedDate descending
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
      }
    );

    return () => unsub();
  }, [user, isAdmin]);

  function getUserRequest(userId: string): DeleteRequest | undefined {
    // Return the most recent request for this user (pending > resolved)
    return requests.find((r) => r.userId === userId);
  }

  async function submitRequest(
    userId: string,
    userName: string,
    userEmail: string,
    reason: string
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

  return (
    <DeleteRequestContext.Provider
      value={{
        requests,
        isLoading,
        getUserRequest,
        submitRequest,
        approveRequest,
        rejectRequest,
      }}
    >
      {children}
    </DeleteRequestContext.Provider>
  );
}
