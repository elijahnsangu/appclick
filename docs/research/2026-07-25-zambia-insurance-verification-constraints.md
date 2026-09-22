# Zambia insurance and verification constraints

Date: 2026-07-25.

This note resolves the Zambia-specific research needed for Marliket's first marketplace slice.

It translates primary legal and regulator sources into product constraints for insurance publishing, business verification, consumer trust signals, personal data, and communications.

It is product research rather than legal advice.

Marliket should obtain Zambian counsel or written regulator confirmation where this note identifies an interpretation gate.

## Executive decision

Marliket can launch vehicle, part, and accessory discovery with reviewed listings and contact-verified inquiries if it verifies each publishing Business against authoritative records, limits public trust claims to facts actually checked, separates transactional inquiry messages from marketing, and satisfies Zambian data-protection registration and infrastructure requirements.

Insurance should launch only as a tightly controlled publisher and referral surface for insurance entities whose current licence Marliket has verified.

Marliket should not quote, compare, recommend, rank by suitability, collect proposal information, negotiate, handle premiums, assist with policy performance or claims, or earn compensation tied to completed insurance business unless the Pensions and Insurance Authority confirms that the operating model does not require an intermediary licence.

Production processing of account, representative, listing-evidence, or inquiry personal data on foreign-hosted services is a launch blocker until the Data Protection Commissioner confirms the required registration, Zambia-based processing or storage, and any cross-border transfer authorization.

## Binding constraints and authoritative signals

### Insurance publication

