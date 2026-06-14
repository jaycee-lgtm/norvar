type AiDisclaimerProps = {
  agentName: string;
  className?: string;
};

export default function AiDisclaimer({ agentName, className }: AiDisclaimerProps) {
  return (
    <p className={className ?? "ai-disclaimer"}>
      {agentName} is AI-generated. Validate responses before acting on them.
    </p>
  );
}
