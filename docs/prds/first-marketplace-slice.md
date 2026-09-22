# First marketplace slice

This specification turns the completed [First marketplace slice Wayfinder](https://github.com/elijahnsangu/marliket/issues/18) into the durable product contract for Marliket's first business-to-customer marketplace journey in Zambia.

## Problem Statement

Customers in Zambia need one trustworthy place to discover vehicles, Vehicle Parts, Vehicle Accessories, and vehicle insurance without being forced to create an account or interpret broad, unsupported claims about sellers, products, safety, compatibility, or insurance suitability.
Legitimate Businesses need a fair path to establish their identity, prove category-specific eligibility, authorize the people who act for them, publish accurate Listings, receive contact-verified Inquiries, and correct problems without losing unrelated Marketplace Roles.
Marliket operations needs evidence-bound workflows that approve Businesses, Marketplace Roles, Representative Authorizations, and Listing Revisions while controlling fraud, safety, legal, privacy, rights, and access risks through narrow, auditable decisions.
The repository currently provides platform infrastructure but no marketplace domain, data model, application journey, or acceptance seam for these needs.
The first slice must therefore establish the complete reviewed-publication and verified-inquiry journey across four equal marketplace categories while remaining outside checkout, transaction, insurance-intermediation, and private-seller boundaries.

## Solution

Marliket will launch a Zambia-first, English-language marketplace with Vehicles, Parts, Accessories, and Insurance as equal category destinations.
Each participating Business will establish one verified identity and may hold independently approved Marketplace Roles for vehicle dealing, parts selling, accessories selling, and insurance provision.
Each Authorized Representative will act through one Marliket Account and a separately human-approved, Business-scoped Representative Authorization with fixed Representative Permissions.
An Authorized Representative with the required permission will create a category-specific Listing, supply structured facts, Public Media, private Review Evidence, availability, price, location or Service Area, and an eligible Inquiry route, and submit an immutable Listing Revision for review.
Marliket operations will review applications, authorizations, Listing Revisions, reports, renewals, and enforcement matters through shared append-only Operations Cases and specialized queue views.
Only an approved Listing Revision that passes every current eligibility, evidence, availability, routing, media, safety, legal, and publication gate will become public.
Customers will browse one category at a time, use reviewed structured search and filters, inspect evidence-led Listing details and narrowly worded dated trust signals, and submit a Listing-specific Inquiry without creating an account.
Marliket will deliver an Inquiry only after WhatsApp Phone Verification of a Zambian mobile number, retain the Business inbox as the source of truth, and keep insurance contact requests within a publisher-first boundary.
Immediate, scoped, auditable controls will pause unsafe or ineligible publication, while corrections, reconsideration, renewal, and restoration will preserve immutable decisions and historical evidence.
Capabilities whose legal authority, data rights, source coverage, provider qualification, or infrastructure prerequisites remain unconfirmed will stay disabled until their recorded launch gates close.

## User Stories

1. As a Customer, I want Vehicles, Parts, Accessories, and Insurance to be equally visible destinations, so that I can begin in the category that matches my intent.
2. As a Customer, I want each category to have its own result set, so that unrelated Listing types never dilute or mislead my search.
3. As a Customer, I want to browse public Listings without a Marliket Account, so that account creation does not block discovery.
4. As a Customer, I want category, search, location, filters, sort, and page encoded in the URL, so that I can share and revisit a browse state.
5. As a Customer, I want returning from a Listing to restore my prior browse state and position, so that I can continue comparing results efficiently.
6. As a Customer, I want numbered pagination, so that result boundaries and navigation remain predictable.
7. As a Customer, I want global search suggestions grouped by category, so that an ambiguous query does not silently send me to the wrong marketplace.
8. As a Customer, I want category search to tolerate ordinary spelling and formatting variations, so that minor input differences do not hide relevant Listings.
9. As a Customer, I want search ranking based on reviewed facts and relevance rather than payment or popularity, so that undisclosed promotion does not distort discovery.
10. As a Customer, I want Zambia-wide discovery by default and explicit province and locality filters, so that I control the geographic scope.
11. As a Customer, I want Marliket to remember only a location I explicitly selected, so that discovery does not depend on precise device location or silent IP inference.
12. As a Customer, I want every filter to use reviewed structured facts, so that title text, images, and unsupported descriptions cannot create false matches.
13. As a Customer, I want an empty state to identify every active constraint and offer reversible relaxation, so that I understand why no results match.
14. As a Customer, I want result cards to show category-specific facts, price or Quote Required, location or Service Area, availability, and freshness, so that I can judge relevance before opening a Listing.
15. As a Customer, I want trust signals to name the exact check and date, so that I do not mistake a narrow verification for a broad guarantee.
16. As a Customer, I want an explanation of what each trust signal does not establish, so that Marliket review is not confused with safety, authenticity, suitability, or ownership assurance.
17. As a Customer, I want material defects, exclusions, warnings, and limits placed before promotional or related content, so that important risk information is hard to miss.
18. As a Customer, I want private Review Evidence and private addresses to remain private, so that public transparency does not expose sensitive information.
19. As a Customer, I want a Vehicle Listing to show the actual vehicle, exact asking price, negotiability, excluded mandatory charges, verified locality, specifications, and reviewed history disclosures, so that I can make an informed contact decision.
20. As a Customer, I want miles-based odometer readings shown with their original unit and a kilometre conversion, so that the displayed fact remains faithful and locally understandable.
21. As a Customer, I want a Vehicle Part Listing to show condition, identifiers, unit price, availability, warranty, included items, compatibility basis, testing, wear, defects, provenance, authenticity, recall, and remaining-life disclosures, so that I can assess the exact product specification.
22. As a Customer, I want a Vehicle Accessory Listing to show function, dimensions, variants, condition, compatibility or Universal status, installation requirements, modifications, power needs, provenance, authenticity, and recall disclosures, so that I can judge practical fit and use.
23. As a Customer, I want an insurance Listing to show neutral current product facts, regulated capacity, underwriter, dated licence check, exclusions, limits, excesses, waiting periods, eligibility, Service Area, product wording, and effective date, so that I can understand the published information without receiving advice.
24. As a Customer, I want insurance pages to state that they are not quotes, recommendations, policies, underwriting decisions, or promises of acceptance, so that the publisher boundary is clear.
25. As a Customer, I want Vehicle and qualifying insurance USD displays to show the authoritative amount and a dated indicative ZMW conversion only after the legal gate closes, so that currency presentation is transparent and lawful.
26. As a Customer, I want Parts and Accessories prices in ZMW per stated unit, so that price presentation is exact and locally comparable.
27. As a Customer, I want unavailable Listings removed from default discovery immediately, so that stale inventory does not appear available.
28. As a Customer, I want an unavailable Listing URL to explain its exact state for the defined window, so that an old link does not silently misrepresent availability.
29. As a Customer, I want a Sold Vehicle URL to retain only a minimal permanent tombstone, so that stale details and contact channels do not remain public.
30. As a Customer, I want related content to remain in the same category and explain its reviewed matching basis, so that suggestions are neutral and understandable.
31. As a Customer, I want the sole contact path to be a Listing-specific Inquiry, so that my details go to a clearly named Business for a clearly identified subject.
32. As a Customer, I want the desktop Inquiry action visible beside the main facts and the mobile action persistently accessible, so that contact remains easy across screen sizes.
33. As a Customer, I want Phone Verification to complete inside the Inquiry flow, so that verification does not interrupt or obscure the Listing context.
34. As a Customer, I want Phone Verification to prove only current control of my Zambian mobile number, so that Marliket does not make a false identity claim.
35. As a Customer, I want a device-bound verification session to remain reusable for 24 hours when risk remains acceptable, so that I do not repeat an OTP for every Inquiry.
36. As a Customer, I want clear warnings not to send passwords, payment credentials, identity documents, or sensitive financial or health information, so that the Inquiry form does not encourage unsafe disclosure.
37. As a Customer, I want insurance contact requests to collect only my name, verified mobile number, and optional callback time, so that Marliket does not drift into proposal, underwriting, or suitability collection.
38. As a Customer, I want other Inquiries to accept only a bounded plain-text message and optional callback time, so that the Business receives useful information without unsafe content types.
39. As a Customer, I want Inquiry submission to identify the receiving Business, privacy notice version, permitted transactional uses, and prohibited marketing reuse, so that I understand the processing purpose.
40. As a Customer, I want an idempotent submission to return the original Inquiry reference, so that retries do not duplicate contact or notifications.
41. As a Customer, I want a successful Inquiry to produce an immutable reference, on-screen receipt, WhatsApp confirmation, and reporting links, so that I can prove and control the contact request.
42. As a Customer, I want receipts to distinguish routing from Business viewing or response, so that delivery language remains truthful.
43. As a Customer, I want to report unwanted marketing, harassment, impersonation, misleading content, or another safety concern, so that harm can enter an auditable review process.
44. As a Customer, I want to request that Marliket and the Business stop Inquiry-related follow-up, so that my contact preference is recorded even when Marliket cannot control off-platform contact.
45. As a Customer, I want rate limits and abuse controls to avoid blocking solely on IP address, so that shared and mobile networks do not create unfair exclusions.
46. As a Business Applicant, I want one Business Application to establish one registered Business identity, so that shared evidence is not duplicated across Marketplace Roles.
47. As a Business Applicant, I want a duplicate registered identity routed to recovery or authority-verified joining, so that Marliket does not create duplicate Businesses or disclose existing representatives.
48. As a Business Applicant, I want Marketplace Role Applications evaluated independently, so that a problem in one category does not automatically block another eligible category.
49. As a legitimate small Business, I want approval based on identity, authority, category qualification, and integrity rather than showroom size, inventory, trading history, or expected demand, so that eligibility remains objective.
50. As a Business Applicant, I want missing or correctable evidence returned through Changes Requested, so that I can repair an application without being treated as ineligible.
51. As a Business Applicant, I want rejection reserved for substantive ineligibility, fraud, or unmet mandatory conditions, so that the decision matches the evidence.
52. As a Business Applicant, I want to resubmit when evidence or circumstances materially change, so that no arbitrary cooldown or attempt limit blocks legitimate correction.
53. As a Business, I want role-specific expiry or misconduct to affect only the relevant Marketplace Role, so that unrelated eligible activity can continue.
54. As a Business, I want every suspension or revocation to state scope, reasons, effective time, corrective path, and reconsideration path, so that enforcement is understandable and contestable.
55. As a person starting a Business Application, I want to request the initial Representative Authorization without an invitation, so that the Business can be bootstrapped safely.
56. As an invitee, I want a Representative Invitation to expose only the authority-evidence flow, so that acceptance does not grant premature Business access.
57. As an Authorized Representative, I want my Marliket Account and Business authority treated as separate records, so that authentication alone cannot grant marketplace powers.
58. As an Authorized Representative, I want every Business I represent to require its own approved Representative Authorization, so that authority remains scoped and auditable.
59. As an Authorized Representative, I want one Business selected explicitly before management actions, so that records and permissions cannot leak across Businesses.
60. As a Business Administrator, I want fixed Representative Permissions for administration, eligibility, Listings, and Inquiries, so that access remains understandable and reviewable.
61. As a Business Administrator, I want to request permission additions for another representative, so that Operations can approve the exact expanded authority.
62. As a Business Administrator, I want permission reductions to take effect immediately after step-up, so that excess access can be removed safely.
63. As a Business Administrator, I want the last active administrator protected from removal without an approved successor, so that an Active Business retains accountable management.
64. As an Authorized Representative, I want sensitive invitations, permission changes, removals, identity changes, declarations, and contact changes to require fresh sign-in plus WhatsApp step-up, so that a stale session cannot perform high-risk actions.
65. As an Authorized Representative, I want suspension, removal, recovery, compromise response, and permission reduction to revoke affected sessions immediately, so that access changes apply across devices.
66. As an Authorized Representative, I want to see only authority history and evidence allowed by my Representative Permissions, so that private identity and Operations material remain compartmentalized.
67. As an Authorized Representative with Listing Management, I want to create one continuing category-specific Listing for one discoverable subject, so that review and publication history stays attached to a stable identity.
68. As an Authorized Representative with Listing Management, I want a category mistake or genuinely different subject to require a new Listing, so that incompatible histories are not merged.
69. As an Authorized Representative with Listing Management, I want to save a draft before submission, so that incomplete work does not enter immutable review history.
70. As an Authorized Representative with Listing Management, I want a submitted Listing Revision to become immutable, so that Operations reviews the exact facts and evidence I attested.
71. As an Authorized Representative with Listing Management, I want a consolidated Changes Requested decision tied to exact fields and requirements, so that correction is focused and traceable.
72. As an Authorized Representative with Listing Management, I want a new draft derived from the reviewed revision, so that historical decisions remain unchanged.
73. As an Authorized Representative with Listing Management, I want the last approved revision to remain public during replacement review only while every material public fact remains true, so that ordinary edits do not cause unnecessary downtime or stale claims.
74. As an Authorized Representative with Listing Management, I want immediate audited availability, quantity, routing, and pause changes where review is not required, so that operational facts stay current.
75. As an Authorized Representative with Listing Management, I want category-specific media requirements and a strict separation between Public Media and Review Evidence, so that customer content and private proof cannot be confused.
76. As an Authorized Representative with Listing Management, I want inventory and freshness reminders matched to the category, so that an eligible Listing does not pause unexpectedly.
77. As an Authorized Representative with Inquiry Management, I want the Business inbox to preserve the accepted Inquiry before notifications are attempted, so that provider failure cannot lose customer contact.
78. As an Authorized Representative with Inquiry Management, I want notifications to contain a secure link without exposing customer details, so that sensitive content remains inside authorized access.
79. As an Authorized Representative with Inquiry Management, I want to report abuse and block a verified number only for my Business, so that I can protect staff without imposing platform-wide punishment.
80. As an Authorized Representative with Inquiry Management, I want to archive an Inquiry from the active inbox without altering the original record, so that workflow organization does not destroy evidence.
81. As an Operations Reviewer, I want all review and enforcement work represented by Operations Cases, so that specialized queues do not fragment evidence or history.
82. As an Operations Reviewer, I want versioned checklists and exact immutable submissions, so that approval reflects recorded requirements rather than ad hoc judgment.
83. As an Operations Reviewer, I want automated checks to gather facts and raise flags without approving or rejecting, so that required human judgment remains explicit.
84. As an Operations Reviewer, I want unresolved, stale, inconsistent, or conflicting evidence to remain unresolved, so that absence or ambiguity never becomes an inferred pass.
85. As an Operations Reviewer, I want one consolidated correction notice per review pass, so that the Business can respond coherently.
86. As an Operations Reviewer, I want publication to atomically recheck every current gate, so that an earlier approval cannot bypass later eligibility, evidence, routing, availability, or restriction changes.
87. As an Operations Reviewer, I want narrow provisional controls for credible live risk, so that Marliket can reduce harm before a final finding without overreaching.
88. As an Operations Reviewer, I want every provisional control to expire unless evidence supports a recorded renewal, so that temporary measures do not become silent permanent sanctions.
89. As an Operations Lead, I want Independent Review for Insurance Provider approval, rejection, extended suspension, revocation, permanent restriction, serious findings, and lifting those measures, so that a separate eligible reviewer governs high-impact decisions.
90. As an Operations Lead, I want overdue cases visibly escalated against defined response targets, so that delay is managed without automatic approval or reversal.
91. As a Specialist Incident Owner, I want legal, privacy, safety, fraud, rights, regulator, court, and access-compromise matters coordinated through linked Operations Cases, so that specialist action preserves one audit trail.
92. As a person affected by a final decision, I want reconsideration by an independent reviewer, so that new evidence and factual or procedural errors can be addressed fairly.
93. As an Operations quality reviewer, I want sampled decisions, calibration examples, and consistency metrics, so that review quality improves without silent edits or commercial pressure.
94. As an Operations Reviewer, I want every Listing Subject classified as Prohibited, Restricted, or Standard before publication, so that higher-risk subjects receive the correct gate.
95. As an Operations Reviewer, I want unsupported safety-critical facts to fail closed, so that `Unknown` cannot stand in for recall, conformity, authenticity, or exact compatibility evidence.
96. As an Operations Reviewer, I want an open manufacturer safety recall to block publication and trigger an immediate pause when discovered later, so that roadworthiness or condition evidence cannot mask a recall.
97. As an Operations Reviewer, I want evidence sources treated as separate non-substitutable layers, so that legal status, manufacturer status, foreign screening, condition, and provider qualification each prove only their own scope.
98. As an Operations Reviewer, I want provider competence, independence, method, site, equipment, calibration, and signatory scope verified for the exact work, so that generic credentials do not support unrelated claims.
99. As an Operations Reviewer, I want every Material Listing Claim tied to reviewed structured facts and specific evidence, so that a disclaimer cannot cure contradiction, omission, or unsupported wording.
100. As Marliket, I want reference identities, taxonomies, mappings, provenance, review state, and supersession history under product control, so that external source changes do not silently rewrite marketplace meaning.
101. As Marliket, I want source rights and authority evaluated separately, so that public access is not mistaken for permission to ingest, transform, or republish data.
102. As Marliket, I want a Zambia-aware vehicle reference catalogue that permits reviewed provisional identities, so that locally valid imports are not rejected when foreign enrichment sources miss them.
103. As Marliket, I want shallow customer-facing Part and Accessory category trees with replaceable external crosswalks, so that discovery remains stable across data-provider changes.
104. As Marliket, I want exact, conditional, and genuinely Universal compatibility represented as evidence-backed reviewed claims, so that unsupported fitment never creates a filter match.
105. As Marliket, I want regulatory insurance classes kept separate from customer coverage families, so that legal classification is not misrepresented as product scope or suitability.
106. As Marliket, I want reference updates staged as auditable diffs, so that fitment, coverage, legal status, and public location never broaden silently.
107. As Marliket, I want personal-data processing disabled until registration, hosting or transfer authority, processor controls, retention, privacy, rights, and breach gates close, so that launch does not precede Zambia data-protection compliance.
108. As Marliket, I want insurance interaction and compensation disabled beyond the approved publisher-first model, so that discovery does not become unlicensed insurance-intermediary activity.

## Implementation Decisions

### Guided journey and category boundary

- The first slice will implement one guided journey spanning Business identity and authority, Marketplace Role approval, Listing creation and review, publication, category discovery, Phone Verification, Inquiry delivery, inbox handling, reporting, moderation, correction, reconsideration, and restoration.
- Vehicles, Vehicle Parts, Vehicle Accessories, and vehicle insurance will remain equal first-class categories with separate public result sets and category-specific contracts.
- Zambia is the only launch country, English is the launch language, Zambian locations are the only public geography, Zambian mobile numbers are the Phone Verification boundary, and ZMW is the base public currency.
- The guided journey will attach exception cases to the stage at which each failure can occur rather than creating a separate exception workflow.

### Business identity and Marketplace Roles

- One registered entity will map to one Business, and duplicate applications will route through authority-verified recovery or joining.
- Eligible Businesses are Zambia-registered companies, partnerships, and sole traders operating under registered business names.
- A Business Application will establish shared identity evidence, while Marketplace Role Applications will independently govern Vehicle Dealer, Parts Seller, Accessories Seller, and Insurance Provider eligibility.
- Business and Marketplace Role application states will be Draft, Submitted, Under Review, Changes Requested, Approved, Rejected, and Withdrawn.
- Continuing Business eligibility will be Active, Suspended, Revoked, or Closed, while Marketplace Role Standing will be Active, Suspended, Revoked, or Relinquished.
- Initial approval will always require a human decision, and high-impact decisions will require Independent Review.
- Business identity evidence will include authoritative PACRA status, legal-notice checks, representative authority, contact and location evidence, declarations, and the category-specific evidence required for each Marketplace Role.
- Eligibility will be attested annually, reverified after material changes, and monitored against evidence expiry and credible contrary information.
- Scope will remain narrow, so role-specific problems will not suspend the entire Business unless identity-level, cross-role, legal, safety, or binding eligibility grounds require it.

### Accounts, Representative Authorizations, and permissions

- A Marliket Account will authenticate one individual but will grant no Business authority by itself.
- Representative Authorization and Representative Permissions will be the source of truth, while Better Auth organization membership will remain only an access projection as required by ADR 0001.
- Every active Representative Authorization will require verified email, WhatsApp Phone Verification, private authority evidence, and human Operations approval for one Business.
- Representative Permissions will be the fixed composable bundles Business Administration, Eligibility Management, Listing Management, and Inquiry Management.
- Business Administration will include the other three bundles, require Independent Review when granted, and remain present on at least one active representative while the Business is Active.
- Representative Invitation states will be Pending, Accepted, Declined, Cancelled, and Expired, with single-use seven-day tokens and no Business access before authorization approval.
- Representative Authorization states will be Pending, Active, Suspended, Ended, Revoked, and Rejected.
- A normal authenticated session will last up to seven days and will end after 24 hours of inactivity.
- Sensitive Business actions will require a fresh sign-in and WhatsApp OTP that creates a ten-minute step-up window scoped to the selected Business.
- Every server-side Business action will recheck account status, selected Business, authorization state, permissions, and required step-up rather than trusting session claims or membership alone.
- Permission, removal, recovery, invitation, consolidation, and last-administrator transitions will be atomic and idempotent.
- Multi-Business access will be isolated, with no combined inbox, editor, evidence view, or bulk action in the first slice.

### Listing identity, category contracts, and revisions

- One Listing will belong to one Business, use one immutable category, publish under one approved Marketplace Role, and retain its identity across revisions and lifecycle changes.
- A Listing will contain the shared contract for ownership, category, title, description, location or Service Area, Public Media, Listing Price, Listing Availability, Inquiry routing, declarations, review history, publication timestamps, and change history.
- Each Listing will contain exactly one category-specific detail set, and irrelevant category fields will be rejected.
- One Vehicle Listing will represent one physical Vehicle and will require private full VIN or chassis identity, sale authority, actual media, structured specifications, condition, registration and import facts, material history, faults, modifications, and service-history disclosure.
- One Vehicle Part or Vehicle Accessory Listing will represent one sellable product specification, while differences in manufacturer, part number, condition, compatibility, material function, or price will require another Listing.
- Product Listings will require Product Condition, manufacturer or Unbranded status where permitted, identifiers, structured compatibility or a reviewable Universal designation, included items, warranty, provenance, authenticity, recall, testing, wear, defect, repair, and remaining-life facts as applicable.
- One Vehicle Insurance Listing will represent one named product from one Insurance Provider in one regulated capacity and will publish neutral current product facts rather than quotes, advice, underwriting, or promises.
- Public Media and Review Evidence will remain separate collections, with images and PDFs as the only first-slice native media types.
- Vehicle Listings will require at least eight current actual-vehicle photos, product Listings will require at least three current actual-product photos, and insurance Listings will require a current authoritative product PDF.
- Embedded contact details, URLs, QR codes, price overlays, deceptive edits, stolen material, AI-generated subject media, and defect-concealing media will be prohibited.
- Listing Revision review states will be Draft, Submitted, Under Review, Changes Requested, Approved, Rejected, and Withdrawn.
- Listing publication states will be Unpublished, Published, Paused, and Archived.
- Submitted revisions will be immutable, and every decision will remain bound to the exact revision and evidence reviewed.
- Approval will publish atomically only when every current gate passes, and rejection or withdrawal of a replacement will leave any still-truthful approved revision unchanged.
- Customer-facing facts, price, and media changes will require a new revision, while availability reductions, quantity, Inquiry routing, and publication pauses will be immediate audited operational changes.
- Sold will be terminal for a Vehicle Listing, while reversible availability may restore without content review only when the approved revision and evidence remain current.

### Price, availability, freshness, and routing

- Vehicle Listings will require an exact asking price, a separate negotiable flag, and disclosure of excluded mandatory charges.
- Vehicle Part and Vehicle Accessory Listings will require an exact ZMW price per unit and may use structured quantity tiers.
- Vehicle Insurance Listings will default to Quote Required and may show only evidence-backed starting amounts or ranges supported by approved product material.
- Vehicle authoritative pricing may use ZMW or USD only after the public USD legal gate closes, while qualifying insurance USD pricing will additionally require genuinely foreign-currency product evidence.
- USD displays will show the authoritative USD amount first and a dated Bank of Zambia 09:30 Africa/Lusaka mid-rate indicative ZMW conversion with source and non-settlement wording.
- A ZMW Vehicle Listing may show a dated indicative USD equivalent when the Customer selects USD for Vehicle price filtering.
- Public USD pricing will fall back to authoritative ZMW pricing when the legal display gate is not closed.
- Listing Availability will remain independent from review and publication state and will use category-specific values.
- Only Available Vehicles, In Stock or Available to Order products, and Available insurance products will accept new Inquiries.
- An unavailable Listing will leave default discovery immediately and will retain a labelled public URL with Inquiries disabled for 30 days.
- After that 30-day window, reversible unavailable Listings will pause and Sold Vehicle Listings will archive.
- Vehicle availability will require confirmation every 14 days, Part and Accessory availability every 30 days, and insurance availability every 90 days in addition to evidence-expiry checks.
- Missing confirmation will pause the Listing, and 90 consecutive paused days will archive it.
- Every published Listing will require an Inquiry route to active representatives with Inquiry Management for the same Business, and routing changes will affect future Inquiries only.

### Restricted subjects, claims, evidence, and monitoring

- Every Listing Subject will be classified as Prohibited, Restricted, or Standard before claims and publication gates are evaluated.
- Prohibited Listing Subjects will never publish, Restricted Listing Subjects will publish only when their additional private evidence conditions pass, and unclear correctable subjects will receive Changes Requested.
- Material safety unknowns will block publication, and `Unknown` will not be accepted for authority, identity, recall, safety-critical compatibility or authenticity, hazardous contents, insurance authority, or current insurance terms.
- Exceptional-History Vehicles will be Restricted Listing Subjects and will require applicable legal evidence, current independent condition evidence, repair records, current photos, and prominent disclosures.
- Stolen, unlawfully transferable, identifier-tampered, irreparably unsafe, or otherwise prohibited Vehicles will not publish.
- An open manufacturer safety recall will block publication until exact-identifier remedy completion is documented, and critical recall discovery will pause a live Listing immediately.
- Safety-Critical Products will require exact identity, provenance, authenticity, compatibility, current recall status, and condition evidence within the restricted-product rules.
- Defined single-use restraint, braking, fuel, and other safety components will not publish as Used or Refurbished products.
- Used or retreaded tyres will be no more than six years old, have at least 3 mm tread across every principal groove, pass a qualified specialist inspection within 30 days, retain required markings, and have no prohibited damage or open recall.
- Hazardous products will require exact identity, applicable conformity or authorization, safety and disposal information, intact packaging, and seller capability, while used fluids, altered labels, leaks, structural damage, expired products, and unverifiable contents will be prohibited.
- Material Listing Claims will match reviewed structured facts and specific Review Evidence, and disclaimers will not cure contradictions, omissions, unsupported superlatives, or false urgency.
- Recall, conformity, manufacturer status, foreign screening, condition evidence, and evidence-provider qualification will remain separate non-substitutable evidence layers.
- Manufacturer or authorized-distributor evidence will lead exact recall, remedy, authenticity, supersession, and fitment decisions within its scope, while separate qualified evidence will govern independent condition claims.
- Foreign recall sources will provide market-limited positive screening and will never establish a Zambia-market negative.
- Provider qualification will be exact to legal authority, activity, product, method, site, range, practitioner, signatory, accreditation schedule, equipment, calibration, and disclosed conflicts.
- Recall status will be checked at review and within 24 hours before initial publication or republication, while live Restricted Listings will be screened at least every seven days and after credible alerts.
- Vehicle condition evidence will expire after 30 days or 500 additional kilometres and on defined material changes, while tyre evidence will expire after 30 days and on defined fitment or condition events.
- Missing, ambiguous, stale, territorially mismatched, conflicted, inaccessible, or legally unusable safety evidence will fail closed.
- A source or provider contradiction will pause publication and open human review rather than being resolved by inferred source priority.

### Operations workflow and audit

- An Operations Case will be the shared auditable record for one review or enforcement matter, while queue, priority, owner, deadline, provisional controls, and escalation level will remain attributes.
- Operations Case states will be Open, In Review, Waiting on Business, Waiting on Specialist, Pending Independent Review, Dormant, and Resolved.
- First-slice queues will cover Business and Marketplace Role applications, Representative Authorizations where applicable, Listing Revision reviews, reports and enforcement, and renewals and reverification.
- Critical safety, fraud, legal, privacy, rights, and access-compromise cases will receive acknowledgement within one hour and an initial decision within 24 hours.
- Live-subject reports will be triaged within one business day, ordinary submissions within two business days, corrected submissions within two business days without losing original age, and reconsiderations within their resolved targets.
- Reviewers will record each versioned checklist item as passed, failed, unresolved, or not applicable with evidence, source, reviewer, check time, expiry, and notes.
- Operations will never silently rewrite a Business submission, Listing Revision, declaration, or evidence.
- Provisional controls will use the narrowest justified scope, remain non-final, expire after 72 hours unless supported and renewed, and preserve evidence and approved revisions.
- Independent Review will govern Insurance Provider approval, rejection, extended suspension, revocation, permanent restriction, serious findings, and lifting those measures.
- Reconsideration will be available for 30 days and later when material new evidence or a credible factual or procedural error warrants it, and it will use a reviewer independent from the original decision.
- Operations Case timelines will be append-only, and corrections will use linked superseding entries rather than mutation.
- Necessary Operations records and decision evidence will remain available through the active relationship and for 24 months after the last related activity unless the final Zambia retention matrix or a narrow legal hold changes the period.
- Quality control will sample at least 10 percent of routine approvals, correction requests, and report closures and will measure consistency and timeliness rather than commercial outcomes.

### Public discovery and Business profiles

- Locale-prefixed public category routes will be Vehicles, Parts, Accessories, and Insurance, and readable Listing URLs will contain stable Listing identifiers.
- Category landing pages will open directly into browsable inventory with search, explicit location, taxonomy shortcuts, result count, filters, sorting, and default results.
- Search will prioritize reviewed structured matches, then title, description, and reviewed compatibility, and will not cross categories.
- Unsearched Vehicles, Parts, and Accessories will default to newest first publication or materially reviewed refresh, while Insurance will sort by product and provider name.
- Vehicles, Vehicle Parts, and Vehicle Accessories may sort by price, and Vehicles may additionally sort by model year and odometer.
- The Vehicle price filter will accept ZMW or USD and will convert all matching Listings through one rate snapshot for filtering and sorting.
- Availability confirmation alone will not improve discovery freshness.
- Discovery will use explicit Zambia province and locality selection without precise device location, IP-based location inference, distance sorting, or result maps.
- Result cards and detail pages will expose only exact reviewed category facts and narrowly worded dated trust signals.
- Business profiles will show registered and trading names, dated registration and contact checks, active Marketplace Roles, approved public locations or Service Areas, active Listings, and insurance regulatory facts where relevant.
- Business profiles will not expose Authorized Representatives, private evidence, direct contact channels, suspended roles, archived Listings, or a Business-wide Inquiry form.
- Free-text results, arbitrary filters, pagination beyond the canonical category page, empty states, and unavailable pages will remain unindexed.

### Inquiry verification, delivery, abuse, and retention

- An Inquiry will concern exactly one published Listing and retain the exact reviewed Listing Revision, receiving Business, category, submission time, verification evidence, customer name, verified number, and optional callback time.
- Vehicle, Part, and Accessory Inquiries will accept a 10 to 1,000 character plain-text message, while insurance will collect no message or proposal information.
- WhatsApp OTP will be the only first-slice Phone Verification channel, and Turnstile will protect every OTP request.
- OTP and verified-Inquiry velocity thresholds will follow the resolved configurable limits, use device, IP, Listing, Business, and content signals only as supporting evidence, and never block solely on IP address.
- The Business inbox will store the Inquiry before WhatsApp or email notification attempts and will remain the source of truth.
- Business notifications will include minimal Listing context and a secure link without customer phone or message content.
- Notification channels will retry independently with bounded backoff, and provider failure will create auditable Operations visibility without duplicating the Inquiry.
- Idempotency tokens and the defined same-number, same-Listing, same-normalized-message 15-minute rule will suppress exact duplicates without fuzzy matching.
- New Inquiries will fail when the exact Listing Revision is no longer public, available, accepting Inquiries, or backed by an eligible Marketplace Role.
- Business and Customer reports will create auditable signals rather than automatic punishment, and Business blocks will remain scoped to one Business.
- Direct Inquiry content will leave ordinary Business access after 12 months, supporting delivery and moderation records will remain for 24 months after related activity, and raw IP and device-risk data will remain no more than 90 days unless attached to an active case.
- OTP codes will be deleted after success, expiry, or invalidation, while only the bounded result and provider reference will remain.
- The final Zambia legal-retention matrix may alter these defaults, and narrow legal holds will record reason, owner, and expiry review.

### Reference data and source governance

- Marliket will own stable internal identities for places, vehicle makes, model families, generations, variants, customer categories, coverage families, and source mappings.
- Every external mapping will retain source identity, version, retrieval and effective dates, rights basis, attribution, evidence or batch reference, review state, coverage notes, and supersession.
- Zambia authorities will anchor administrative and regulatory meaning only after the applicable reuse permission or legal review is recorded.
- GeoNames may seed licensed populated-place coordinates, while production geocoding and maps will require a contractually suitable provider or compliant self-hosting.
- The vehicle catalogue will be Zambia-aware, will treat vPIC only as enrichment, and will support reviewed provisional records for valid local Vehicles missing from external sources.
- Vehicle Part and Vehicle Accessory navigation will use Marliket-owned shallow trees with versioned replaceable crosswalks.
- Fitment records will carry exact, conditional, or Universal scope, all required qualifiers, source and version, evidence, installation requirements, exclusions, review state, and supersession.
- A fitment source miss will not become a negative, and unsupported compatibility will not create discovery matches or satisfy safety-critical publication.
- Insurance regulatory class and customer-facing coverage family will remain separate, and detailed facets will come only from current insurer-approved wording and Key Fact Statements or equivalent evidence.
- Reference imports will stage auditable diffs, preserve immutable identities and historical interpretation, and route material conflicts through Operations review.

### Application and service boundaries

- Marketplace policy will live in pure domain cores with database-aware services layered on top.
- The customer application will own public category discovery, Listing and Business detail, Phone Verification, Inquiry, receipts, reporting, and contact-preference experiences.
- The Business console will own applications, Representative Authorizations, permissions, Listings, evidence, availability, Inquiry inbox, reports, corrections, reconsideration, and renewal experiences.
- The Operations console will own queues, Operations Cases, evidence access, checklists, decisions, provisional controls, Independent Review, Reconsideration, audit, and quality review.
- The Hono service will expose versioned domain APIs through the typed client contract and will enforce every authorization, state, idempotency, and atomic publication rule on the server.
- Database services will preserve immutable revisions, append-only decision history, exact evidence references, effective state, idempotency, retention markers, and auditable transitions.
- Scheduled application work will monitor availability confirmations, evidence expiry, reference freshness, recall screening, provider status, retention, notifications, and Operations deadlines through the same domain services used by requests.
- External messaging, verification, Turnstile, regulator, map, exchange-rate, storage, and reference-data providers will be adapters behind explicit domain interfaces with auditable results and safe failure behavior.

### Launch gates

- Production personal-data processing will remain disabled until Data Protection Commissioner registration, Zambia hosting or required foreign-processing authorization, processor agreements, subprocessor inventory, privacy and rights procedures, retention, breach response, and any required impact assessment are complete.
- Insurance publication will remain disabled until the Pensions and Insurance Authority or Zambian counsel confirms the exact publisher, referral data, routing, analytics, and compensation model.
- Public USD vehicle display will remain disabled until written Zambia legal or Competition and Consumer Protection Commission confirmation resolves legal-tender display, displayed-price commitment, and simultaneous-price rules.
- Bulk Zambia administrative, vehicle, regulatory, warning, recall, or standards data use will remain disabled until permission, contract, or legal review covers the intended storage, transformation, automation, and republication.
- Production mapping will remain disabled until provider licence, attribution, privacy, caching, service-level, and storage terms are acceptable.
- Commercial fitment data will remain disabled until marketplace and derivative-data rights plus empirical Zambia fleet coverage are confirmed.
- Restricted Vehicle, Part, and Accessory publication will remain disabled where identifier-specific recall, conformity, provider, or evidence coverage cannot satisfy the fail-closed rules.
- Operations will test pause, evidence preservation, notification, remedy confirmation, provider suspension, and republication procedures before Restricted Listings publish.
- When a gate blocks only one category, subject class, claim, currency, or provider-dependent capability, Marliket will disable that scope instead of weakening the evidence contract.

## Testing Decisions

- Tests will assert externally visible behavior, state transitions, authorization outcomes, persisted audit effects, and provider boundaries rather than private implementation structure.
- The primary acceptance seam will be one browser-level, database-backed guided journey spanning the Business console, Operations console, customer marketplace, and real HTTP API boundary.
- The guided journey will start with an unaffiliated person, establish a Business and initial Authorized Representative, approve a Marketplace Role, create and review a Listing, publish it, discover it as a Customer, complete Phone Verification through a test provider, submit an Inquiry, and observe it in the Business inbox.
- The same guided journey contract will be parameterized across Vehicles, Vehicle Parts, Vehicle Accessories, and vehicle insurance with category-specific data, media, evidence, availability, discovery, detail, and Inquiry assertions.
- Exception cases will attach to the relevant journey stage and will cover duplicate Business recovery, denied authority, missing permissions, stale step-up, Changes Requested, failed publication gates, restricted and prohibited subjects, stale evidence, recall discovery, availability expiry, duplicate Inquiry submission, provider failure, abuse controls, reporting, suspension, reconsideration, and restoration.
- The browser seam will use real application routing, the real typed API, real server authorization, and a disposable PostgreSQL database, while external providers will be deterministic test adapters at their network boundaries.
- Browser acceptance will verify desktop and mobile layouts, keyboard and screen-reader behavior, focus management, persistent actions, error and loading states, URL restoration, public indexing directives, and pixel-level fit and finish.
- Focused Hono route tests will protect request and response contracts, standard envelopes, current authorization checks, idempotency, atomic publication gates, and invocation disposal using the server's strict application-module test helpers.
- Pure marketplace policy tests will cover the combinatorial eligibility, permission, Listing classification, claim, availability, freshness, evidence, provider, pricing, retention, and state-machine rules that would be prohibitively slow or opaque through browser tests.
- Database integration tests will protect uniqueness, immutable revision history, append-only audit records, atomic last-administrator and publication transitions, scoped suspension, idempotent Inquiry creation, and retention selection.
- Scheduled-work tests will use a fixed clock to protect reminders, expiry, freshness, pause, archive, recall-screening, retry, retention, and escalation behavior.
- Contract tests will protect provider adapters against the exact normalized facts the domain consumes without relying on live external services in ordinary CI.
- Security tests will verify cross-Business isolation, permission reduction across sessions, private evidence access, report confidentiality, signed links, generic blocked responses, and the absence of customer details in outbound Business notifications.
- Privacy tests will verify purpose-limited collection, notice version recording, OTP deletion, retention transitions, legal holds, data minimization, and the absence of insurance proposal data.
- Discovery tests will verify category separation, structured filters, URL state, canonical and noindex behavior, trust-signal wording, unavailable windows, Sold tombstones, and the absence of unsupported fields or direct contact channels.
- Prior art will come from the existing server HTTP-boundary suites, strict application-module helpers, fixed invocation clock, database tests that opt in to PostgreSQL, application component tests, and typed API client tests.
- The new browser harness will be the only new highest-level seam, and lower-level suites will support fast diagnosis and combinatorial policy coverage rather than duplicate the complete journey.

## Out of Scope

- Checkout, payment, settlement, financing, reservations, escrow, shipping, delivery, and fulfillment are outside this specification.
- Insurance quoting, comparison, recommendation, suitability assessment, proposal or underwriting data, policy issuance, premium handling, claims, and insurance-linked compensation are outside this specification.
- Vehicle ownership transfer, transaction due diligence, and post-sale workflows are outside this specification.
- Private sellers, unregistered individuals trading under personal names, multi-country expansion, and currencies beyond the resolved ZMW and legally gated USD presentation are outside this specification.
- Customer account features, saved Listings, comparison tools, recently viewed history, personalized recommendations, behavioral profiles, and Customer inquiry history are outside this specification.
- Paid placement, popularity ranking, monetization, promotions, discount claims, and behavioral advertising are outside this specification.
- Video, audio, external media embeds, remote image URLs, masked-number relay, SMS OTP, and scheduled publishing are outside this specification.
- Distance sorting, result maps, precise device location, silent IP location, and public boundary geometry are outside this specification.
- Custom Business roles, teams, combined cross-Business management, and authentication membership as an authority source are outside this specification.
- Automated approval, automated rejection, opaque message suppression, report-count punishment, and automatic regulator or law-enforcement referral are outside this specification.
- Provider procurement, regulator applications, legal opinions, production infrastructure provisioning, data migration, deployment, staffing, and launch execution are outside this specification, although their product launch gates are binding.

## Further Notes

- The completed Wayfinder and its eleven resolved child issues are the decision source for this specification.
- The Zambia insurance and verification, marketplace taxonomy and compatibility, and recall, conformity, and inspection research notes remain the detailed source-governance references behind the summarized launch gates.
- ADR 0001 remains binding, so implementation must close the current gap between Better Auth organization membership and marketplace Representative Authorization before Business actions are enabled.
- The later customer-discovery decision amends the earlier ZMW-only Listing Price boundary for Vehicles and qualifying insurance only, subject to the recorded legal gates, while Parts and Accessories remain ZMW-only.
- The validated throwaway prototype found no additional product, interaction, accessibility, responsive, or acceptance-boundary decisions and established the guided journey as the organizing frame.
- Launch gates are resolved product constraints rather than remaining Wayfinder fog, and an implementation must keep blocked capabilities disabled until the relevant evidence of closure is recorded.
- This specification is large enough to require tracer-bullet ticket slicing before implementation rather than one undifferentiated delivery ticket.