The [Insurance Act, 2021](https://www.parliament.gov.zm/sites/default/files/documents/acts/Act%20No.%2038%20OF%202021%2C%20THE%20INSURANCE%20ACTpdf_0.pdf) prohibits a person from carrying on or holding out as carrying on insurance or insurance-intermediary business without the required licence.

The Act defines intermediary activities broadly enough to include inviting offers or proposals and taking steps toward the making of an insurance contract.

The definition excludes a person who only publishes invitations on behalf or on the order of another person.

The same Act prevents a licensed insurer or reinsurer from accepting insurance business or paying commission or other remuneration to an unlicensed person, and it makes the regulator's register of licensees public.

The publisher exclusion supports an insurer-authored advertising model, but it does not by itself settle how interactive referrals, lead qualification, rankings, proposal data, or compensation would be classified.

The [Pensions and Insurance Authority licensed-entities register](https://www.pia.org.zm/?page_id=9639) is the authoritative current source for whether an insurer or intermediary is licensed.

The register states that the listed 2026 licences are current through 31 December 2026, so a one-time onboarding check is not enough.

The Pensions and Insurance Authority's [Market Conduct Regulations, Statutory Instrument No. 71 of 2025](https://www.pia.org.zm/?wpdmpro=market-conduct-regulations-si-no-71-of-2025) and official [February 2026 newsletter](https://www.pia.org.zm/wp-content/uploads/2026/02/PIA-E-NEWSLETTER.pdf) establish current disclosure, product-information, complaint, and claims expectations for licensed market participants.

Marliket should treat insurer-approved product wording and the applicable Key Fact Statement as the source of truth instead of paraphrasing cover, exclusions, price, or suitability.

### Business and representative verification

The Patents and Companies Registration Agency's [Legal Entity Printout](https://info.pacra.org.zm/how-do-i-view-the-details-of-my-company/) provides a dated snapshot of entity name, registration details, officers, shareholders, and beneficial owners.

PACRA warns that the printout is valid only on the day it is obtained.

The [PACRA legal-notices register](https://www.pacra.org.zm/legal-notices) supplies current notices that can reveal deregistration, restoration, insolvency, or other status changes.

PACRA entity evidence establishes that a Business exists and identifies recorded officeholders, but it does not prove that the person operating a Marliket account currently has authority to bind that Business.

Marliket therefore needs a separate Authorized Representative check using identity evidence, a role or officeholder match where available, and an explicit authorization from the Business when the representative is not independently shown as an authorized officeholder.

Public trust signals must not reveal national registration card numbers, beneficial-owner details, authorization letters, or other private evidence.

The Road Transport and Safety Agency's [road service licensing guidance](https://www.rtsa.org.zm/transport/licensing/) describes a motor dealer vehicle licence that requires incorporation evidence and inspection of physical premises.

That licence concerns the use of dealer, test, or sale vehicles and must not be presented as a general government endorsement of every vehicle, listing, or transaction.

The Financial Intelligence Centre's [motor vehicle dealer sector guidance](https://fic.gov.zm/component/attachments/download/52) and [guidance for accountable institutions](https://www.fic.gov.zm/component/attachments/download/133) identify motor vehicle dealers as accountable institutions with customer-due-diligence, recordkeeping, and transaction-reporting obligations.

The first marketplace slice does not process a vehicle sale or payment, so Marliket should verify and record a dealer's compliance evidence without claiming to perform the dealer's transaction-level obligations.

### Phone and identity claims

The Zambia Information and Communications Technology Authority's [SIM registration guidance](https://www.zicta.zm/services/consumer-protection/sim-registration) confirms that mobile network operators register SIM cards against prescribed identification.

An OTP sent by Marliket proves only that the user controlled the phone number at that moment.

It does not prove that the user is the registered subscriber, that the subscriber identity was checked by Marliket, or that the person has authority for a Business.

The interface may say `Phone verified` or `Contact verified` after a successful OTP challenge.

It must not say `Identity verified`, `Owner verified`, or imply a ZICTA or mobile-network identity lookup unless Marliket actually performs an authoritative identity check that supports that claim.

### Consumer protection and listing claims

The [Competition and Consumer Protection Act, 2010](https://ccpc.org.zm/media/policy/CCPC-ACT-2010.pdf), as amended by the [Competition and Consumer Protection Amendment Act, 2023](https://www.parliament.gov.zm/sites/default/files/documents/acts/Act%20No.%2021%20of%202023%2C%20The%20Competition%20and%20Consumer%20Protection%20%28Amendment%29.pdf), prohibits false or misleading representations about goods, services, price, history, quality, sponsorship, approval, affiliation, origin, warranties, and remedies.

The Competition and Consumer Protection Commission has also issued an official [warning about misleading e-commerce websites](https://www.ccpc.org.zm/details/38).

Every listing and public badge must therefore be attributable to a defined evidence check and must state no broader conclusion than that check supports.

Dealer-submitted facts remain the dealer's claims even after Marliket reviews a listing.

Marliket review must not be presented as a mechanical inspection, title guarantee, roadworthiness certification, insurer recommendation, or transaction guarantee.

Displayed prices and material qualifications must be clear, and unavailable or stale listings must not remain publicly represented as available.

### Electronic communications

The [Electronic Communications and Transactions Act, 2021](https://www.parliament.gov.zm/sites/default/files/documents/acts/Act%20No.%204%20of%202021%2C%20The%20Electronic%20Communications%20and%20Transactions_0.pdf) requires electronic marketers to disclose their identity and contact details, maintain an operational opt-out, disclose the source of personal information on request, and publish privacy and user policies.

The Act permits one unsolicited commercial communication, but further commercial communications require the recipient's consent and every commercial message needs an opt-out path.

Marliket should treat an inquiry receipt, security challenge, abuse alert, and delivery of the customer's requested inquiry as transactional communications.

Any promotion, cross-sell, dealer campaign, insurer follow-up unrelated to the requested inquiry, or reuse of inquiry details for marketing requires a separate consent record and functional opt-out.

The Act also prescribes supplier disclosures for electronic transactions.

Because the first slice does not provide checkout or conclude sales online, counsel should confirm which supplier-registration and transaction-specific provisions apply to Marliket, while the product should adopt truthful supplier identity, contact, terms, privacy, security, and complaint disclosures from launch.

### Personal data, hosting, and transfers

The [Data Protection Act, 2021](https://www.parliament.gov.zm/sites/default/files/documents/acts/Act%20No.%203%20The%20Data%20Protection%20Act%202021_0.pdf) requires lawful, fair, transparent, purpose-limited, minimal, accurate, secure, and retention-limited processing.

The Act requires data controllers and data processors to register, subject to any applicable exemption or regulatory forbearance.

The Data Protection Commissioner's current [registration guidance](https://www.dataprotection.gov.zm/wp-content/uploads/2025/03/Guide_Registration-of-Data-Controllers-and-Processors.pdf) says that entities processing personal data across sectors must register unless an exemption applies.

The [registration portal](https://registration.dataprotection.gov.zm/) separately warns that processing personal data outside Zambia requires authorization.

The Act requires personal data to be processed and stored on a server or data centre in Zambia, requires sensitive personal data to be stored in Zambia, and permits transfers outside Zambia only under approved statutory conditions.

Marliket's planned Vercel, Cloudflare, Neon, authentication, monitoring, analytics, messaging, and support vendors must therefore be mapped by data type, processing purpose, region, subprocessor, and transfer path before production use.

Marliket must register in the correct controller and processor capacities and obtain any required cross-border authorization before foreign-hosted production processing begins.

The Act also requires privacy notices, data-subject rights, processor contracts, appropriate technical and organizational safeguards, processing records, data-protection impact assessment for likely high-risk processing, and breach notification to the Commissioner within 24 hours.

Consent is not a universal substitute for another lawful basis and must be specific, informed, distinguishable, evidenced, and withdrawable where used.

The Act imposes purpose-based retention and a statutory minimum period in relevant cases, so deletion policy needs a Zambian legal-retention matrix rather than an imported default.

## First-slice product contract

### Insurance role

Marliket may publish a page or listing only when:

- the named insurer or intermediary appears in the current Pensions and Insurance Authority register;
- the regulated entity supplies or explicitly approves the product name, factual description, required disclosures, Key Fact Statement, contact destination, and permitted calls to action;
- Marliket records the licence class, licence number where available, source URL, verification date, expiry or review date, and approving representative;
- the page clearly identifies the regulated provider and states that Marliket is the publisher rather than the insurer, broker, agent, adviser, underwriter, or claims handler; and
- the call to action sends the customer to the regulated entity or transmits only the minimum contact details under an approved referral model.

Until regulator or counsel confirmation is recorded, Marliket must not:

- calculate or display a customer-specific premium;
- ask underwriting, proposal, risk, health, financial, or suitability questions;
- recommend a policy, rank products by suitability, or characterize a product as best;
- negotiate or explain coverage in a way that amounts to advice;
- accept premiums, bind cover, issue policy documents, or assist with claims or policy performance;
- present an unlicensed Business as the insurance provider; or
- receive commission, success fees, premium-linked compensation, or other remuneration tied to insurance business.

### Business approval evidence

Operations should approve each requested Business role independently and keep the evidence private.

The minimum evidence set is:

- a current PACRA Legal Entity Printout or equivalent authoritative entity record;
- entity legal name, registration number, status, registered address, and verification timestamp;
- current legal-notice and insolvency or deregistration checks;
- the representative's identity evidence and a separately recorded authority basis;
- ZRA evidence and any category-specific licence or registration needed for the requested role;
- for a vehicle dealer, relevant Road Transport and Safety Agency evidence plus the dealer's accountable-institution compliance attestation;
- for an insurance publisher, the current Pensions and Insurance Authority register entry and insurer-approved publishing materials; and
- the reviewer, decision, reasons, evidence versions, review date, and next reverification date.

Approval should enter a review-required state when evidence expires, the authoritative register changes, the representative loses authority, or a material complaint creates a reasonable doubt.

Suspension of one role should not automatically erase the Business identity or unrelated approved roles.

### Public trust signals

The first slice may expose narrow statements such as:

- `Business record checked with PACRA on <date>`;
- `Authorized representative checked`;
- `Phone verified on <date>`;
- `Dealer evidence reviewed on <date>`; and
- `Insurance provider licence checked with PIA on <date>`.

Each statement needs a tooltip or details surface that explains what was checked, the date, the source class, and what the statement does not guarantee.

The product must not expose raw evidence or use unqualified badges such as `Verified`, `Government approved`, `Safe dealer`, `Guaranteed vehicle`, or `Approved insurance`.

### Inquiry and communications

The inquiry form should collect only the fields needed to route and answer the inquiry.

It should identify the receiving Business, state whether Marliket or the Business will contact the customer, link the privacy notice, distinguish required processing from optional marketing consent, and record the notice and consent versions.

Insurance inquiries must stay within the approved publisher or referral boundary and must not silently become proposal or underwriting forms.

Inquiry delivery, retries, abuse controls, access, exports, and deletion must be auditable.

Marketing permissions must be purpose-specific and must not be inferred from submitting an inquiry.

## Launch gates

The following gates must be closed before the affected production behavior is enabled:

1. Pensions and Insurance Authority or Zambian counsel confirmation of the intended insurance page, referral data, routing, analytics, and compensation model.
2. Data Protection Commissioner registration in every required capacity.
3. A confirmed Zambia-hosting architecture or written authorization for every required cross-border processing and transfer path.
4. Executed processor agreements, subprocessor inventory, processing records, retention schedule, privacy notices, rights procedure, breach process, and any required data-protection impact assessment.
5. A verification operations runbook covering authoritative sources, private evidence, representative authority, reviewer separation, expiry, reverification, suspension, appeals, and audit history.
6. Approved public wording for trust signals, insurance disclaimers, listing responsibility, privacy, complaints, and electronic marketing.

## Consequences for the remaining Wayfinder frontier

The operations workflow must own evidence review, role-specific approval, reverification, suspension, appeals, and regulator-register drift.

The inquiry workflow must own minimal data collection, transactional delivery, purpose-specific marketing consent, opt-out, retention, and abuse evidence.

Customer discovery must render evidence-backed, dated trust signals without collapsing phone possession, Business existence, representative authority, dealer compliance, and listing review into one `Verified` badge.

Restricted-listing and claims policy must prohibit unlicensed insurance activity, unsupported cover or price claims, misleading government affiliation, mechanical or title guarantees, and reviewer language that exceeds the evidence.

Category taxonomy should distinguish compulsory third-party motor insurance from other cover only through insurer-approved descriptions and should not encode product suitability.

These consequences fit the existing decision tickets, so this research does not create another Wayfinder ticket.

Infrastructure implementation, regulator applications, legal engagement, and launch operations remain outside the first marketplace-slice planning scope, but their gates are now explicit.

## Primary sources

- [Insurance Act, 2021](https://www.parliament.gov.zm/sites/default/files/documents/acts/Act%20No.%2038%20OF%202021%2C%20THE%20INSURANCE%20ACTpdf_0.pdf)
- [Pensions and Insurance Authority licensed entities](https://www.pia.org.zm/?page_id=9639)
- [Market Conduct Regulations, Statutory Instrument No. 71 of 2025](https://www.pia.org.zm/?wpdmpro=market-conduct-regulations-si-no-71-of-2025)
- [Data Protection Act, 2021](https://www.parliament.gov.zm/sites/default/files/documents/acts/Act%20No.%203%20The%20Data%20Protection%20Act%202021_0.pdf)
- [Data Protection Commissioner registration guidance](https://www.dataprotection.gov.zm/wp-content/uploads/2025/03/Guide_Registration-of-Data-Controllers-and-Processors.pdf)
- [Data Protection Commissioner registration portal](https://registration.dataprotection.gov.zm/)
- [Electronic Communications and Transactions Act, 2021](https://www.parliament.gov.zm/sites/default/files/documents/acts/Act%20No.%204%20of%202021%2C%20The%20Electronic%20Communications%20and%20Transactions_0.pdf)
- [Competition and Consumer Protection Act, 2010](https://ccpc.org.zm/media/policy/CCPC-ACT-2010.pdf)
- [Competition and Consumer Protection Amendment Act, 2023](https://www.parliament.gov.zm/sites/default/files/documents/acts/Act%20No.%2021%20of%202023%2C%20The%20Competition%20and%20Consumer%20Protection%20%28Amendment%29.pdf)
- [PACRA Legal Entity Printout](https://info.pacra.org.zm/how-do-i-view-the-details-of-my-company/)
- [PACRA legal notices](https://www.pacra.org.zm/legal-notices)
- [Road Transport and Safety Agency road service licensing](https://www.rtsa.org.zm/transport/licensing/)
- [Financial Intelligence Centre motor vehicle dealer guidance](https://fic.gov.zm/component/attachments/download/52)
- [ZICTA SIM registration guidance](https://www.zicta.zm/services/consumer-protection/sim-registration)
