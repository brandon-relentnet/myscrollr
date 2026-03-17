/**
 * Channel CRUD actions for the app window.
 *
 * Uses TanStack Query mutations with automatic dashboard cache
 * invalidation — no manual fetchDashboard() threading required.
 */
import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { channelsApi, toggleChannelVisibility } from "../api/client";
import { queryKeys } from "../api/queries";
import type { ChannelType } from "../api/client";

interface ChannelActions {
  handleToggleChannel: (channelType: ChannelType, visible: boolean) => Promise<void>;
  handleAddChannel: (channelType: ChannelType) => Promise<void>;
  handleDeleteChannel: (channelType: ChannelType) => Promise<void>;
}

export function useChannelActions(): ChannelActions {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleToggleChannel = useCallback(
    async (channelType: ChannelType, visible: boolean) => {
      try {
        await toggleChannelVisibility(channelType, visible, true);
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      } catch (err) {
        console.error("[Scrollr] Channel toggle failed:", err);
      }
    },
    [queryClient],
  );

  const handleAddChannel = useCallback(
    async (channelType: ChannelType) => {
      try {
        await channelsApi.create(channelType);
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
        navigate({
          to: "/channel/$type/$tab",
          params: { type: channelType, tab: "feed" },
        });
      } catch (err) {
        console.error("[Scrollr] Channel add failed:", err);
      }
    },
    [queryClient, navigate],
  );

  const handleDeleteChannel = useCallback(
    async (channelType: ChannelType) => {
      try {
        await channelsApi.delete(channelType);
        await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
        navigate({ to: "/feed" });
      } catch (err) {
        console.error("[Scrollr] Channel delete failed:", err);
      }
    },
    [queryClient, navigate],
  );

  return { handleToggleChannel, handleAddChannel, handleDeleteChannel };
}
