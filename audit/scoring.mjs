// Norvar — Sprint 1 audit scoring (synonym-aware)
//
// Frameworks and concepts are matched against curated alias patterns rather
// than exact substrings, so "Data Processing Agreement", "DPA", and
// "data processing agreements" all count as the same hit. Terms without an
// alias entry fall back to literal (case-insensitive) matching.

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Canonical term → regex alternatives (tested against the lowercased response).
const ALIASES = {
  // ── Frameworks ────────────────────────────────────────────────────────────
  "GDPR":                        [/\bgdpr\b/, /general data protection regulation/],
  "CCPA/CPRA":                   [/\bccpa\b/, /\bcpra\b/, /california consumer privacy/, /california privacy rights/],
  "BIPA":                        [/\bbipa\b/, /biometric information privacy act/],
  "CUBI":                        [/\bcubi\b/, /capture or use of biometric identifier/],
  "HIPAA":                       [/\bhipaa\b/],
  "FTC Act":                     [/ftc act/, /\bftc\b/, /federal trade commission/, /section 5\b/],
  "state privacy laws":          [/state privacy law/, /state-level privacy/, /state comprehensive privacy/, /my health my data/, /washington my health/, /state biometric/, /texas.{0,30}privacy/],
  "SCCs":                        [/\bsccs?\b/, /standard contractual clauses/],
  "GDPR Chapter V":              [/chapter v\b/, /art(?:icle)?s?\.?\s*4[4-9]\b/],
  "EU AI Act":                   [/eu ai act/, /\bai act\b/],
  "NYC Local Law 144":           [/local law 144/, /\bll[ -]?144\b/],
  "GDPR Art. 22":                [/art(?:icle)?\.?\s*22\b/],
  "NIST AI RMF":                 [/nist ai rmf/, /\bai rmf\b/, /ai risk management framework/],
  "French data protection law":  [/\bcnil\b/, /french data protection/, /loi informatique/],
  "DORA":                        [/\bdora\b/, /digital operational resilience/],
  "NIS2":                        [/\bnis ?2\b/, /\bnis-2\b/],
  "HIPAA Security Rule":         [/security rule/],
  "NIST CSF":                    [/nist csf/, /nist cybersecurity framework/, /\bcsf\b/],
  "SOC 2":                       [/soc ?2\b/],
  "ISO 27001":                   [/iso[ /]?27001/, /iso\/iec 27001/],
  "GDPR Art. 28":                [/art(?:icle)?\.?\s*28\b/],

  // ── Concepts ──────────────────────────────────────────────────────────────
  "lawful basis":                 [/lawful basis/, /legal basis/],
  "lawful basis for processing":  [/lawful basis/, /legal basis/],
  "data subject rights":          [/data subject right/, /right (?:to|of) (?:access|erasure|deletion|rectification)/, /access, deletion/],
  "privacy notice":               [/privacy notice/, /privacy policy/, /notice at collection/],
  "cross-border transfers":       [/cross-border/, /international (?:data )?transfer/, /transfer.{0,30}(?:mechanism|outside)/],
  "international transfer":       [/international (?:data )?transfer/, /cross-border/, /transfer.{0,30}(?:mechanism|outside the)/],
  "biometric data":               [/biometric/],
  "written consent":              [/written (?:consent|release|authori[sz]ation)/, /informed written/],
  "retention policy":             [/retention/],
  "destruction schedule":         [/destruction/, /destroy/, /permanently delete/],
  "private right of action":      [/private right of action/],
  "PHI":                          [/\bphi\b/, /\bephi\b/, /protected health information/],
  "covered entity":               [/covered entit/],
  "business associate":           [/business associate/],
  "sensitive data":               [/sensitive (?:data|personal|information|pi\b|categor)/, /special categor/],
  "opt-in consent":               [/opt[- ]in/, /affirmative (?:express )?consent/, /express consent/],
  "adequacy decision":            [/adequacy/],
  "standard contractual clauses": [/standard contractual clauses/, /\bsccs?\b/],
  "transfer impact assessment":   [/transfer impact assessment/, /\btia\b/],
  "high-risk AI":                 [/high[- ]risk/],
  "human oversight":              [/human oversight/, /human review/, /human[- ]in[- ]the[- ]loop/, /meaningful human/],
  "automated decision-making":    [/automated decision/, /automated individual decision/, /solely automated/],
  "bias audit":                   [/bias audit/, /independent audit.{0,30}bias/],
  "transparency":                 [/transparen/],
  "AI-generated content disclosure": [/(?:ai|machine)[- ]generated/, /synthetic (?:content|media)/, /deepfake/],
  "deceptive practices":          [/deceptive/, /deception/, /unfair or deceptive/],
  "risk management":              [/risk management/, /risk[- ]management/],
  "GPAI":                         [/\bgpai\b/, /general[- ]purpose ai/],
  "training data":                [/training data/, /trained on/, /train(?:ing)? (?:the )?model/],
  "data minimisation":            [/data minimi[sz]ation/, /minimi[sz]ation/],
  "purpose limitation":           [/purpose limitation/],
  "model governance":             [/model governance/, /ai governance/, /model risk/, /model documentation/],
  "prohibited AI practice":       [/prohibit/],
  "real-time biometric surveillance": [/real[- ]time (?:remote )?biometric/, /remote biometric identification/],
  "law enforcement exception":    [/law enforcement/],
  "CNIL":                         [/\bcnil\b/],
  "breach notification":          [/breach notification/, /notif(?:y|ication)/],
  "72-hour window":               [/72[- ]hours?/, /seventy-two hours?/],
  "supervisory authority":        [/supervisory authorit/, /data protection authorit/],
  "incident response":            [/incident response/, /incident[- ]response/, /respond(?:ing)? to (?:the )?incident/, /incident handling/],
  "ICT risk management":          [/ict risk/, /ict[- ]related/, /ict incident/, /ict third/],
  "ePHI":                         [/\bephi\b/, /electronic protected health/],
  "access controls":              [/access control/],
  "encryption":                   [/encrypt/],
  "audit controls":               [/audit control/, /audit log/, /audit trail/],
  "business associate agreement": [/business associate agreement/, /\bbaas?\b/],
  "vendor risk management":       [/vendor risk/, /vendor management/, /third[- ]party risk management/, /tier(?:ing)? (?:your )?vendors/, /segment(?:ing)? (?:them|vendors)/],
  "third-party risk":             [/third[- ]party risk/, /vendor risk/, /supply[- ]chain risk/],
  "data processing agreements":   [/data processing agreement/, /\bdpas?\b/],
  "security assessments":         [/security assessment/, /security questionnaire/, /vendor assessment/, /due diligence/],
  "right to audit":               [/right[- ]to[- ]audit/, /audit rights?/, /right to (?:audit|inspect)/, /audit or inspect/],
  "OT/IT security":               [/ot\/it/, /operational technology/, /\biot\b/, /ot security/, /embedded system/],
  "network security":             [/network security/, /network segmentation/, /securing.{0,20}network/, /5g.{0,40}(?:security|encrypt|secure)/, /(?:security|encrypt|secure).{0,40}5g/],
  "real-time data processing":    [/real[- ]time/],
  "safety-critical system":       [/safety[- ]critical/, /functional safety/],
};

