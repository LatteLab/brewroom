"use client";

import { useState } from "react";
import { addAdminEmail, removeAdminEmail } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import type { AdminWhitelist } from "@/lib/db";

export function AdminWhitelistManager({
  initialWhitelist,
}: {
  initialWhitelist: AdminWhitelist[];
}) {
  const [whitelist, setWhitelist] = useState(initialWhitelist);
  const [newEmail, setNewEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAddEmail = async () => {
    if (!newEmail) return;

    setLoading(true);
    try {
      const data = await addAdminEmail(newEmail);
      setWhitelist([data, ...whitelist]);
      setNewEmail("");
      toast.success("Email added to whitelist");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add email");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveEmail = async (id: string) => {
    try {
      await removeAdminEmail(id);
      setWhitelist(whitelist.filter((item) => item.id !== id));
      toast.success("Email removed from whitelist");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove email");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          type="email"
          placeholder="admin@example.com"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          disabled={loading}
        />
        <Button onClick={handleAddEmail} disabled={loading || !newEmail}>
          {loading ? "Adding..." : "Add"}
        </Button>
      </div>

      <div className="space-y-2">
        {whitelist.length === 0 ? (
          <p className="text-muted-foreground">No whitelisted emails</p>
        ) : (
          whitelist.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between p-3 border rounded"
            >
              <span>{item.email}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRemoveEmail(item.id)}
              >
                Remove
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
