'use client';

import { useState } from "react";

export default function WebhookSection({ webhookUrl }: { webhookUrl: string }) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-6 p-4 bg-[#0F1923] border border-[#1E293B] rounded-xl flex flex-col md:flex-row items-center justify-between gap-4 max-w-2xl w-full">
      <div className="flex-1 min-w-0 w-full">
        <p className="text-xs text-[#64748B] font-semibold uppercase tracking-wider mb-1">
          Wazuh Webhook URL
        </p>
        <p className="text-sm font-mono text-[#F1F5F9] break-all bg-[#080D12] p-2.5 rounded border border-[#1E293B] select-all">
          {webhookUrl}
        </p>
      </div>
      <button
        onClick={copyToClipboard}
        className="w-full md:w-auto px-5 py-2.5 rounded-lg bg-[#7C5CFF] text-white text-sm font-semibold hover:bg-[#684be3] transition-colors flex items-center justify-center gap-2"
      >
        {copied ? (
          <>
            <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Copied!
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
            </svg>
            Copy URL
          </>
        )}
      </button>
    </div>
  );
}
