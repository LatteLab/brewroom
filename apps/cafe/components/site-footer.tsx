import { FooterWordmark } from "./footer-wordmark";
import { site } from "@/content/site";

export function SiteFooter() {
  return (
    <footer className="signature-footer">
      <div className="shell signature-inner">
        <a
          className="signature-membership-link"
          href={site.membershipUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Join the Latte Lab membership mailing list (opens in a new tab)"
        />
        <div className="signature-art" role="img" aria-label="Latte Lab">
          <FooterWordmark />
        </div>
        <div className="signature-meta">
          <p>Student brewed. MIT, Cambridge.</p>
          <div>
            <a href={site.instagram} target="_blank" rel="noopener noreferrer">
              Instagram <span aria-hidden="true">↗</span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            <a href={site.linkedin} target="_blank" rel="noopener noreferrer">
              LinkedIn <span aria-hidden="true">↗</span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            <a href={`mailto:${site.email}`}>
              Email us <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
