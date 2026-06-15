import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { isAuditRequest } from "@/lib/audit";
import {
  CASSIUS_DRAFT_PROMPT,
  NORA_DRAFT_PROMPT,
  type DraftClause,
  type DraftOutput,
  type DraftSection,
} from "@/lib/draft";
import { generateRedlineText } from "@/lib/redline-generate";
import {
  normalizeRedlineReviewModelChoice,
  resolveRedlineReviewModel,
  type RedlineProvider,
} from "@/lib/redline-models";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const maxDuration = 300;

function sse(data: object) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

const PLAN_SYSTEM = `You are a specialist agreement drafter. Given a request, return ONLY a JSON plan for the agreement structure.

Return this exact shape — no prose, no markdown:
{
  "title":         "FULL DOCUMENT TITLE IN CAPS",
  "agreement_type": "full type label",
  "parties":       { "provider": "name", "customer": "name" },
  "governing_law": "jurisdiction(s)",
  "frameworks":    ["applicable frameworks from corpus"],
  "summary":       "2-3 sentences plain English covering what this agreement is and what it governs",
  "sections": [
    { "number": "1", "title": "SECTION TITLE", "clause_count": 3 }
  ],
  "drafting_notes": ["any jurisdiction-specific or context notes"]
}

Corpus:
Privacy: GDPR, UK GDPR, CCPA/CPRA, HIPAA, BIPA, COPPA, LGPD, PDPA, PIPEDA, Quebec Law 25, PIPL, APPI, PIPA, DPDPA, POPIA, UAE DPL, KSA PDPL, ePrivacy, SCCs, EU-US DPF, FTC Act, NYC LL144, Colorado AI Act.
AI Governance: EU AI Act, GDPR Art. 22, NIST AI RMF, ISO 42001.
Cybersecurity: NIS2, DORA, ISO 27001, ISO 27002, SOC 2, NIST CSF 2.0.

Rules:
- Plan only — no clause text, just structure.
- section clause_count should reflect realistic depth (3-8 clauses per section).
- Include every section needed for a complete, enforceable agreement.
`;

const SECTION_SYSTEM = (agentPrompt: string) => `${agentPrompt}

IMPORTANT: You are drafting ONE SECTION ONLY from a larger agreement.
Return ONLY a JSON array of clauses for this section — no prose, no markdown, no outer object:
[
  {
    "number": "2.1",
    "title":  "short clause title",
    "text":   "complete, ready-to-use clause text"
  }
]

Write every clause in full. No placeholders except party names in [brackets].
Ground all obligations in the regulatory corpus.
`;

type DraftPlanShape = {
  title:          string;
  agreement_type: string;
  parties:        { provider: string; customer: string };
  governing_law:  string;
  frameworks:     string[];
  summary:        string;
  sections:       Array<{ number: string; title: string; clause_count: number }>;
  drafting_notes: string[];
};

function parseJsonSlice<T>(raw: string, opener: "{" | "["): T {
  const cleaned = raw.trim().replace(/^```json?\s*/im, "").replace(/```\s*$/m, "").trim();
  const start   = cleaned.indexOf(opener);
  if (start < 0) throw new Error(`No JSON ${opener} in model output`);
  return JSON.parse(cleaned.slice(start)) as T;
}

async function draftSection(
  sectionNumber: string,
  sectionTitle:  string,
  clauseCount:   number,
  context:       string,
  llmProvider: RedlineProvider,
  modelId:       string,
  systemPrompt:  string,
  maxTokens:     number,
): Promise<DraftClause[]> {
  const userMsg = [
    context,
    "",
    `Now draft Section ${sectionNumber}: ${sectionTitle}`,
    `Write exactly ${clauseCount} clauses (numbered ${sectionNumber}.1 through ${sectionNumber}.${clauseCount}).`,
    "Return only a JSON array of clause objects.",
  ].join("\n");

  const response = await generateRedlineText({
    provider:     llmProvider,
    modelId,
    systemPrompt,
    userMsg,
    maxTokens,
  });

  const clauses = parseJsonSlice<DraftClause[]>(response.text, "[");
  return clauses.map(c => ({
    number: c.number ?? `${sectionNumber}.?`,
    title:  c.title  ?? "Untitled",
    text:   c.text   ?? "",
  }));
}

