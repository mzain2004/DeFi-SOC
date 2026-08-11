'use client';

import { useState } from "react";

export default function OnboardingForm() {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || name.trim().length < 2 || name.trim().length > 50) {
      setError("Organization name must be between 2 and 50 characters.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/orgs/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create organization");
      }

      window.location.href = "/dashboard";
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="orgName" className="block text-sm font-medium text-[#64748B] mb-2">
          Organization Name
        </label>
        <input
          id="orgName"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={loading}
          placeholder="Security Operations Team"
          className="w-full px-4 py-2 bg-[#080D12] border border-[#1E293B] rounded-lg text-[#F1F5F9] focus:outline-none focus:border-[#7C5CFF] disabled:opacity-50"
        />
      </div>

      {error && (
        <p className="text-sm text-[#EF4444] bg-[#EF4444]/10 p-3 rounded-lg border border-[#EF4444]/20">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 rounded-lg bg-[#7C5CFF] text-white font-semibold hover:bg-[#684be3] transition-colors disabled:opacity-50 flex justify-center items-center"
      >
        {loading ? "Creating..." : "Create & Continue"}
      </button>
    </form>
  );
}
