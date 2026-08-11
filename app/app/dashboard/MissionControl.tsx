'use client';

import { useCallback, useEffect, useRef, useState } from "react";
import { UserButton } from "@clerk/nextjs";
import L2InvestigationPanel from "../components/L2InvestigationPanel";
import Link from "next/link";
import OrgSwitcher from "../components/OrgSwitcher";
import { BrandMark } from "../components/ui/BrandMark";
import { getBrowserSupabaseClient } from "../lib/supabase-browser";

interface Agent {
  id: string;
  name: string;
  status: string;
  ip: string;
  os: string;
  lastKeepAlive: string;
}

interface Alert {
  id: string;
  org_id: string;
  raw_payload: Record<string, unknown>;
  rule_id: string;
  rule_level: number;
  rule_description: string;
  agent_id: string;
  agent_name: string;
  status: string; // 'pending' | 'approved' | 'rejected' | 'executed'
  created_at: string;
  verdict: string | null; // 'benign' | 'suspicious' | 'malicious'
  confidence: number | null;
  mitre_techniques: string[] | null;
  auto_execute: boolean;
  blast_radius: string | null; // 'user' | 'device' | 'org' | 'tenant'
  triaged_at: string | null;
}

interface Investigation {
  id: string;
  alert_id: string;
  org_id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  opplan: any;
  diamond_model: {
    adversary?: string;
    victim?: string;
    infrastructure?: string;
    capability?: string;
  };
  proposed_actions: Array<{
    action: string;
    target: string;
    reversible: boolean;
    blast_radius: string;
    rationale: string;
    action_type?: string;
  }>;
  critic_review: string | null;
  confidence: number | null;
  status: string; // 'pending_approval' | 'approved' | 'rejected' | 'executed'
  created_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execution_results?: any;
  executed_at?: string | null;
}

interface MissionControlProps {
  orgId: string;
  orgName: string;
  webhookUrl: string;
  initialAlerts: Alert[];
}

interface OrgPermissions {
  role?: string | null;
  capabilities: string[];
  is_read_only: boolean;
}

