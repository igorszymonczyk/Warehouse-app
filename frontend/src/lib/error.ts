import axios, { AxiosError } from "axios";

// Define a loose type for API error responses
type Problem = { detail?: string; message?: string; [k: string]: unknown };

// Helper to extract a user-friendly error message from various error objects
export function toMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const ax = err as AxiosError<Problem | string>;
    const data = ax.response?.data;
    
    // Handle raw string response
    if (typeof data === "string") return data;
    
    // Handle JSON object response
    if (data && typeof data === "object") {
      const p = data as Problem;
      // Check for 'detail' (FastAPI standard) or 'message' field
      if (typeof p.detail === "string") return p.detail;
      if (typeof p.message === "string") return p.message;
    }
    // Fallback to Axios internal message or generic network error
    return ax.message || "Network Error";
  }
  
  // Handle standard JavaScript errors
  if (err instanceof Error) return err.message;
  
  return "Unexpected error";
}