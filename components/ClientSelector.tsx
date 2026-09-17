"use client";

import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { BrandProfile } from "@/lib/schemas";

const NO_PROFILE_VALUE = "__none__";

interface ClientSelectorProps {
  value: string | null;
  onChange: (clientId: string | null) => void;
}

export function ClientSelector({ value, onChange }: ClientSelectorProps) {
  const [clients, setClients] = useState<BrandProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: BrandProfile[]) => setClients(Array.isArray(data) ? data : []))
      .catch(() => setClients([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-2">
      <Label>Client</Label>
      <Select
        value={value ?? NO_PROFILE_VALUE}
        onValueChange={(v) => onChange(v === NO_PROFILE_VALUE ? null : v)}
        disabled={loading}
      >
        <SelectTrigger className="w-full sm:w-72">
          <SelectValue placeholder="Select a client" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_PROFILE_VALUE}>New / no brand profile</SelectItem>
          {clients.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.clientName}
              {c.isDraft ? " (draft)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
