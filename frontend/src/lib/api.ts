import { useQuery } from "@tanstack/react-query";
import type { IssueDetail, Me, Snapshot } from "./types";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin", headers: { Accept: "application/json" } });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body: unknown = await res.json();
      if (body && typeof body === "object" && "detail" in body && typeof body.detail === "string") {
        detail = body.detail;
      }
    } catch {
      // réponse sans JSON : on garde le statut HTTP
    }
    throw new HttpError(res.status, detail);
  }
  return (await res.json()) as T;
}

export const useMe = () =>
  useQuery({ queryKey: ["me"], queryFn: () => getJSON<Me>("/api/me"), retry: false, staleTime: Infinity });

/** L'instantané est rafraîchi par le flux temps réel ; l'intervalle n'est qu'un filet de sécurité. */
export const useSnapshot = (enabled: boolean) =>
  useQuery({
    queryKey: ["snapshot"],
    queryFn: () => getJSON<Snapshot>("/api/snapshot"),
    enabled,
    staleTime: Infinity,
    refetchInterval: 120_000,
    retry: 1,
  });

export const useIssueDetail = (iid: number | null) =>
  useQuery({
    queryKey: ["issue", iid],
    queryFn: () => getJSON<IssueDetail>(`/api/issues/${iid}`),
    enabled: iid !== null,
    staleTime: 15_000,
    retry: false,
  });
