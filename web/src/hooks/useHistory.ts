import { useQuery } from "@tanstack/react-query";
import { getHistory } from "../services/history";

/** Newest first. Polls while any job is waiting or running. */
export const useHistory = () =>
  useQuery({
    queryKey: ["history"],
    queryFn: getHistory,
    refetchInterval: (query) =>
      query.state.data?.some((r) => r.status === "queued" || r.status === "running") ? 2000 : 15_000,
  });
