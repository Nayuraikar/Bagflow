import { useQuery } from "@tanstack/react-query";
import { getHealth } from "../services/health";

export const useHealth = () => useQuery({ queryKey: ["health"], queryFn: getHealth, refetchInterval: 5000 });
