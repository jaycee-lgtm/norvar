"use client";

import Logo from "@/components/Logo";
import InfoTip from "@/components/InfoTip";

export default function HomeHero({
  isMobileView,
  title,
  infoTip,
}: {
  isMobileView: boolean;
  title:      string;
  infoTip?:   string;
}) {
  return (
    <div className={isMobileView ? "home-hero-block home-hero-enter" : undefined}>
      {isMobileView ? (
        <>
          <Logo size={40} animated />
          <h1 className="home-hero-serif mobile-home-serif home-hero-serif--enter">{title}</h1>
        </>
      ) : (
        <div className="home-hero-row home-hero-enter">
          <Logo variant="hero" className="home-hero-logo" size={68} animated />
          <div className="home-hero-heading-wrap">
            <h1 className="home-hero-serif home-hero-serif--enter">{title}</h1>
            {infoTip ? <InfoTip text={infoTip} /> : null}
          </div>
        </div>
      )}
    </div>
  );
}
