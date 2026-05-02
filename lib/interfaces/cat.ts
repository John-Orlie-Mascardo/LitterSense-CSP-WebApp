export interface Cat {
    id: string;
    name: string;
    status: "healthy" | "watch" | "alert";
    avatar: string | null;
    isOnline: boolean;
  }