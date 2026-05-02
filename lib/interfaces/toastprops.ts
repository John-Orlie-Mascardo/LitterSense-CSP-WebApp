export interface ToastParams {
    id: string;
    message: string;
    type?: "success" | "error" | "info" | "warning";
    duration?: number;
    onClose: (id: string) => void;
  }  