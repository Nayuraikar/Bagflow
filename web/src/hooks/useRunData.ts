import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getBaggage, getSimulationMetrics } from "../services/simulations";

export const useSimulationMetrics = (id: string | undefined) =>
  useQuery({
    queryKey: ["simulation-metrics", id],
    queryFn: () => getSimulationMetrics(id!),
    enabled: id !== undefined,
    staleTime: Infinity, // a finished run does not change
  });

/** Bag counts at one playback time. Pass `undefined` when the run no longer keeps bag histories. */
export const usePlaybackCounts = (id: string | undefined, atMs: number) =>
  useQuery({
    queryKey: ["playback-counts", id, atMs],
    queryFn: async () => ({ id, page: await getBaggage(id!, { atMs, pageSize: 1 }) }),
    enabled: id !== undefined,
    staleTime: Infinity,
    // keep the last number while the time changes, but never show another run's number
    placeholderData: keepPreviousData,
    select: (data) => (data.id === id ? data.page : undefined),
  });
