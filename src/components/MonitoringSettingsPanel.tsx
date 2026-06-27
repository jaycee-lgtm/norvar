"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Github, Gitlab, Trello, Plus, Trash2, Check, Link2, Users } from "lucide-react";
import SettingsSection from "@/components/SettingsSection";

type Provider = "github" | "gitlab" | "jira";

type Connector = {
  id:               string;
  provider:         Provider;
  account_name:     string;
  watched_repos:    string[];
  watched_projects: string[];
  watched_branches: string[];
  status:           "active" | "paused" | "error" | "disconnected";
  last_event_at:    string | null;
};

type OrgConfig = {
  privacy_contact_email:        string;
  ai_governance_contact_email:  string;
  cybersecurity_contact_email:  string;
  admin_email:                  string;
};

type UserMapping = {
  id:              string;
  provider:        Provider;
  external_id:     string;
  external_name:   string;
  norvar_email:    string | null;
};

const PROVIDER_META: Record<Provider, { label: string; icon: React.ReactNode; oauthPath: string }> = {
  github: { label: "GitHub", icon: <Github size={16} />, oauthPath: "/api/monitor/oauth/github" },
  gitlab: { label: "GitLab", icon: <Gitlab size={16} />, oauthPath: "/api/monitor/oauth/gitlab" },
  jira:   { label: "Jira",   icon: <Trello size={16} />, oauthPath: "/api/monitor/oauth/jira" },
};

const STATUS_META = {
  active:       { label: "Active",       color: "var(--rl, #3B6D11)" },
  paused:       { label: "Paused",       color: "var(--fg3)" },
  error:        { label: "Error",        color: "var(--rh, #A32D2D)" },
  disconnected: { label: "Disconnected", color: "var(--fg3)" },
};

function ComplianceContactsPanel({ config, onSave }: { config: OrgConfig; onSave: (c: OrgConfig) => Promise<void> }) {
  const [local, setLocal] = useState(config);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setLocal(config); }, [config]);

  const fields: Array<{ key: keyof OrgConfig; label: string; help: string }> = [
    { key: "admin_email",                 label: "Org admin",              help: "Always notified on every signal" },
    { key: "privacy_contact_email",        label: "Privacy compliance",     help: "Notified when a signal touches Privacy" },
    { key: "ai_governance_contact_email",  label: "AI Governance compliance", help: "Notified when a signal touches AI Governance" },
    { key: "cybersecurity_contact_email",  label: "Cybersecurity compliance", help: "Notified when a signal touches Cybersecurity" },
  ];

  const save = async () => {
    setSaving(true);
    await onSave(local);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ border: "0.5px solid var(--bdr2)", borderRadius: 10, background: "var(--card)", padding: 20, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Users size={14} color="var(--fg3)" />
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)" }}>Compliance contacts</span>
      </div>
      <p style={{ fontSize: 12, color: "var(--fg3)", marginBottom: 16 }}>
        Who gets notified by domain when the Monitoring Agent detects a signal. Every signal also goes to the org admin and the repo/ticket owner.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {fields.map(({ key, label, help }) => (
          <div key={key}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--fg2)", display: "block", marginBottom: 3 }}>
              {label}
            </label>
            <input
              type="email"
              value={local[key]}
              onChange={e => setLocal(prev => ({ ...prev, [key]: e.target.value }))}
              placeholder="email@company.com"
              style={{
                width: "100%", padding: "8px 10px", borderRadius: 6,
                border: "0.5px solid var(--bdr2)", background: "var(--card2)",
                color: "var(--fg)", fontSize: 13, fontFamily: "var(--font-sora, sans-serif)",
              }}
            />
            <p style={{ fontSize: 10, color: "var(--fg3)", marginTop: 3 }}>{help}</p>
          </div>
        ))}
      </div>

      <button onClick={save} disabled={saving} style={{
        marginTop: 16, padding: "8px 18px", borderRadius: 6, border: "none",
        background: saved ? "var(--rl, #3B6D11)" : "var(--fg)",
        color: "var(--bg)", fontSize: 12, fontWeight: 500,
        cursor: saving ? "not-allowed" : "pointer",
        display: "flex", alignItems: "center", gap: 6,
      }}>
        {saved ? <><Check size={12} /> Saved</> : saving ? "Saving..." : "Save contacts"}
      </button>
    </div>
  );
}

