/**
 * Shared hook for channel ConfigPanel state management.
 *
 * Handles the error state, auto-dismiss timer, and update mutation
 * that are identical across Finance, Sports, and RSS ConfigPanels.
 */
import { useState, useEffect, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { channelsApi } from "../api/client";
import { queryKeys } from "../api/queries";
import type { ChannelType } from "../api/client";

interface UseChannelConfigResult<T> {
  error: string | null;
  setError: (error: string | null) => void;
  saving: boolean;
  updateItems: (next: T) => void;
}

export function useChannelConfig<T>(
  channelType: ChannelType,
  configKey: string,
): UseChannelConfigResult<T> {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  // Auto-dismiss errors after 4 seconds
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error]);

  const updateMutation = useMutation({
    mutationFn: (next: T) =>
      channelsApi.update(channelType, { config: { [configKey]: next } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
    onError: (err) => {
      // Tier-limit 403s come back as "Your Free plan allows..." — show
      // the server's message verbatim instead of our generic toast so
      // users understand why the save was refused and what to change.
      const msg = err instanceof Error && err.message ? err.message : "";
      if (msg && msg.toLowerCase().includes("plan allows")) {
        toast.error(msg);
      } else {
        toast.error("Failed to save \u2014 try again");
      }
    },
  });

  const updateItems = useCallback(
    (next: T) => updateMutation.mutate(next),
    [updateMutation],
  );

  return {
    error,
    setError,
    saving: updateMutation.isPending,
    updateItems,
  };
}