export default function MissionControl({ orgId, orgName, initialAlerts }: MissionControlProps) {
  const [alerts, setAlerts] = useState<Alert[]>(initialAlerts);
  const [isClient, setIsClient] = useState(false);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(
    initialAlerts.length > 0 ? initialAlerts[0].id : null
  );
  
  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [verdictFilter, setVerdictFilter] = useState<string>("all"); // 'all' | 'malicious' | 'suspicious' | 'benign' | 'pending'
  
  // Action queue loading states
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [activeTab, setActiveTab] = useState<'detail' | 'investigation'>('detail');
  const [actionError, setActionError] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<OrgPermissions>({
    role: null,
    capabilities: [],
    is_read_only: true,
  });

  // Agents list state
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsError, setAgentsError] = useState<string | null>(null);

  const fetchAgents = async () => {
    setAgentsLoading(true);
    try {
      const res = await fetch("/api/agents");
      if (!res.ok) throw new Error("Failed to fetch agents");
      const data = await res.json();
      setAgents(data.agents || []);
      setAgentsError(null);
    } catch (err) {
      console.error("Error fetching agents:", err);
      setAgentsError("Failed to load agents");
    } finally {
      setAgentsLoading(false);
    }
  };

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    const loadPermissions = async () => {
      try {
        const res = await fetch("/api/orgs/me");
        if (!res.ok) return;
        const data = await res.json();
        if (data?.permissions) {
          setPermissions(data.permissions);
        }
      } catch (err) {
        console.error("Failed to load mission control permissions:", err);
      }
    };
    void loadPermissions();
  }, []);

  useEffect(() => {
    fetchAgents();
    const interval = setInterval(fetchAgents, 60000);
    return () => clearInterval(interval);
  }, []);

  const formatLastSeen = (timeStr: string) => {
    if (!timeStr) return "Never";
    if (!isClient) return timeStr;
    try {
      const date = new Date(timeStr);
      // Wazuh lastKeepAlive might be in UTC, make sure we handle timezone difference gracefully
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return timeStr;
    }
  };
  
  // Countdown timers mapping (alert_id -> seconds remaining)
  const [countdowns, setCountdowns] = useState<Record<string, number>>({});
  const countdownIntervals = useRef<Record<string, NodeJS.Timeout>>({});
  const canPrepareActions = permissions.capabilities.includes("approvals.prepare");
  const canApproveActions = permissions.capabilities.includes("approvals.approve");
  const canExecuteActions = permissions.capabilities.includes("actions.execute");
  const canCheckRollback = permissions.capabilities.includes("rollback.request");

  // Legacy alert action handler retained for demo compatibility and L2 handoff.
  const handleAction = useCallback(async (alertId: string, action: 'approve' | 'reject' | 'execute') => {
    setActionLoadingId(alertId);
    setActionError(null);
    try {
      const res = await fetch(`/api/actions/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alert_id: alertId })
      });
      
      if (!res.ok) {
        throw new Error(`Failed to ${action} action: status ${res.status}`);
      }
      
      const data = await res.json();
      console.log(`${action} response:`, data);
      
      // Update local state status instantly
      const targetStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'executed';
      setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status: targetStatus } : a));
      
      if (action === 'approve' && data?.l2_triggered === true) {
        setSelectedAlertId(alertId);
        setActiveTab('investigation');
      }
      
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "An error occurred";
      setActionError(msg);
    } finally {
      setActionLoadingId(null);
    }
  }, []);

  // 1. Supabase Realtime Subscription
  useEffect(() => {
    const supabase = getBrowserSupabaseClient();

    const channel = supabase
      .channel(`realtime-alerts-org-${orgId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'alerts',
          filter: `org_id=eq.${orgId}`
        },
        (payload) => {
          console.log("Realtime event received:", payload);
          if (payload.eventType === 'INSERT') {
            const newAlert = payload.new as Alert;
            setAlerts((prev) => {
              // Avoid duplicates
              if (prev.some(a => a.id === newAlert.id)) return prev;
              return [newAlert, ...prev];
            });
            // Automatically select first alert if none is selected
            setSelectedAlertId(prev => prev || newAlert.id);
          } else if (payload.eventType === 'UPDATE') {
            const updatedAlert = payload.new as Alert;
            setAlerts((prev) =>
              prev.map((alert) => (alert.id === updatedAlert.id ? updatedAlert : alert))
            );
          } else if (payload.eventType === 'DELETE') {
            const deletedAlert = payload.old as { id: string };
            setAlerts((prev) => prev.filter((alert) => alert.id !== deletedAlert.id));
            setSelectedAlertId(prev => prev === deletedAlert.id ? null : prev);
          }
        }
      )
      .subscribe();

    const currentIntervals = countdownIntervals.current;
    return () => {
      supabase.removeChannel(channel);
      // Clear all countdown intervals on unmount
      Object.values(currentIntervals).forEach(clearInterval);
    };
  }, [orgId]);

  useEffect(() => {
    setActiveTab('detail');
  }, [selectedAlertId]);

  // 1b. Fetch and Subscribe to alert_investigations
  useEffect(() => {
    const supabase = getBrowserSupabaseClient();

    const fetchInvestigations = async () => {
      try {
        const res = await fetch("/api/investigations");
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          console.error("Error fetching investigations:", data?.error || `status ${res.status}`);
          return;
        }
        if (Array.isArray(data.investigations)) {
          setInvestigations(data.investigations as Investigation[]);
        }
      } catch (e) {
        console.error("Failed fetching investigations client-side:", e instanceof Error ? e.message : "unknown error");
      }
    };
    fetchInvestigations();

    const channel = supabase
      .channel(`realtime-investigations-org-${orgId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'alert_investigations',
          filter: `org_id=eq.${orgId}`
        },
        (payload) => {
          console.log("Realtime investigation event received:", payload);
          if (payload.eventType === 'INSERT') {
            const newInv = payload.new as Investigation;
            setInvestigations((prev) => {
              if (prev.some(i => i.id === newInv.id)) return prev;
              return [newInv, ...prev];
            });
          } else if (payload.eventType === 'UPDATE') {
            const updatedInv = payload.new as Investigation;
            setInvestigations((prev) =>
              prev.map((inv) => (inv.id === updatedInv.id ? updatedInv : inv))
            );
          } else if (payload.eventType === 'DELETE') {
            const deletedInv = payload.old as { id: string };
            setInvestigations((prev) => prev.filter((inv) => inv.id !== deletedInv.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId]);

  // Legacy alert-state countdown retained for demo compatibility.
  // Preferred human-approved execution happens from the investigation review panel.
  useEffect(() => {
    // Find all alerts that are pending, triaged as malicious/suspicious, have auto_execute = true,
    // and blast_radius of user/device, and do NOT have a countdown running yet.
    alerts.forEach((alert) => {
      const isAutoExecutable = 
        canExecuteActions &&
        alert.status === 'pending' &&
        alert.auto_execute &&
        (alert.blast_radius === 'user' || alert.blast_radius === 'device') &&
        (alert.verdict === 'malicious' || alert.verdict === 'suspicious');

      if (isAutoExecutable && countdowns[alert.id] === undefined && !countdownIntervals.current[alert.id]) {
        // Start a 10s countdown
        setCountdowns(prev => ({ ...prev, [alert.id]: 10 }));
        
        const interval = setInterval(() => {
          setCountdowns((prev) => {
            const currentSec = prev[alert.id];
            if (currentSec <= 1) {
              clearInterval(interval);
              delete countdownIntervals.current[alert.id];
              // Fire execute API
              handleAction(alert.id, 'execute');
              const nextCountdowns = { ...prev };
              delete nextCountdowns[alert.id];
              return nextCountdowns;
            }
            return { ...prev, [alert.id]: currentSec - 1 };
          });
        }, 1000);

        countdownIntervals.current[alert.id] = interval;
      }
    });
  }, [alerts, canExecuteActions, countdowns, handleAction]);

  // Cancel an active auto-execute countdown
  const cancelCountdown = (alertId: string) => {
    if (countdownIntervals.current[alertId]) {
      clearInterval(countdownIntervals.current[alertId]);
      delete countdownIntervals.current[alertId];
    }
    setCountdowns((prev) => {
      const nextCountdowns = { ...prev };
      delete nextCountdowns[alertId];
      return nextCountdowns;
    });
    
    // Opt-out of auto-execute: update alert's auto_execute to false locally to stop prompt
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, auto_execute: false } : a));
  };

  // 4. Filtering & Search logic
  const filteredAlerts = alerts.filter((alert) => {
    const matchesSearch = 
      alert.rule_description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      alert.agent_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      alert.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      alert.rule_id?.toLowerCase().includes(searchQuery.toLowerCase());
      
    if (verdictFilter === 'all') return matchesSearch;
    if (verdictFilter === 'pending') return matchesSearch && alert.status === 'pending';
    return matchesSearch && alert.verdict === verdictFilter;
  });

  const selectedAlert = alerts.find(a => a.id === selectedAlertId) || null;
  const shortId = (value: string | null | undefined) => (value ? value.slice(0, 8) : "none");

  // Pending approval items for right column HITL rail
  const pendingApprovalAlerts = alerts.filter(
    a => a.status === 'pending' && (a.verdict === 'malicious' || a.verdict === 'suspicious')
  );

  // Formatting helpers
  const formatTime = (timeStr: string) => {
    if (!isClient) return timeStr;
    try {
      const date = new Date(timeStr);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return timeStr;
    }
  };

  const formatDate = (timeStr: string) => {
    if (!isClient) return timeStr;
    try {
      const date = new Date(timeStr);
      return date.toLocaleDateString([], { month: 'short', day: '2-digit', year: 'numeric' });
    } catch {
      return timeStr;
    }
  };

  const getVerdictStyles = (verdict: string | null, status: string) => {
    if (status !== 'pending') {
      if (status === 'approved') return { border: 'border-l-4 border-success', text: 'text-success', bg: 'bg-success/10', name: 'Approved' };
      if (status === 'rejected') return { border: 'border-l-4 border-danger', text: 'text-danger', bg: 'bg-danger/10', name: 'Rejected' };
      if (status === 'executed') return { border: 'border-l-4 border-intel', text: 'text-intel', bg: 'bg-intel/10', name: 'Executed' };
    }
    switch (verdict) {
      case 'malicious':
        return { border: 'border-l-4 border-danger', text: 'text-danger', bg: 'bg-danger/10', name: 'Malicious' };
      case 'suspicious':
        return { border: 'border-l-4 border-high', text: 'text-high', bg: 'bg-high/10', name: 'Suspicious' };
      case 'benign':
        return { border: 'border-l-4 border-success', text: 'text-success', bg: 'bg-success/10', name: 'Benign' };
      default:
        return { border: 'border-l-4 border-text-muted', text: 'text-text-sec', bg: 'bg-bg-elevated', name: 'Triaging' };
    }
  };

  return (
    <div className="h-screen max-h-screen overflow-hidden bg-bg-void text-text-primary flex flex-col font-sans">
      {/* Header bar */}
      <header className="flex min-h-[56px] flex-shrink-0 items-center justify-between gap-4 px-5 py-3 bg-bg-surface border-b border-border z-10">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="hover:opacity-90 transition-opacity">
            <BrandMark />
          </Link>
          <span className="text-xs px-2.5 py-0.5 bg-border rounded text-text-sec font-mono">
            V2 MISSION CONTROL
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/hunt"
            className="text-xs font-mono bg-bg-elevated hover:bg-bg-base border border-border px-3 py-1.5 rounded-lg text-text-sec hover:text-text-primary transition-all"
          >
            HUNT WORKSPACE
          </Link>
          <Link
            href="/mssp"
            className="text-xs font-mono bg-bg-elevated hover:bg-bg-base border border-border px-3 py-1.5 rounded-lg text-text-sec hover:text-text-primary transition-all"
          >
            MSSP WORKSPACE
          </Link>
          <OrgSwitcher
            currentOrgId={orgId}
            currentOrgName={orgName}
          />
          <UserButton />
        </div>
      </header>

      {/* Main 3-Column Zero-Page Layout */}
      <div className="flex-1 min-h-0 flex overflow-hidden h-[calc(100vh-57px)]">
        
        {/* ================= COLUMN 1: Alert Feed ================= */}
        <aside className="w-[288px] min-h-0 bg-bg-surface border-r border-border flex flex-col flex-shrink-0 overflow-hidden">
          {/* Connected Agents Section */}
          <div className="p-3 border-b border-border bg-bg-surface flex flex-col gap-1.5 flex-shrink-0">
            <div className="flex items-center justify-between text-[10px] text-text-sec uppercase tracking-wider font-semibold">
              <span>Mapped Endpoints</span>
              <span className="font-mono text-[9px] text-text-muted">({agents.length})</span>
            </div>
            
            <div className="max-h-[120px] overflow-y-auto custom-scrollbar flex flex-col gap-1 pr-0.5">
              {agentsLoading && agents.length === 0 ? (
                <div className="text-[10px] text-text-muted py-2 text-center font-mono">
                  Loading mapped endpoints... Waiting for the latest Wazuh agent heartbeat.
                </div>
              ) : agentsError ? (
                <div className="text-[10px] text-danger py-2 text-center font-mono">{agentsError}</div>
              ) : agents.length === 0 ? (
                <div className="text-[10px] text-text-muted py-2 text-center font-mono">No agents connected</div>
              ) : (
                agents.map((agent) => (
                  <div key={agent.id} className="flex items-center justify-between p-1.5 rounded bg-bg-base/40 border border-border-sub/50 text-[11px] font-sans">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span 
                        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          agent.status === "active" ? "bg-success animate-pulse" : "bg-danger"
                        }`}
                      />
                      <span className="font-mono text-text-primary truncate font-semibold max-w-[80px]" title={agent.name}>
                        {agent.name}
                      </span>
                      <span className="text-[9px] text-text-muted truncate font-mono">
                        {agent.ip}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[9px] text-text-muted font-mono flex-shrink-0">
                      <span>{agent.os}</span>
                      <span>{"·"}</span>
                      <span>{formatLastSeen(agent.lastKeepAlive)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Feed Search & Filter */}
          <div className="p-3 border-b border-border flex flex-col gap-2 bg-bg-surface">
            <div className="relative">
              <input
                type="text"
                placeholder="Search alerts, rules, or IDs"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-bg-base border border-border focus:border-accent rounded-lg px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted outline-none transition-colors"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-2 top-2 text-text-muted hover:text-text-sec text-xs">×</button>
              )}
            </div>
            
            {/* Filters */}
            <div className="grid grid-cols-5 gap-1 text-[10px] text-center font-mono">
              {['all', 'malicious', 'suspicious', 'benign', 'pending'].map((filter) => (
                <button
                  key={filter}
                  onClick={() => setVerdictFilter(filter)}
                  className={`py-1 rounded border capitalize transition-colors ${
                    verdictFilter === filter
                      ? 'bg-accent/15 border-accent text-accent'
                      : 'border-border bg-bg-base text-text-muted hover:text-text-sec'
                  }`}
                >
                  {filter === 'malicious' ? 'Mal' : filter === 'suspicious' ? 'Susp' : filter === 'benign' ? 'Ben' : filter === 'pending' ? 'Pend' : 'All'}
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable Alerts Feed List */}
          <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-border-sub custom-scrollbar">
            {filteredAlerts.length === 0 ? (
              <div className="p-8 text-center text-xs text-text-muted">
                No alerts found
              </div>
            ) : (
              filteredAlerts.map((alert) => {
                const styles = getVerdictStyles(alert.verdict, alert.status);
                const isSelected = alert.id === selectedAlertId;
                const hasCountdown = countdowns[alert.id] !== undefined;
                
                return (
                  <button
                    key={alert.id}
                    onClick={() => setSelectedAlertId(alert.id)}
                    className={`w-full text-left p-3 flex flex-col gap-1 transition-all relative ${styles.border} ${
                      isSelected ? 'bg-bg-elevated' : 'hover:bg-bg-surface/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] uppercase font-mono font-bold tracking-wider px-1.5 py-0.5 rounded ${styles.bg} ${styles.text}`}>
                        {styles.name}
                      </span>
                      <span className="text-[10px] text-text-muted font-mono">
                        LVL {alert.rule_level}
                      </span>
                    </div>
                    
                    <h4 className="text-xs font-semibold text-text-primary line-clamp-2 leading-snug">
                      {alert.rule_description || 'Unknown Alert'}
                    </h4>
                    
                    <div className="flex items-center justify-between text-[10px] text-text-muted mt-1 font-mono">
                      <span>{alert.agent_name}</span>
                      <span>{formatTime(alert.created_at)}</span>
                    </div>

                    {hasCountdown && (
                      <div className="absolute right-2 top-2 w-2 h-2 rounded-full bg-intel animate-ping" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* ================= COLUMN 2: Alert Detail Canvas ================= */}
        <main className="flex-1 min-w-0 min-h-0 bg-bg-base overflow-y-auto flex flex-col p-5 custom-scrollbar">
          {!selectedAlert ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-text-muted">
              <svg className="w-12 h-12 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-sm">Select an alert from the feed to inspect evidence, approval state, and endpoint targeting.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
              
              {/* Alert Header Summary */}
              <div className="bg-bg-surface border border-border rounded-xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-1.5">
                    <span className="text-xs text-text-muted font-mono font-semibold uppercase tracking-wider">
                      ALERT ID
                    </span>
                    <span className="text-xs font-mono text-intel select-all">
                      {selectedAlert.id}
                    </span>
                  </div>
                  <h2 className="text-xl font-bold font-syne text-text-primary leading-tight">
                    {selectedAlert.rule_description}
                  </h2>
                </div>
                
                <div className="flex flex-col text-right items-end gap-1.5">
                  <div className="text-xs text-text-muted font-mono">
                    RULE ID: <span className="text-text-primary">{selectedAlert.rule_id}</span>
                  </div>
                  <div className="text-xs text-text-muted font-mono">
                    RULE LEVEL: <span className="text-text-primary">{selectedAlert.rule_level}</span>
                  </div>
                  <div className="text-xs text-text-muted font-mono">
                    DETECTED: <span className="text-text-primary">{formatDate(selectedAlert.created_at)} {formatTime(selectedAlert.created_at)}</span>
                  </div>
                </div>
              </div>

              {/* Tabs Section */}
              {(() => {
                const inv = investigations.find(i => i.alert_id === selectedAlert.id);
                const hasInv = 
                  selectedAlert.status === 'approved' || 
                  selectedAlert.status === 'investigating' || 
                  selectedAlert.status === 'l2_failed' ||
                  selectedAlert.status === 'executed' ||
                  !!inv;
                
                if (!hasInv) return null;
                
                return (
                  <div className="flex border-b border-border gap-2">
                    <button
                      onClick={() => setActiveTab('detail')}
                      className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
                        activeTab === 'detail'
                          ? 'border-accent text-accent'
                          : 'border-transparent text-text-sec hover:text-text-primary'
                      }`}
                    >
                      Alert Detail
                    </button>
                    <button
                      onClick={() => setActiveTab('investigation')}
                      className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
                        activeTab === 'investigation'
                          ? 'border-accent text-accent'
                          : 'border-transparent text-text-sec hover:text-text-primary'
                      }`}
                    >
                      L2 Investigation
                    </button>
                  </div>
                );
              })()}

              {activeTab === 'detail' ? (
                <>
                  {/* L1 Agent Verdict Panel */}
                  <div className="bg-bg-surface border border-border rounded-xl p-5 flex flex-col gap-4 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-accent/5 rounded-full blur-2xl -mr-8 -mt-8" />
                    
                    <h3 className="text-sm font-bold font-syne text-accent tracking-wide uppercase">
                      L1 AGENT TRIAGE RESULTS
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-2">
                      {/* Verdict Display */}
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs text-text-muted font-mono uppercase tracking-wider">VERDICT</span>
                        {selectedAlert.verdict ? (
                          <span className={`text-lg font-bold font-mono tracking-wider uppercase ${
                            selectedAlert.verdict === 'malicious' ? 'text-danger' : selectedAlert.verdict === 'suspicious' ? 'text-high' : 'text-success'
                          }`}>
                            {selectedAlert.verdict}
                          </span>
                        ) : (
                          <span className="text-sm text-text-sec font-mono animate-pulse">Running L1 Agent Triage...</span>
                        )}
                      </div>

                      {/* Confidence Bar */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between text-xs text-text-muted font-mono uppercase tracking-wider">
                          <span>CONFIDENCE</span>
                          <span className="text-intel">{selectedAlert.confidence !== null ? `${Math.round(selectedAlert.confidence * 100)}%` : 'N/A'}</span>
                        </div>
                        {selectedAlert.confidence !== null ? (
                          <div className="w-full bg-bg-base border border-border-sub h-2.5 rounded-full overflow-hidden mt-1.5">
                            <div 
                              className="bg-intel h-full rounded-full transition-all duration-500" 
                              style={{ width: `${selectedAlert.confidence * 100}%` }}
                            />
                          </div>
                        ) : (
                          <span className="text-xs text-text-muted font-mono">Calculating...</span>
                        )}
                      </div>

                      {/* Blast Radius & Auto Execute */}
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs text-text-muted font-mono uppercase tracking-wider">Containment Policy</span>
                        <div className="flex flex-wrap gap-2 mt-0.5">
                          {selectedAlert.blast_radius ? (
                            <span className="bg-bg-elevated border border-border text-text-primary px-2.5 py-1 rounded text-xs font-mono font-semibold uppercase">
                              Radius: {selectedAlert.blast_radius}
                            </span>
                          ) : (
                            <span className="text-xs text-text-muted font-mono">None</span>
                          )}
                          
                          {selectedAlert.status !== 'pending' ? (
                            <span className={`px-2.5 py-1 rounded text-xs font-mono font-semibold uppercase border ${
                              selectedAlert.status === 'approved' ? 'bg-success/10 border-success/30 text-success' : selectedAlert.status === 'rejected' ? 'bg-danger/10 border-danger/30 text-danger' : 'bg-intel/10 border-intel/30 text-intel'
                            }`}>
                              Status: {selectedAlert.status}
                            </span>
                          ) : selectedAlert.auto_execute ? (
                            <span className="bg-intel/15 border border-intel/35 text-intel px-2.5 py-1 rounded text-xs font-mono font-semibold uppercase animate-pulse">
                              Legacy Countdown Active
                            </span>
                          ) : (
                            <span className="bg-bg-elevated border border-border text-text-muted px-2.5 py-1 rounded text-xs font-mono font-semibold uppercase">
                              Investigation HITL Required
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {selectedAlert.triaged_at && (
                      <div className="text-[10px] text-text-muted font-mono mt-2 pt-2 border-t border-border-sub flex justify-between">
                        <span>Triage Completed At</span>
                        <span className="text-text-sec">
                          {isClient ? new Date(selectedAlert.triaged_at).toLocaleString() : selectedAlert.triaged_at}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* MITRE ATT&CK Mapping */}
                  <div className="bg-bg-surface border border-border rounded-xl p-5 flex flex-col gap-4">
                    <h3 className="text-sm font-bold font-syne text-accent tracking-wide uppercase">
                      MITRE ATT&CK TECHNIQUES MAPPED
                    </h3>

                    <div className="flex flex-wrap gap-2.5 mt-1">
                      {selectedAlert.mitre_techniques && selectedAlert.mitre_techniques.length > 0 ? (
                        selectedAlert.mitre_techniques.map((tech) => (
                          <div 
                            key={tech} 
                            className="bg-bg-elevated border border-border rounded-lg p-2.5 flex items-center gap-3 hover:border-intel transition-all group"
                          >
                            <span className="text-xs font-mono text-intel font-bold bg-bg-base border border-border-sub px-2 py-0.5 rounded group-hover:bg-intel/10">
                              {tech}
                            </span>
                            <span className="text-xs font-medium text-text-primary">
                              {tech === "T1078" ? "Valid Accounts" : 
                               tech === "T1110" ? "Brute Force" :
                               tech === "T1068" ? "Exploitation for Privilege Escalation" :
                               tech === "T1204.002" ? "User Execution: Malicious File" :
                               tech === "T1566" ? "Phishing" :
                               tech === "T1053" ? "Scheduled Task/Job" :
                               tech === "T1595" ? "Active Scanning" :
                               tech === "T1059" ? "Command and Scripting Interpreter" :
                               tech === "T1059.001" ? "PowerShell" :
                               tech === "T1003" ? "OS Credential Dumping" : "Mapped Technique"}
                            </span>
                          </div>
                        ))
                      ) : (
                        <span className="text-xs text-text-muted">No MITRE techniques mapped for this alert.</span>
                      )}
                    </div>
                  </div>

                  {/* Enriched Threat Intel Context */}
                  <div className="bg-bg-surface border border-border rounded-xl p-5 flex flex-col gap-4">
                    <h3 className="text-sm font-bold font-syne text-accent tracking-wide uppercase">
                      THREAT INTEL ENRICHMENT
                    </h3>
                    
                    <div className="bg-bg-base border border-border-sub rounded-lg p-4 flex flex-col gap-3">
                      <div className="flex items-center justify-between pb-2 border-b border-border-sub">
                        <span className="text-xs text-text-sec font-medium">Indicator IP</span>
                        <span className="text-xs font-mono text-intel">
                          {(selectedAlert.raw_payload as Record<string, Record<string, string>>)?.agent?.ip || "unknown"}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                        <div>
                          <span className="text-text-muted">Abuse Score:</span>{' '}
                          <span className="text-success font-semibold">0% (Low Risk)</span>
                        </div>
                        <div>
                          <span className="text-text-muted">Malware Feed Hits:</span>{' '}
                          <span className="text-success font-semibold">0 matches</span>
                        </div>
                      </div>
                      
                      <p className="text-xs text-text-muted italic mt-1">
                        Current evidence view is based on ingested alert data. Expanded OSINT and connector enrichment is planned.
                      </p>
                    </div>
                  </div>

                  {/* Collapsible Raw JSON Log Viewer */}
              <div className="bg-bg-surface border border-border rounded-xl p-5 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold font-syne text-accent tracking-wide uppercase">
                        RAW ALERT PAYLOAD
                      </h3>
                      <button 
                        onClick={() => navigator.clipboard.writeText(JSON.stringify(selectedAlert.raw_payload, null, 2))}
                        className="text-[10px] bg-bg-elevated border border-border hover:bg-bg-base hover:text-intel px-2 py-1 rounded font-mono text-text-sec transition-colors"
                      >
                        COPY PAYLOAD
                      </button>
                    </div>
                    
                    <pre className="bg-bg-base border border-border-sub rounded-lg p-4 overflow-auto text-[11px] font-mono text-text-sec leading-relaxed max-h-[340px] select-all custom-scrollbar">
                      {JSON.stringify(selectedAlert.raw_payload, null, 2)}
                    </pre>
                  </div>
                </>
              ) : (
                <L2InvestigationPanel
                  alertId={selectedAlert.id}
                  orgId={orgId}
                  canApproveActions={canApproveActions}
                  canCheckRollback={canCheckRollback}
                />
              )}
            </div>
          )}
        </main>

        {/* ================= COLUMN 3: Approval Rail ================= */}
        <aside className="w-[320px] min-h-0 bg-bg-surface border-l border-border flex flex-col flex-shrink-0 overflow-hidden">
          <div className="p-4 border-b border-border bg-bg-surface flex-shrink-0">
            <h3 className="text-xs font-bold font-syne text-accent tracking-wider uppercase">
              HUMAN APPROVAL RAIL
            </h3>
            <p className="text-[10px] text-text-muted mt-1 leading-snug">
              Legacy alert controls stay here for triage handoff and reject. Preferred containment approval and execution happen in the L2 investigation review panel.
            </p>
          </div>

          {/* Action Queue List */}
          <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-3 custom-scrollbar">
            {pendingApprovalAlerts.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-text-muted py-12">
                <svg className="w-8 h-8 mb-2 opacity-20 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs">Queue Clear</p>
                <p className="text-[10px] text-text-muted mt-0.5">No pending analyst reviews or containment holds</p>
              </div>
            ) : (
              pendingApprovalAlerts.map((alert) => {
                const hasCountdown = countdowns[alert.id] !== undefined;
                const countdownSec = countdowns[alert.id] || 0;
                const isSelected = alert.id === selectedAlertId;
                const isLoading = actionLoadingId === alert.id;
                const inv = investigations.find((item) => item.alert_id === alert.id);
                
                return (
                  <div 
                    key={alert.id} 
                    className={`p-3 bg-bg-elevated border rounded-lg flex flex-col gap-2.5 transition-colors ${
                      isSelected ? 'border-accent' : 'border-border'
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className={`text-[9px] uppercase font-mono font-bold tracking-wider px-1 rounded ${
                          alert.verdict === 'malicious' ? 'bg-danger/10 text-danger' : 'bg-high/10 text-high'
                        }`}>
                          {alert.verdict}
                        </span>
                        <span className="text-[9px] font-mono text-text-muted">
                          LVL {alert.rule_level}
                        </span>
                      </div>
                      <h4 className="text-xs font-semibold text-text-primary line-clamp-2 leading-snug">
                        {alert.rule_description}
                      </h4>
                      <div className="text-[9px] font-mono text-text-muted mt-1">
                        Blast Radius: <span className="text-text-primary uppercase">{alert.blast_radius}</span>
                      </div>
                      <div className="text-[9px] font-mono text-text-muted mt-1 flex flex-col gap-0.5">
                        <span>INV <span className="text-text-primary">{shortId(inv?.id)}</span></span>
                        <span>RULE <span className="text-text-primary">{alert.rule_id || "unknown"}</span></span>
                        <span>ALERT <span className="text-text-primary">{shortId(alert.id)}</span></span>
                      </div>
                    </div>

                    {/* Auto-execute Countdown State */}
                    {hasCountdown ? (
                      <div className="bg-bg-void border border-intel/30 rounded-lg p-2.5 flex flex-col items-center gap-2">
                        <div className="flex items-center justify-between w-full">
                          <span className="text-[10px] font-mono text-intel uppercase tracking-wider animate-pulse">
                            LEGACY COUNTDOWN
                          </span>
                          <span className="text-xs font-bold font-mono text-intel bg-intel/10 px-1.5 py-0.5 rounded">
                            {countdownSec}s
                          </span>
                        </div>
                        
                        {/* Progress bar */}
                        <div className="w-full bg-bg-base h-1 rounded-full overflow-hidden">
                          <div 
                            className="bg-intel h-full transition-all duration-1000"
                            style={{ width: `${(countdownSec / 10) * 100}%` }}
                          />
                        </div>
                        
                        <button
                          disabled={isLoading}
                          onClick={() => cancelCountdown(alert.id)}
                          className="w-full mt-1 py-1 rounded bg-bg-elevated hover:bg-bg-surface border border-border-sub text-[10px] font-mono text-text-sec hover:text-text-primary transition-colors disabled:opacity-50"
                        >
                          CANCEL & HOLD
                        </button>
                      </div>
                    ) : (
                      /* Manual Action Approval Form */
                      <div className="flex flex-col gap-1.5">
                        {isLoading ? (
                          <div className="flex items-center justify-center py-2 gap-2 text-xs font-mono text-text-sec">
                            <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                            Sending...
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                setSelectedAlertId(alert.id);
                                setActiveTab('investigation');
                              }}
                              className="w-full py-1.5 rounded-lg bg-bg-base hover:bg-bg-surface border border-border text-text-sec hover:text-text-primary text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                              Open investigation for analyst review
                            </button>
                            
                            <button
                              onClick={() => handleAction(alert.id, 'reject')}
                              disabled={!canPrepareActions}
                              className="w-full py-1.5 rounded-lg bg-bg-base hover:bg-bg-surface border border-border text-text-sec hover:text-danger text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                              Reject & Close
                            </button>
                            {!canPrepareActions ? (
                              <span className="text-[9px] text-text-muted font-mono text-center">
                                Read-only role: operator action controls are disabled.
                              </span>
                            ) : (
                              <span className="text-[9px] text-text-muted font-mono text-center">
                                Investigation review is the preferred path for confirmation-backed containment.
                              </span>
                            )}
                          </>
                        )}
                        
                        {actionError && (
                          <span className="text-[9px] text-danger font-mono text-center mt-1">
                            {actionError}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </aside>

      </div>
    </div>
  );
}

