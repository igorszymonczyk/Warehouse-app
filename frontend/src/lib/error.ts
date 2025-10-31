import axios, { AxiosError } from "axios";

type Problem = { detail?: string; message?: string; [k: string]: unknown };

export function toMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const ax = err as AxiosError<Problem | string>;
    const data = ax.response?.data;
    if (typeof data === "string") return data;
    if (data && typeof data === "object") {
      const p = data as Problem;
      if (typeof p.detail === "string") return p.detail;
      if (typeof p.message === "string") return p.message;
    }
    return ax.message || "Network Error";
  }
  if (err instanceof Error) return err.message;
  return "Unexpected error";
}