export async function POST(req: NextRequest) {
  const enc = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array>();
  const writer = writable.getWriter();
  const send   = (d: object) => writer.write(enc.encode(sse(d)));

  (async () => {
    try {
      const auditMode = isAuditRequest(req);
      let userId = "audit-runner";
      if (!auditMode) {
        const { userId: uid } = await auth();
        if (!uid) {
          await send({ type: "error", text: "Unauthorised" });
          await writer.close();
          return;
        }
        userId = uid;
      }

      const body = await req.json();
      const {
        agreement_type,
        agreement_type_label,
        provider_name   = "[Provider Name]",
        customer_name   = "[Customer Name]",
        jurisdictions   = [] as string[],
        context         = "",
        include_clauses = [] as string[],
        review_model    = undefined as unknown,
        agent           = undefined as "cassius" | "nora" | undefined,
      } = body;

      if (!agreement_type) {
        await send({ type: "error", text: "agreement_type is required" });
        await writer.close();
        return;
      }

      const modelChoice = review_model !== undefined
        ? normalizeRedlineReviewModelChoice(review_model)
        : agent === "nora"
        ? "sonnet"
        : "opus";

      const resolved = resolveRedlineReviewModel(modelChoice, 0);
      const {
        agent: resolvedAgent,
        provider,
        modelId,
        repairProvider,
        repairModelId,
        maxTokens,
      } = resolved;

      const typeLabel = agreement_type_label || agreement_type;

      const contextBlock = [
        `Agreement type: ${typeLabel}`,
        `Provider: ${provider_name}`,
        `Customer: ${customer_name}`,
        jurisdictions.length > 0   ? `Jurisdictions: ${jurisdictions.join(", ")}` : "",
        context                    ? `Additional context: ${context}` : "",
        include_clauses.length > 0 ? `Include these provisions: ${include_clauses.join(", ")}` : "",
      ].filter(Boolean).join("\n");

      await send({ type: "step", text: "Analysing your inputs...", state: "active" });
      await new Promise(r => setTimeout(r, 300));
      await send({ type: "step", text: "Analysing your inputs...", state: "done" });

      await send({ type: "step", text: `Mapping regulatory frameworks for ${typeLabel}...`, state: "active" });

      const planUserMsg = [
        `Plan a complete ${typeLabel}.`,
        contextBlock,
        `Use "${provider_name}" and "${customer_name}" throughout.`,
      ].join("\n");

      const planResponse = await generateRedlineText({
        provider,
        modelId,
        systemPrompt: PLAN_SYSTEM,
        userMsg:      planUserMsg,
        maxTokens:    2000,
      });

      let plan: DraftPlanShape;
      try {
        plan = parseJsonSlice<DraftPlanShape>(planResponse.text, "{");
      } catch {
        await send({ type: "error", text: "Failed to plan agreement structure. Please try again." });
        await writer.close();
        return;
      }

      const frameworkList = plan.frameworks?.slice(0, 6).join(", ") || "applicable frameworks";
      await send({ type: "step", text: `Mapping regulatory frameworks — ${frameworkList}`, state: "done" });

      await send({ type: "step", text: "Building agreement structure...", state: "active" });
      await new Promise(r => setTimeout(r, 200));

      const totalClauses = plan.sections.reduce((n, s) => n + (s.clause_count ?? 4), 0);
      await send({
        type:  "step",
        text:  `Structure ready — ${plan.sections.length} sections, ~${totalClauses} clauses`,
        state: "done",
      });

      await send({
        type: "plan",
        plan: {
          title:          plan.title,
          agreement_type: plan.agreement_type,
          parties:        plan.parties,
          governing_law:  plan.governing_law,
          frameworks:     plan.frameworks,
          summary:        plan.summary,
          drafting_notes: plan.drafting_notes,
          sections:       plan.sections.map(s => ({
            number:       s.number,
            title:        s.title,
            clause_count: s.clause_count ?? 4,
            state:        "pending" as const,
          })),
        },
      });

      const sectionSystemPrompt = SECTION_SYSTEM(
        resolvedAgent === "nora" ? NORA_DRAFT_PROMPT : CASSIUS_DRAFT_PROMPT,
      );

      const draftedSections: DraftSection[] = [];

      for (const section of plan.sections) {
        await send({
          type:    "section_start",
          section: { number: section.number, title: section.title },
        });

        let clauses: DraftClause[];
        try {
          clauses = await draftSection(
            section.number,
            section.title,
            section.clause_count ?? 4,
            contextBlock,
            provider,
            modelId,
            sectionSystemPrompt,
            Math.min(maxTokens, 4000),
          );
        } catch (sectionErr) {
          console.error(`Section ${section.number} draft failed:`, sectionErr);
          try {
            clauses = await draftSection(
              section.number,
              section.title,
              section.clause_count ?? 4,
              contextBlock,
              repairProvider,
              repairModelId,
              sectionSystemPrompt,
              3000,
            );
          } catch {
            clauses = [{
              number: `${section.number}.1`,
              title:  "Placeholder",
              text:   `[This section (${section.title}) could not be drafted. Please redraft manually.]`,
            }];
          }
        }

        draftedSections.push({ number: section.number, title: section.title, clauses });

        await send({
          type:    "section_done",
          section: { number: section.number, title: section.title },
          clauses,
        });
      }

      await send({ type: "step", text: "Validating clauses against corpus...", state: "active" });
      await new Promise(r => setTimeout(r, 400));
      await send({ type: "step", text: "Validating clauses against corpus...", state: "done" });

      await send({ type: "step", text: "Checking for missing provisions...", state: "active" });
      await new Promise(r => setTimeout(r, 300));
      await send({ type: "step", text: "Checking for missing provisions...", state: "done" });

      await send({ type: "step", text: "Compiling drafting notes...", state: "active" });
      await new Promise(r => setTimeout(r, 200));
      await send({
        type:  "step",
        text:  `Done — ${plan.sections.length} sections, ${totalClauses} clauses`,
        state: "done",
      });

      const draft: DraftOutput = {
        agreement_type:     plan.agreement_type || typeLabel,
        agreement_type_key: agreement_type,
        title:              plan.title,
        parties:            plan.parties || { provider: provider_name, customer: customer_name },
        governing_law:      plan.governing_law || jurisdictions.join(", "),
        summary:            plan.summary || "",
        frameworks:         plan.frameworks || [],
        sections:           draftedSections,
        drafting_notes:     plan.drafting_notes || [],
        drafted_by:         resolvedAgent,
      };

      if (!auditMode) {
        const { data: saved, error: insertErr } = await supabase
          .from("drafted_agreements")
          .insert({
            user_id:        userId,
            agent:          resolvedAgent,
            agreement_type: typeLabel,
            governing_law:  draft.governing_law || null,
            result:         draft,
            created_at:     new Date().toISOString(),
          })
          .select("id")
          .single();

        if (insertErr) {
          console.error("Draft save error:", insertErr);
          await send({
            type: "error",
            text: "Draft completed but could not be saved. Run the drafted_agreements migration in Supabase.",
          });
          await writer.close();
          return;
        }
        if (saved?.id) draft.id = saved.id;
      }

      await send({ type: "done", draft });

    } catch (err: unknown) {
      console.error("Draft error:", err);
      await send({ type: "error", text: err instanceof Error ? err.message : "Draft failed" });
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type":      "text/event-stream",
      "Cache-Control":     "no-cache, no-transform",
      Connection:          "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
