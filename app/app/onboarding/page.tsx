'use client';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import OnboardingForm from "./OnboardingForm";
import { BrandMark } from "../components/ui/BrandMark";

export default function OnboardingPage() {
  const [checking, setChecking] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function checkOrg() {
      try {
        const res = await fetch("/api/orgs/me");
        if (res.ok) {
          const data = await res.json();
          if (data?.organization) {
            router.replace("/dashboard");
            return;
          }
        }
      } catch (err) {
        console.error("Error checking org status:", err);
      } finally {
        setChecking(false);
      }
    }
    checkOrg();
  }, [router]);

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#080D12] text-[#EDF2F7] px-4 font-sans">
        <div className="w-full max-w-lg rounded-2xl border border-[#1F2D3D] bg-[#0D1117] p-6">
          <div className="h-4 w-44 rounded bg-[#111720] animate-pulse" />
          <div className="mt-4 h-10 rounded bg-[#111720]/80 animate-pulse" />
          <div className="mt-3 h-10 rounded bg-[#111720]/60 animate-pulse" />
          <p className="mt-5 text-xs text-[#8899AA]">Checking organization status...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#080D12] px-4 py-10 text-[#EDF2F7] font-sans">
      <div className="grid w-full max-w-5xl gap-6 rounded-2xl border border-[#1F2D3D] bg-[#0D1117] p-6 shadow-xl md:grid-cols-[0.9fr_1.1fr]">
        <div className="flex flex-col justify-between gap-8 rounded-xl border border-[#1A2332] bg-[#080D12] p-6">
          <div>
            <BrandMark size="lg" />
            <h2 className="mt-8 text-2xl font-bold text-[#EDF2F7]">
              Create your first workspace
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#8899AA]">
              Start with one PhishSlayer organization workspace for your team. Client hierarchy and multi-workspace operations stay in the MSSP view.
            </p>
          </div>
          <div className="space-y-3 text-xs text-[#8899AA]">
            <div className="rounded-lg border border-[#1F2D3D] bg-[#0D1117] p-3">1. Name the workspace</div>
            <div className="rounded-lg border border-[#1F2D3D] bg-[#0D1117] p-3">2. Open Mission Control</div>
            <div className="rounded-lg border border-[#1F2D3D] bg-[#0D1117] p-3">3. Review alert evidence before containment</div>
          </div>
        </div>

        <div className="p-2 md:p-4">
          <div className="flex justify-center mb-6 md:hidden">
          <BrandMark size="lg" />
          </div>
        <div className="mb-4 flex justify-center">
          <span className="rounded-full border border-[#223247] bg-[#0A1118] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#A7B4C5]">
            Workspace setup
          </span>
        </div>
        <p className="text-xs text-[#64748B] text-center mb-6 font-mono uppercase tracking-[0.16em]">
          Team setup only. No containment actions happen here.
        </p>
        <OnboardingForm />
        </div>
      </div>
    </div>
  );
}