function termMatches(term, lowerText) {
  const patterns = ALIASES[term] ?? [new RegExp(escape(term.toLowerCase()))];
  return patterns.some(p => p.test(lowerText));
}

export function scoreResponse(query, responseText) {
  const text = responseText.toLowerCase();
  const scores = {
    frameworkCoverage: 0,
    conceptCoverage:   0,
    citationPresent:   false,
    outOfScopeHandled: false,
    redFlagsTriggered: [],
    notes: [],
  };

  const expectedFrameworks = query.expected.frameworks || [];
  const foundFrameworks    = expectedFrameworks.filter(f => termMatches(f, text));
  scores.frameworkCoverage = expectedFrameworks.length > 0
    ? Math.round((foundFrameworks.length / expectedFrameworks.length) * 100) : 100;
  scores.foundFrameworks   = foundFrameworks;
  scores.missingFrameworks = expectedFrameworks.filter(f => !termMatches(f, text));

  const expectedConcepts = query.expected.concepts || [];
  const foundConcepts    = expectedConcepts.filter(c => termMatches(c, text));
  scores.conceptCoverage = expectedConcepts.length > 0
    ? Math.round((foundConcepts.length / expectedConcepts.length) * 100) : 100;
  scores.foundConcepts   = foundConcepts;
  scores.missingConcepts = expectedConcepts.filter(c => !termMatches(c, text));

  const citationPatterns = [
    /art(?:icle)?\.?\s*\d+/i, /§\s*\d+/, /section\s+\d+/i,
    /local law\s+\d+/i, /\d+\s+cfr/i, /recital\s+\d+/i,
  ];
  scores.citationPresent = citationPatterns.some(p => p.test(responseText));

  if (query.type === "out-of-scope") {
    const refusalSignals = [
      "outside", "not a compliance", "technical question", "beyond", "scope",
      "not able to", "cannot assess", "architecture", "product comparison", "benchmark",
      "engineering question", "outside grc", "not something i",
    ];
    scores.outOfScopeHandled = refusalSignals.some(s => text.includes(s));
    if (!scores.outOfScopeHandled && text.length > 200) {
      scores.notes.push("WARNING: May have hallucinated compliance findings for out-of-scope query");
    }
  }

  scores.redFlagsTriggered = (query.redFlags || []).filter(flag => {
    const flagLower = flag.toLowerCase();
    if (flagLower.includes("no mention of")) {
      const subject = flagLower.replace("no mention of", "").trim();
      return !text.includes(subject);
    }
    return false;
  });

  // Out-of-scope queries are graded purely on refusal handling — citations are
  // neither expected nor rewarded for a question the model should deflect.
  if (query.type === "out-of-scope") {
    scores.compositeScore = scores.outOfScopeHandled ? 100 : 40;
  } else {
    const baseScore = Math.round(
      (scores.frameworkCoverage * 0.4) +
      (scores.conceptCoverage   * 0.4) +
      (scores.citationPresent ? 20 : 0)
    );
    scores.compositeScore = Math.min(100, baseScore);
  }

  scores.grade =
    scores.compositeScore >= 85 ? "PASS" :
    scores.compositeScore >= 65 ? "REVIEW" : "FAIL";

  return scores;
}
