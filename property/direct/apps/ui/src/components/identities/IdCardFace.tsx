import { useRef } from "react";
import { useI18n, useOptionalI18n } from "../../contexts/I18nContext";
import { english } from "../../lib/english";
import { usePublicProfileRequest } from "../../hooks/usePublicProfileRequest";
import { providerIcon } from "./ProviderIcons";
import { ProviderMark } from "./ProviderMark";
import { machineLine, type IdCardContent } from "./idCard";
import "./id-deck.css";

const PROPERTY_MARK = <svg viewBox="80 75 344 397" fill="currentColor"><path d="M210 91H286C352 91 406 145 406 207V223C406 289 360 342 300 342H239.52L216.18 361.2V419C216.18 440 200 456 180 456H134C114 456 98 440 98 419V203C98 141.15 148.15 91 210 91ZM170 306L213 270H279C310 270 334 245 334 214V203C334 181 316 163 294 163H210C188 163 170 181 170 203Z" /></svg>;

const CHECK = <svg viewBox="0 0 16 16" fill="none"><path d="m3.5 8.5 3 3 6-7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;

function StatusIcon({ status }: { status: IdCardContent["status"] }) {
  // The Property card's "Default" (and a contact's Verified / Not verified): its own mark.
  if (status === "default") return <svg aria-hidden="true" width="10" height="10" viewBox="80 75 344 397" fill="currentColor"><path d="M210 91H286C352 91 406 145 406 207V223C406 289 360 342 300 342H239.52L216.18 361.2V419C216.18 440 200 456 180 456H134C114 456 98 440 98 419V203C98 141.15 148.15 91 210 91ZM170 306L213 270H279C310 270 334 245 334 214V203C334 181 316 163 294 163H210C188 163 170 181 170 203Z" /></svg>;
  // Being checked (a share in a chat's timeline): three dots, still. Nothing on a card loops.
  if (status === "checking") return <svg aria-hidden="true" width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><circle cx="3" cy="8" r="1.6" /><circle cx="8" cy="8" r="1.6" /><circle cx="13" cy="8" r="1.6" /></svg>;
  const d = status === "verified" ? "m3 8 3 3 7-7" : status === "expiring" ? "M8 4v4.5l3 2" : status === "revoking" || status === "withdrawn" ? "M4 8h8" : status === "revoked" ? "M4 12 12 4" : "M8 4v5M8 11.5v.5";
  return <svg aria-hidden="true" width="10" height="10" viewBox="0 0 16 16" fill="none"><path d={d} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

/** A card's provider on a 14px tile, for the row of marks under a deck of ID cards; none for the blank one that adds. */
export function IdCardMark({ provider, subject }: { provider?: string; subject?: string }) {
  if (!provider) return <span className="id-deck-mark id-deck-mark-plain"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M8 3v10M3 8h10" /></svg></span>;
  const icon = providerIcon(provider, subject);
  if (!icon) return <span className="id-deck-mark id-deck-mark-plain"><svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="4" /></svg></span>;
  return <span className={`id-deck-mark forced-color-adjust-none ${icon.tile}`}>{icon.mark(10)}</span>;
}

/**
 * An identity as an ID card, in the family of the wallet's payment cards (same size, same deck, same motion) but
 * read like a document: a band with the issuer and the status, a photo slot (the identity's own picture, or its
 * provider's mark), the fields, a hologram seal with the ghost and the machine-readable line along the bottom.
 * In a stack, a card before the chosen one shows its leading edge (the photo and the provider); one after it, its
 * trailing edge, where the provider's mark comes up in the band beside the seal. In a chat's picker, a card shared
 * with that contact wears a check seal (`shared`): on the photo's corner, and beside the mark on the trailing edge.
 * The profile's own Ghostly identity is one of these too (idCard.ts `ghostlyCard`): the profile's picture, or the
 * name's initial, in the photo slot, and "Default" for a status. An identity with a public profile (a Nostr, Pubky or
 * Bluesky account) asks for it once its card is on screen, and wears its picture and name.
 */
export function IdCardFace({ card, after, shared }: { card: IdCardContent; after?: boolean; shared?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  // Also drawn on its own (a test of the card): English then.
  const t = useOptionalI18n()?.t ?? english;
  usePublicProfileRequest(ref, card.lookup);
  return (
    <span ref={ref} className="id-card-face" data-deck="face" data-profile={card.profile?.found ? "found" : undefined} data-after={after || undefined} data-status={card.status} data-shared={shared || undefined}>
      <span className="id-card-band">
        <span className="id-card-issuer">Property<span className="id-card-issuer-kind"> · {t("identities.card.kind")}</span></span>
        <span className="id-card-status" data-testid={card.status === "expiring" ? "identity-proof-expiring" : undefined}><StatusIcon status={card.status} /><span className="id-card-status-text">{card.statusLabel}</span></span>
        <span className="id-card-mark-end" aria-hidden="true">{shared && <span className="id-card-check id-card-check-small">{CHECK}</span>}<ProviderMark provider={card.provider} subject={card.bound} small /></span>
      </span>
      <span className="id-card-photo" aria-hidden="true">
        {card.photo ? <><img src={card.photo} alt="" width={160} height={160} decoding="async" draggable={false} data-testid="id-card-photo" /><span className="id-card-photo-badge" data-testid="id-card-photo-badge"><ProviderMark provider={card.provider} subject={card.bound} small /></span></>
          : card.monogram ? <><span className="id-card-monogram" data-testid="id-card-monogram">{card.monogram}</span><span className="id-card-photo-badge"><ProviderMark provider={card.provider} subject={card.bound} small /></span></>
            : <ProviderMark provider={card.provider} subject={card.bound} />}
        {/* Shared in this chat: a check seal on the photo's corner, which shows on every card of a stack. */}
        {shared && <span className="id-card-check" data-testid="id-card-shared" title={t("identities.card.shared")}>{CHECK}</span>}
      </span>
      <span className="id-card-fields">
        <span className="id-card-provider">{card.label}</span>
        {card.name && <span className="id-card-name" data-testid="id-card-name">{card.name}</span>}
        <span className="id-card-subject" data-testid="identity-proof-subject" title={card.subject}><bdi dir="ltr">{card.short}</bdi></span>
        <span className="id-card-field id-card-field-category">{card.category}</span>
        <span className="id-card-field id-card-field-validity">{card.validity}</span>
        <span className="id-card-field id-card-field-shared">{card.shared}</span>
      </span>
      <span className="id-card-mrz" aria-hidden="true">{card.mrz ?? machineLine(card.label, card.subject)}</span>
      <span className="id-card-seal" data-deck="ghost" aria-hidden="true">{PROPERTY_MARK}</span>
      <span className="id-card-sheen" data-deck="sheen" aria-hidden="true" />
    </span>
  );
}

/**
 * The last card of the deck: a blank ID waiting for an identity, the kinds it can add as a row of marks. It comes
 * after the profile's Ghostly card, so it is never alone: "Add an identity" while it is the only other card, then
 * "Add another identity".
 */
export function AddIdCardFace({ first, providers = [] }: { first: boolean; providers?: string[] }) {
  const { t } = useI18n();
  return (
    <span className="id-card-face id-card-blank" data-deck="face">
      <span className="id-card-band"><span className="id-card-issuer">Property<span className="id-card-issuer-kind"> · {t("identities.card.kind")}</span></span></span>
      <span className="id-card-photo" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg></span>
      <span className="id-card-fields">
        <span className="id-card-provider">{first ? t("identities.ghostly.addOne") : t("identities.ghostly.addAnother")}</span>
        {providers.length > 0 && <span className="id-card-providers" aria-hidden="true" data-testid="id-card-providers">{providers.map(p => <IdCardMark key={p} provider={p} />)}</span>}
        <span className="id-card-field id-card-field-shared">{t("identities.ghostly.chosenChats")}</span>
      </span>
      <span className="id-card-mrz" aria-hidden="true">{"ID<PROPERTY<<".padEnd(44, "<")}</span>
      <span className="id-card-seal" data-deck="ghost" aria-hidden="true">{PROPERTY_MARK}</span>
      <span className="id-card-sheen" data-deck="sheen" aria-hidden="true" />
    </span>
  );
}
