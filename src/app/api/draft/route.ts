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
import { generateDraftDocumentTitle } from "@/lib/generate-thread-title";
import {
  appendRegulatoryContextToSystem,
  retrieveRegulatoryContext,
} from "@/lib/regulatory-rag";
import { buildDraftInsertRow } from "@/lib/drafted-agreements-db";

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

type DraftSend = (d: object) => Promise<void>;

async function pulseWhile<T>(
  send: (d: object) => Promise<void>,
  messages: string[],
  fn: () => Promise<T>,
  intervalMs = 4500,
): Promise<T> {
  if (messages.length === 0) return fn();

  let index = 0;
  const tick = () => {
    void send({ type: "pulse", text: messages[index % messages.length] });
    index += 1;
  };

  tick();
  const pulse = setInterval(tick, intervalMs);
  try {
    return await fn();
  } finally {
    clearInterval(pulse);
  }
}

async function generatePlan(
  send: DraftSend,
  options: {
    provider: RedlineProvider;
    modelId: string;
    repairProvider: RedlineProvider;
    repairModelId: string;
    displayName: string;
    planUserMsg: string;
    corpusContext: string;
    typeLabel: string;
  },
): Promise<DraftPlanShape> {
  const planSystem = appendRegulatoryContextToSystem(
    PLAN_SYSTEM,
    options.corpusContext,
    "Regulatory corpus excerpts (ground frameworks and obligations in these where relevant):",
  );

  const planPulseMessages = [
    `Searching ${options.typeLabel} requirements against Norvar's regulatory corpus...`,
    `${options.displayName} is mapping applicable privacy, AI, and security frameworks...`,
    "Checking GDPR, CCPA, and related corpus clauses for your jurisdictions...",
    "Still planning the agreement structure — this usually takes 30–90 seconds...",
  ];

  await send({
    type:  "step",
    text:  `Planning structure with ${options.displayName}...`,
    state: "active",
  });

  let planResponse;
  try {
    planResponse = await pulseWhile(
      send,
      planPulseMessages,
      () => generateRedlineText({
        provider:     options.provider,
        modelId:      options.modelId,
        systemPrompt: planSystem,
        userMsg:      options.planUserMsg,
        maxTokens:    2000,
      }),
    );
  } catch (err) {
    console.error("Draft plan generation failed:", err);
    throw new Error(`${options.displayName} could not plan the agreement. Check your connection and try again.`);
  }

  try {
    const plan = parseJsonSlice<DraftPlanShape>(planResponse.text, "{");
    await send({
      type:  "step",
      text:  `Planning structure with ${options.displayName}...`,
      state: "done",
    });
    return plan;
  } catch (parseErr) {
    console.error("Draft plan parse failed:", parseErr, { length: planResponse.text.length });
    await send({
      type:  "step",
      text:  "Plan response was not valid JSON — retrying with a repair model...",
      state: "active",
    });

    const repairResponse = await pulseWhile(
      send,
      [
        "Repair model is re-reading the plan request...",
        "Trying a simpler structure pass — almost there...",
      ],
      () => generateRedlineText({
        provider:     options.repairProvider,
        modelId:      options.repairModelId,
        systemPrompt: planSystem,
        userMsg:      [
          options.planUserMsg,
          "",
          "Return ONLY valid JSON matching the required plan shape. No markdown fences.",
        ].join("\n"),
        maxTokens: 2000,
      }),
    );

    try {
      const plan = parseJsonSlice<DraftPlanShape>(repairResponse.text, "{");
      await send({
        type:  "step",
        text:  "Recovered agreement plan on second attempt",
        state: "done",
      });
      return plan;
    } catch {
      throw new Error("Failed to plan agreement structure. Please try again.");
    }
  }
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
  send?:         DraftSend,
  displayName?:  string,
): Promise<DraftClause[]> {
  const userMsg = [
    context,
    "",
    `Now draft Section ${sectionNumber}: ${sectionTitle}`,
    `Write exactly ${clauseCount} clauses (numbered ${sectionNumber}.1 through ${sectionNumber}.${clauseCount}).`,
    "Return only a JSON array of clause objects.",
  ].join("\n");

  const pulseMessages = displayName && send
    ? [
        `${displayName} is drafting Section ${sectionNumber}: ${sectionTitle}...`,
        `Writing ~${clauseCount} clauses grounded in the regulatory corpus...`,
        `Section ${sectionNumber} is still generating — large sections can take a minute...`,
      ]
    : [];

  const run = () => generateRedlineText({
    provider:     llmProvider,
    modelId,
    systemPrompt,
    userMsg,
    maxTokens,
  });

  const response = send && pulseMessages.length > 0
    ? await pulseWhile(send, pulseMessages, run, 5000)
    : await run();

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
        displayName,
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
      await send({ type: "step", text: "Analysing your inputs...", state: "done" });

      await send({ type: "step", text: "Searching Norvar regulatory corpus...", state: "active" });

      const ragQuery = [
        typeLabel,
        jurisdictions.length ? jurisdictions.join(", ") : "",
        context,
        "privacy terms data protection acceptable use",
      ].filter(Boolean).join(". ");

      let corpusContext = "";
      try {
        const { chunks, contextBlock: ragBlock } = await pulseWhile(
          send,
          [
            "Embedding your agreement scope for corpus search...",
            "Querying regulatory_chunks in Supabase...",
            "Matching GDPR, CCPA, and related frameworks to your jurisdictions...",
          ],
          () => retrieveRegulatoryContext(supabase, ragQuery, {
            matchThreshold: 0.38,
            matchCount:     10,
            minSimilarity:  0.38,
          }),
          4000,
        );
        corpusContext = ragBlock;
        const refs = [...new Set(chunks.map(c => c.reg_abbr).filter(Boolean))].slice(0, 6);
        await send({
          type:  "step",
          text:  refs.length > 0
            ? `Corpus search complete — ${chunks.length} excerpts (${refs.join(", ")})`
            : "Corpus search complete — drafting from model knowledge",
          state: "done",
        });
      } catch (ragErr) {
        console.error("Draft corpus retrieval failed:", ragErr);
        await send({
          type:  "step",
          text:  "Corpus search unavailable — continuing with model knowledge",
          state: "done",
        });
      }

      const planUserMsg = [
        `Plan a complete ${typeLabel}.`,
        contextBlock,
        `Use "${provider_name}" and "${customer_name}" throughout.`,
      ].join("\n");

      let plan: DraftPlanShape;
      try {
        plan = await generatePlan(send, {
          provider,
          modelId,
          repairProvider,
          repairModelId,
          displayName,
          planUserMsg,
          corpusContext,
          typeLabel,
        });
      } catch (planErr) {
        await send({
          type: "error",
          text: planErr instanceof Error ? planErr.message : "Failed to plan agreement structure.",
        });
        await writer.close();
        return;
      }

      const frameworkList = plan.frameworks?.slice(0, 6).join(", ") || "applicable frameworks";
      await send({
        type:  "step",
        text:  `Frameworks mapped — ${frameworkList}`,
        state: "done",
      });

      await send({ type: "step", text: "Building agreement structure...", state: "active" });

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

      const sectionSystemPrompt = appendRegulatoryContextToSystem(
        SECTION_SYSTEM(resolvedAgent === "nora" ? NORA_DRAFT_PROMPT : CASSIUS_DRAFT_PROMPT),
        corpusContext,
        "Regulatory corpus excerpts (ground clause obligations in these where relevant):",
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
            send,
            displayName,
          );
        } catch (sectionErr) {
          console.error(`Section ${section.number} draft failed:`, sectionErr);
          await send({
            type: "status",
            text: `Section ${section.number} failed — retrying with repair model...`,
          });
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
              send,
              `${displayName} (repair)`,
            );
            await send({
              type: "status",
              text: `Section ${section.number} recovered on second attempt`,
            });
          } catch {
            await send({
              type: "status",
              text: `Section ${section.number} could not be drafted — inserting placeholder`,
            });
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
      await send({ type: "step", text: "Validating clauses against corpus...", state: "done" });

      await send({ type: "step", text: "Checking for missing provisions...", state: "active" });
      await send({ type: "step", text: "Checking for missing provisions...", state: "done" });

      await send({ type: "step", text: "Compiling drafting notes...", state: "active" });
      await send({
        type:  "step",
        text:  `Done — ${plan.sections.length} sections, ${totalClauses} clauses`,
        state: "done",
      });

      const documentTitle = await generateDraftDocumentTitle({
        agreementTypeLabel: typeLabel,
        providerName:       provider_name,
        customerName:       customer_name,
        jurisdictions,
        context,
      });

      const draft: DraftOutput = {
        agreement_type:     plan.agreement_type || typeLabel,
        agreement_type_key: agreement_type,
        title:              documentTitle,
        document_name:      documentTitle,
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
          .insert(buildDraftInsertRow({
            user_id:        userId,
            agent:          resolvedAgent,
            agreement_type: typeLabel,
            governing_law:  draft.governing_law || null,
            result:         draft,
          }))
          .select("id")
          .single();

        if (insertErr) {
          console.error("Draft save error:", insertErr);
          await send({
            type: "error",
            text: insertErr.message?.includes("drafted_agreements")
              ? "Draft completed but could not be saved. Run SETUP_DRAFTED_AGREEMENTS.sql in Supabase."
              : `Draft completed but could not be saved: ${insertErr.message}`,
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
