"use client";

import React, { createContext, useContext, useState } from "react";
import { mockDeleteRequests, type DeleteRequest } from "@/lib/data/data";
import { generateId } from "@/lib/utils/formatters";

interface DeleteRequestContextType {
  requests: DeleteRequest[];
  getUserRequest: (userId: string) => DeleteRequest | undefined;
  submitRequest: (
    userId: string,
    userName: string,
    userEmail: string,
    reason: string
  ) => void;
  approveRequest: (id: string) => void;
  rejectRequest: (id: string) => void;
}

const DeleteRequestContext = createContext<DeleteRequestContextType>({
  requests: [],
  getUserRequest: () => undefined,
  submitRequest: () => {},
  approveRequest: () => {},
  rejectRequest: () => {},
});

export const useDeleteRequest = () => useContext(DeleteRequestContext);

export function DeleteRequestProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [requests, setRequests] = useState<DeleteRequest[]>(mockDeleteRequests);

  function getUserRequest(userId: string): DeleteRequest | undefined {
    // Return the most recent request for this user (last submitted wins)
    return [...requests]
      .reverse()
      .find((r) => r.userId === userId);
  }

  function submitRequest(
    userId: string,
    userName: string,
    userEmail: string,
    reason: string
  ) {
    const newRequest: DeleteRequest = {
      id: generateId(),
      userId,
      userName,
      userEmail,
      requestedDate: new Date().toISOString().split("T")[0],
      status: "pending",
      reason,
    };
    setRequests((prev) => [...prev, newRequest]);
  }

  function approveRequest(id: string) {
    setRequests((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              status: "approved" as const,
              resolvedDate: new Date().toISOString().split("T")[0],
            }
          : r
      )
    );
  }

  function rejectRequest(id: string) {
    setRequests((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              status: "rejected" as const,
              resolvedDate: new Date().toISOString().split("T")[0],
            }
          : r
      )
    );
  }

  return (
    <DeleteRequestContext.Provider
      value={{
        requests,
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
