"use client";

import { Button, Dropdown } from "@heroui/react";
import { LogOut, Settings2, UserRound } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export function UserMenu({ openSettings, onError }: {
  openSettings: () => void;
  onError: (message: string) => void;
}) {
  async function logOut() {
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error(result.error.message || "Could not log out");
      location.reload();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not log out");
    }
  }

  return <Dropdown>
    <Button className="user-menu-button" variant="ghost" isIconOnly aria-label="User menu"><UserRound size={20}/></Button>
    <Dropdown.Popover placement="bottom end" className="user-menu-popover">
      <Dropdown.Menu aria-label="Account">
        <Dropdown.Item id="settings" textValue="Settings" onAction={openSettings}><Settings2 size={16}/> Settings</Dropdown.Item>
        <Dropdown.Item id="logout" textValue="Log out" onAction={() => void logOut()}><LogOut size={16}/> Log out</Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown.Popover>
  </Dropdown>;
}