function ConnectorCard({ connector, onUpdate, onDisconnect }: {
  connector:    Connector;
  onUpdate:     (id: string, updates: Partial<Connector>) => Promise<void>;
  onDisconnect: (id: string) => Promise<void>;
}) {
  const [reposInput, setReposInput] = useState((connector.watched_repos ?? []).join(", "));
  const [projectsInput, setProjectsInput] = useState((connector.watched_projects ?? []).join(", "));
  const [branchesInput, setBranchesInput] = useState((connector.watched_branches ?? []).join(", "));
  const [editing, setEditing] = useState(false);
  const meta   = PROVIDER_META[connector.provider];
  const status = STATUS_META[connector.status];

  const saveScope = async () => {
    await onUpdate(connector.id, {
      watched_repos:    reposInput.split(",").map(s => s.trim()).filter(Boolean),
      watched_projects: projectsInput.split(",").map(s => s.trim()).filter(Boolean),
      watched_branches: branchesInput.split(",").map(s => s.trim()).filter(Boolean),
    });
    setEditing(false);
  };

  return (
    <div style={{ border: "0.5px solid var(--bdr2)", borderRadius: 10, background: "var(--card)", padding: 16, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={{ color: "var(--fg2)" }}>{meta.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)" }}>{meta.label}</div>
          <div style={{ fontSize: 11, color: "var(--fg3)" }}>{connector.account_name}</div>
        </div>
        <span style={{
          fontSize: 10, padding: "2px 8px", borderRadius: 4,
          background: `${status.color}15`, color: status.color, fontWeight: 600,
        }}>
          {status.label}
        </span>
        <button onClick={() => onDisconnect(connector.id)} style={{
          background: "none", border: "none", cursor: "pointer", color: "var(--fg3)", padding: 4,
        }}>
          <Trash2 size={13} />
        </button>
      </div>

      {connector.last_event_at && (
        <p style={{ fontSize: 10, color: "var(--fg3)", marginBottom: 10 }}>
          Last event: {new Date(connector.last_event_at).toLocaleString()}
        </p>
      )}

      {!editing ? (
        <div style={{ fontSize: 11, color: "var(--fg2)" }}>
          {connector.provider !== "jira" && (
            <div style={{ marginBottom: 4 }}>
              <strong>Repos:</strong> {connector.watched_repos?.length ? connector.watched_repos.join(", ") : "all"}
            </div>
          )}
          {connector.provider === "jira" && (
            <div style={{ marginBottom: 4 }}>
              <strong>Projects:</strong> {connector.watched_projects?.length ? connector.watched_projects.join(", ") : "all"}
            </div>
          )}
          {connector.provider !== "jira" && (
            <div style={{ marginBottom: 8 }}>
              <strong>Branches:</strong> {connector.watched_branches?.join(", ") || "main, master, production"}
            </div>
          )}
          <button onClick={() => setEditing(true)} style={{
            fontSize: 11, color: "var(--fg3)", background: "none", border: "none",
            textDecoration: "underline", cursor: "pointer", padding: 0,
          }}>
            Edit scope
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {connector.provider !== "jira" && (
            <div>
              <label style={{ fontSize: 10, color: "var(--fg3)", display: "block", marginBottom: 3 }}>
                Watched repos (comma separated, blank = all)
              </label>
              <input value={reposInput} onChange={e => setReposInput(e.target.value)}
                placeholder="org/repo1, org/repo2"
                style={{ width: "100%", padding: "6px 9px", borderRadius: 5, border: "0.5px solid var(--bdr2)", background: "var(--card2)", color: "var(--fg)", fontSize: 11 }} />
            </div>
          )}
          {connector.provider === "jira" && (
            <div>
              <label style={{ fontSize: 10, color: "var(--fg3)", display: "block", marginBottom: 3 }}>
                Watched project keys (comma separated, blank = all)
              </label>
              <input value={projectsInput} onChange={e => setProjectsInput(e.target.value)}
                placeholder="ENG, PROD"
                style={{ width: "100%", padding: "6px 9px", borderRadius: 5, border: "0.5px solid var(--bdr2)", background: "var(--card2)", color: "var(--fg)", fontSize: 11 }} />
            </div>
          )}
          {connector.provider !== "jira" && (
            <div>
              <label style={{ fontSize: 10, color: "var(--fg3)", display: "block", marginBottom: 3 }}>
                Watched branches
              </label>
              <input value={branchesInput} onChange={e => setBranchesInput(e.target.value)}
                placeholder="main, production"
                style={{ width: "100%", padding: "6px 9px", borderRadius: 5, border: "0.5px solid var(--bdr2)", background: "var(--card2)", color: "var(--fg)", fontSize: 11 }} />
            </div>
          )}
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={saveScope} style={{
              padding: "5px 12px", borderRadius: 5, border: "none", background: "var(--fg)",
              color: "var(--bg)", fontSize: 11, fontWeight: 500, cursor: "pointer",
            }}>Save</button>
            <button onClick={() => setEditing(false)} style={{
              padding: "5px 12px", borderRadius: 5, border: "0.5px solid var(--bdr2)", background: "transparent",
              color: "var(--fg2)", fontSize: 11, cursor: "pointer",
            }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function UserMappingPanel({ mappings, onAdd, onRemove }: {
  mappings: UserMapping[];
  onAdd:    (provider: Provider, externalId: string, externalName: string, norvarEmail: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [provider, setProvider]   = useState<Provider>("github");
  const [externalId, setExternalId] = useState("");
  const [externalName, setExternalName] = useState("");
  const [norvarEmail, setNorvarEmail] = useState("");

  const submit = async () => {
    if (!externalId.trim() || !norvarEmail.trim()) return;
    await onAdd(provider, externalId.trim(), externalName.trim() || externalId.trim(), norvarEmail.trim());
    setExternalId(""); setExternalName(""); setNorvarEmail("");
  };

  return (
    <div style={{ border: "0.5px solid var(--bdr2)", borderRadius: 10, background: "var(--card)", padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Link2 size={14} color="var(--fg3)" />
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)" }}>User mapping</span>
      </div>
      <p style={{ fontSize: 12, color: "var(--fg3)", marginBottom: 16 }}>
        Map git usernames / Jira account IDs to Norvar email addresses so the repo or ticket owner gets notified directly.
      </p>

      {mappings.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {mappings.map(m => (
            <div key={m.id} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "6px 0",
              borderBottom: "0.5px solid var(--bdr)", fontSize: 12,
            }}>
              <span style={{ color: "var(--fg3)", textTransform: "capitalize", minWidth: 50 }}>{m.provider}</span>
              <span style={{ color: "var(--fg)", flex: 1 }}>{m.external_name}</span>
              <span style={{ color: "var(--fg3)" }}>→</span>
              <span style={{ color: "var(--fg)" }}>{m.norvar_email}</span>
              <button onClick={() => onRemove(m.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg3)" }}>
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 1fr auto", gap: 8, alignItems: "end" }}>
        <div>
          <label style={{ fontSize: 10, color: "var(--fg3)", display: "block", marginBottom: 3 }}>Provider</label>
          <select value={provider} onChange={e => setProvider(e.target.value as Provider)} style={{
            width: "100%", padding: "6px 8px", borderRadius: 5, border: "0.5px solid var(--bdr2)",
            background: "var(--card2)", color: "var(--fg)", fontSize: 11,
          }}>
            <option value="github">GitHub</option>
            <option value="gitlab">GitLab</option>
            <option value="jira">Jira</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 10, color: "var(--fg3)", display: "block", marginBottom: 3 }}>Username / Account ID</label>
          <input value={externalId} onChange={e => setExternalId(e.target.value)} placeholder="jsmith"
            style={{ width: "100%", padding: "6px 8px", borderRadius: 5, border: "0.5px solid var(--bdr2)", background: "var(--card2)", color: "var(--fg)", fontSize: 11 }} />
        </div>
        <div>
          <label style={{ fontSize: 10, color: "var(--fg3)", display: "block", marginBottom: 3 }}>Norvar email</label>
          <input type="email" value={norvarEmail} onChange={e => setNorvarEmail(e.target.value)} placeholder="jane@company.com"
            style={{ width: "100%", padding: "6px 8px", borderRadius: 5, border: "0.5px solid var(--bdr2)", background: "var(--card2)", color: "var(--fg)", fontSize: 11 }} />
        </div>
        <button onClick={submit} style={{
          padding: "6px 12px", borderRadius: 5, border: "none", background: "var(--fg)",
          color: "var(--bg)", fontSize: 11, fontWeight: 500, cursor: "pointer", height: 30,
        }}>
          <Plus size={12} />
        </button>
      </div>
    </div>
  );
}

function MonitoringSettingsPanelInner() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [orgConfig, setOrgConfig]   = useState<OrgConfig>({
    admin_email: "", privacy_contact_email: "", ai_governance_contact_email: "", cybersecurity_contact_email: "",
  });
  const [mappings, setMappings]     = useState<UserMapping[]>([]);
  const [loading, setLoading]       = useState(true);
  const [banner, setBanner]         = useState<{ kind: "ok" | "err" | "info"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [connRes, configRes, mapRes] = await Promise.all([
      fetch("/api/monitor/connectors"),
      fetch("/api/monitor/config"),
      fetch("/api/monitor/mappings"),
    ]);
    const { connectors: c } = await connRes.json().catch(() => ({ connectors: [] }));
    const { config: cfg }   = await configRes.json().catch(() => ({ config: null }));
    const { mappings: m }   = await mapRes.json().catch(() => ({ mappings: [] }));
    setConnectors(c ?? []);
    if (cfg) setOrgConfig(cfg);
    setMappings(m ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const connected = searchParams.get("monitor_connected");
    const account   = searchParams.get("monitor_account");
    const error     = searchParams.get("monitor_error");
    const info      = searchParams.get("monitor_info");

    if (connected === "github") {
      setBanner({
        kind: "ok",
        text: account
          ? `GitHub connected — watching ${account}. Add repo names below, then push or open a PR to test.`
          : "GitHub connected. Add repo names below, then push or open a PR to test.",
      });
      void load();
    } else if (error) {
      setBanner({ kind: "err", text: error });
    } else if (info) {
      setBanner({ kind: "info", text: info });
    } else {
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.delete("monitor_connected");
    url.searchParams.delete("monitor_account");
    url.searchParams.delete("monitor_error");
    url.searchParams.delete("monitor_info");
    router.replace(url.pathname + url.search, { scroll: false });
  }, [searchParams, router, load]);

  const connectProvider = (provider: Provider) => {
    window.location.href = PROVIDER_META[provider].oauthPath;
  };

  const updateConnector = async (id: string, updates: Partial<Connector>) => {
    await fetch("/api/monitor/connectors", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    });
    void load();
  };

  const disconnectConnector = async (id: string) => {
    if (!confirm("Disconnect this provider? Existing signals will be kept.")) return;
    await fetch("/api/monitor/connectors", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    void load();
  };

  const saveOrgConfig = async (config: OrgConfig) => {
    await fetch("/api/monitor/config", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    setOrgConfig(config);
  };

  const addMapping = async (provider: Provider, externalId: string, externalName: string, norvarEmail: string) => {
    await fetch("/api/monitor/mappings", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, external_id: externalId, external_name: externalName, norvar_email: norvarEmail }),
    });
    void load();
  };

  const removeMapping = async (id: string) => {
    await fetch("/api/monitor/mappings", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    void load();
  };

  const connectedProviders = new Set(connectors.map(c => c.provider));

  return (
    <SettingsSection
      label="Monitoring"
      title="Monitoring Agent"
      description="Watch repos, merge requests, and Jira tickets for compliance-relevant changes in real time."
    >
      {loading ? (
        <p style={{ fontSize: 12, color: "var(--fg3)" }}>Loading...</p>
      ) : (
        <div style={{ maxWidth: 680 }}>
          {banner && (
            <div style={{
              marginBottom: 16, padding: "10px 14px", borderRadius: 8, fontSize: 12, lineHeight: 1.5,
              border: "0.5px solid var(--bdr2)",
              background: banner.kind === "ok" ? "var(--rl-bg, rgba(59,109,17,0.08))"
                : banner.kind === "err" ? "var(--rh-bg, rgba(163,45,45,0.08))"
                : "var(--card2)",
              color: banner.kind === "ok" ? "var(--rl, #3B6D11)"
                : banner.kind === "err" ? "var(--rh, #A32D2D)"
                : "var(--fg2)",
            }}>
              {banner.text}
            </div>
          )}

          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
              Connected sources
            </div>

            {connectors.map(c => (
              <ConnectorCard key={c.id} connector={c} onUpdate={updateConnector} onDisconnect={disconnectConnector} />
            ))}

            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              {(["github", "gitlab", "jira"] as Provider[]).filter(p => !connectedProviders.has(p)).map(p => (
                <button key={p} onClick={() => connectProvider(p)} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "8px 14px", borderRadius: 6, border: "0.5px dashed var(--bdr2)",
                  background: "transparent", color: "var(--fg2)", fontSize: 12, fontWeight: 500, cursor: "pointer",
                }}>
                  {PROVIDER_META[p].icon} Connect {PROVIDER_META[p].label}
                </button>
              ))}
            </div>
          </div>

          <ComplianceContactsPanel config={orgConfig} onSave={saveOrgConfig} />
          <UserMappingPanel mappings={mappings} onAdd={addMapping} onRemove={removeMapping} />
        </div>
      )}
    </SettingsSection>
  );
}

export default function MonitoringSettingsPanel() {
  return (
    <Suspense fallback={null}>
      <MonitoringSettingsPanelInner />
    </Suspense>
  );
}
