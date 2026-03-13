/**
 * Channel CRUD actions for the app window.
 *
 * Handles toggling channel visibility, adding new channels,
 * and deleting channels via the API.
 */
import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { getValidToken } from "../auth";
import { channelsApi } from "../api/client";
import type { ChannelType } from "../api/client";

interface ChannelActions {
  handleToggleChannel: (channelType: ChannelType, visible: boolean) => Promise<void>;
  handleAddChannel: (channelType: ChannelType) => Promise<void>;
  handleDeleteChannel: (channelType: ChannelType) => Promise<void>;
}

export function useChannelActions(
  fetchDashboard: () => void,
): ChannelActions {
  const navigate = useNavigate();

  const handleToggleChannel = useCallback(
    async (channelType: ChannelType, visible: boolean) => {
      const token = await getValidToken();
      if (!token) return;
      try {
        await channelsApi.update(
          channelType,
          { enabled: true, visible },
          () => Promise.resolve(token),
        );
        fetchDashboard();
      } catch (err) {
        console.error("[Scrollr] Channel toggle failed:", err);
      }
    },
    [fetchDashboard],
  );

  const handleAddChannel = useCallback(
    async (channelType: ChannelType) => {
      const token = await getValidToken();
      if (!token) return;
      try {
        await channelsApi.create(
          channelType,
          {},
          () => Promise.resolve(token),
        );
        fetchDashboard();
        navigate({
          to: "/channel/$type/$tab",
          params: { type: channelType, tab: "feed" },
        });
      } catch (err) {
        console.error("[Scrollr] Channel add failed:", err);
      }
    },
    [fetchDashboard, navigate],
  );

  const handleDeleteChannel = useCallback(
    async (channelType: ChannelType) => {
      const token = await getValidToken();
      if (!token) return;
      try {
        await channelsApi.delete(channelType, () => Promise.resolve(token));
        await fetchDashboard();
        navigate({ to: "/feed" });
      } catch (err) {
        console.error("[Scrollr] Channel delete failed:", err);
      }
    },
    [fetchDashboard, navigate],
  );

  return { handleToggleChannel, handleAddChannel, handleDeleteChannel };
}
