# Marliket domain vocabulary

Marliket is an automotive marketplace where businesses with approved marketplace roles publish vehicles, vehicle parts, vehicle accessories, and vehicle insurance for customers to discover and inquire about.

## Language

**Business**:
A Zambia-registered company, partnership, or sole trader operating under a registered business name whose identity and shared eligibility evidence are established once and which may pursue multiple Marketplace Roles.
_Avoid_: Dealer as an umbrella term

**Business Application**:
The submission through which an applicant establishes a Business identity and provides evidence shared across its requested Marketplace Roles.
_Avoid_: Marketplace Role Application

**Business Location**:
A verified physical premises associated with a Business and referenced by a Listing as the place where its vehicle or product can be inspected or obtained.
_Avoid_: Service Area

**Marliket Account**:
The single authentication identity through which one individual accesses Marliket.
It proves control of the account's credentials but does not establish the individual's identity, Customer status, or authority to represent a Business.
_Avoid_: Customer account, Business account

**Representative Invitation**:
A Business-scoped request for an individual to seek authority to represent that Business.
Accepting it permits only the invitation and authority-evidence flow and does not grant access to the Business or its records.
_Avoid_: Member invitation

**Representative Authorization**:
The human-approved, Business-specific relationship that empowers one Marliket Account holder to act as an Authorized Representative for that Business.
The same individual requires a separate Representative Authorization for every Business they represent.
_Avoid_: Organization membership

**Representative Authority Evidence**:
Private identity, officeholder, and explicit Business authorization material used to establish the scope and validity of a Representative Authorization.
It never becomes a public trust signal or Public Media.
_Avoid_: Business eligibility evidence, Identity Verification

**Authorized Representative**:
An individual whose active Representative Authorization permits them to act on behalf of one Business within their granted Representative Permissions.
_Avoid_: Account owner

**Representative Permission**:
One of the four fixed Business-scoped capability bundles granted to an Authorized Representative: Business Administration, Eligibility Management, Listing Management, or Inquiry Management.
Multiple Representative Permissions may be combined, while custom roles and teams are not part of the first marketplace slice.
_Avoid_: Marketplace Role, custom role

**Marketplace Role**:
The independently governed category-specific authorization through which a Business participates as a Vehicle Dealer, Parts Seller, Accessories Seller, or Insurance Provider.
Each role has its own Marketplace Role Standing and Marketplace Role Eligibility, and the Business may submit listings in that category only while the role is eligible.
_Avoid_: Verified business

**Marketplace Role Standing**:
The recorded continuing state of an approved Marketplace Role: Active, Suspended, Revoked, or Relinquished.
It remains distinct from whether the role is currently eligible to be exercised.
_Avoid_: Continuing eligibility state, Marketplace Role status

**Marketplace Role Eligibility**:
The current determination of whether a Business may exercise one Marketplace Role, requiring Active Marketplace Role Standing, current eligibility evidence, and a current Marketplace Role Attestation.
_Avoid_: Marketplace Role Standing, approval status

**Marketplace Role Attestation**:
An annual declaration by an Authorized Representative that no material facts affecting one Marketplace Role have changed.
It renews only the attestation deadline and never extends or replaces eligibility evidence or an Operations decision.
_Avoid_: Attestation

**Marketplace Role Renewal**:
An evidence-bound Operations review through which a Business refreshes or updates the eligibility basis for a Marketplace Role it already holds.
Starting a renewal does not extend current eligibility, and approval refreshes the reviewed evidence and attestation deadlines without changing Marketplace Role Standing.
_Avoid_: Reapplication, Marketplace Role Attestation

**Marketplace Role Relinquishment**:
A Business's voluntary and irreversible surrender of one Marketplace Role.
It immediately ends eligibility for that role, and any future participation in the same category requires a fresh Marketplace Role Application and full review rather than renewal or restoration.
_Avoid_: Withdrawal, suspension, revocation, cancellation

**Marketplace Role Application**:
A Business's request for one Marketplace Role, evaluated independently of its other Marketplace Role Applications.
_Avoid_: Business Application

**Vehicle Dealer**:
A Business holding the Marketplace Role that permits it to offer vehicles.
_Avoid_: Vehicle Seller

**Vehicle Condition**:
A vehicle's canonical New or Used classification based on whether it has previously been registered, delivered, or used in ordinary service.
Delivery or demonstration mileage does not by itself make a vehicle Used, while import history, refurbishment, and certification remain separate facts.
_Avoid_: Foreign used, Local used, Reconditioned as condition values

**Exceptional-History Vehicle**:
A vehicle with a salvage or rebuilt history, theft recovery, flood or fire damage, structural repair, or material modification.
It is a Restricted Listing Subject.
_Avoid_: Damaged vehicle as an umbrella term

**Parts Seller**:
A Business holding the Marketplace Role that permits it to offer Vehicle Parts.

**Accessories Seller**:
A Business holding the Marketplace Role that permits it to offer Vehicle Accessories.

**Vehicle Part**:
A product that replaces, repairs, or maintains a vehicle's functional, structural, mechanical, or electrical systems.
_Avoid_: Vehicle Accessory

**Product Condition**:
A Vehicle Part or Vehicle Accessory is New when never installed or used, Used when previously installed or used and offered in its current state, or Refurbished when restored through a disclosed inspection and repair process.
A Refurbished claim identifies who performed the work, what was done, and what warranty applies.
_Avoid_: Like new, Vehicle Part Condition, Vehicle Accessory Condition

**Vehicle Accessory**:
An optional product that changes a vehicle's appearance, comfort, convenience, protection, or personalization without being needed to restore normal vehicle function.
_Avoid_: Vehicle Part

**Safety-Critical Product**:
A Vehicle Part or Vehicle Accessory whose failure, incorrect fitment, or misuse could materially impair braking, steering, suspension, wheel retention, tyre integrity, structural or occupant-restraint performance, fuel or high-voltage safety, required visibility, lighting, or road signalling.

**Insurance Provider**:
A Business independently verified as legally authorized to market or arrange vehicle insurance in Zambia in its disclosed regulated capacity.
_Avoid_: Insurer, unless the Business underwrites the insurance

**Vehicle Insurance Listing**:
A Listing through which one Insurance Provider describes one named vehicle insurance product in its disclosed regulated capacity for customer discovery and inquiry.
The named product is a Restricted Listing Subject.
It is not a quote, binder, policy, underwriting decision, or promise of coverage.
_Avoid_: Insurance Policy, Insurance Quote

**Service Area**:
The structured Zambia-wide or province-level territory in which a Vehicle Insurance Listing is available.
_Avoid_: Business Location

**Customer**:
A person who discovers marketplace listings and may submit an inquiry without creating an account.
_Avoid_: User, buyer

**Inquiry**:
A contact request about exactly one published Listing that a Customer submits to that Listing's receiving Business without creating an account, reservation, or transaction.
Marliket records an Inquiry when it is submitted and delivers it to that Business only after Phone Verification.
It carries the exact reviewed Listing Revision and the minimum details the Business needs to reply.
_Avoid_: Lead, message

**Phone Verification**:
A successful WhatsApp one-time-passcode challenge proving control of a Zambian mobile number at a recorded moment.
It does not establish the person's identity, ownership of the SIM, or authority to represent a Business.
_Avoid_: Identity Verification, Owner Verification

**Listing**:
A category-specific marketplace entry through which one Business presents one Listing Subject under one approved Marketplace Role for Marliket review, customer discovery, and inquiry.
It retains its identity through review, publication, edits, withdrawal, and republication, while its category remains fixed.
_Avoid_: Offer, advertisement

**Listing Subject**:
The vehicle, Vehicle Part, Vehicle Accessory, or vehicle insurance product that one Business asks Marliket to present through one Listing.
Every Listing Subject carries exactly one of the mutually exclusive Prohibited, Restricted, and Standard classifications.
Prohibited takes precedence over Restricted and Restricted takes precedence over Standard, so a Listing Subject that meets the conditions of a higher classification carries that classification even when a lower one also describes it.

**Material Listing Claim**:
A statement, image, document, badge, omission, or implication likely to affect a Customer's judgment about a Listing Subject's identity, ownership, authority, provenance, authenticity, history, mileage, condition, safety, performance, compatibility, price, availability, warranty, approval, or insurance terms.
It requires specific Review Evidence and must agree with the Listing's structured facts and disclosures.

**Prohibited Listing Subject**:
A Listing Subject that Marliket will not publish under any evidence or disclaimer.

**Restricted Listing Subject**:
A Listing Subject that Marliket may publish only after its category-specific conditions and private Review Evidence are satisfied.

**Standard Listing Subject**:
A Listing Subject governed by the normal Listing contract and review without additional subject-specific publication conditions.

**Public Media**:
The ordered images and documents that a Business intentionally publishes for Customers as part of a Listing.
_Avoid_: Review Evidence

**Review Evidence**:
Private material submitted to establish a Listing's accuracy, authority, or eligibility for Marliket review.
It remains visible only to the Business and Marliket operations and never becomes Public Media automatically.
_Avoid_: Public Media

**Listing Price**:
The authoritative currency and price presentation attached to a Listing Revision: an exact asking amount for a Vehicle, an exact per-unit amount for a Vehicle Part or Vehicle Accessory, or Quote Required or an evidence-backed starting amount or range for vehicle insurance.
Vehicles and qualifying vehicle insurance may use ZMW or legally gated USD, Vehicle Parts and Vehicle Accessories remain ZMW-only, and indicative conversions, negotiability, units, quantity tiers, and excluded mandatory charges are disclosed separately from the Listing Price.
_Avoid_: Contact for price, Placeholder price

**Exchange Rate Snapshot**:
An immutable source-dated currency rate used for every cross-currency comparison and indicative conversion within one public marketplace read.
It never changes the authoritative currency or amount of a Listing Price and is not a settlement rate.
_Avoid_: Live exchange rate, Settlement rate

**Discovery Freshness**:
The timestamp used to order default discovery after first publication or publication of a materially reviewed replacement Listing Revision.
Availability confirmation, restoration, views, clicks, inquiries, and payment never change it.
_Avoid_: Availability confirmation time, Listing update time

**Listing Availability**:
The category-specific customer-facing classification of whether a Listing Subject can currently receive new Inquiries.
It is independent of the Listing's review and publication state.
_Avoid_: Listing Status

**Listing Revision**:
A versioned snapshot of a Listing's content that a Business submits as one unit for Marliket review.
It becomes immutable when submitted, and review decisions apply to that revision without changing the Listing's continuing identity.
_Avoid_: Listing

**Operations Case**:
The shared auditable record for one operations review or enforcement matter.
Specialized operations queues are organized views of Operations Cases rather than separate records.
_Avoid_: Moderation ticket, review ticket

**Decision Proposal**:
An immutable proposed Operations decision that has no effect unless and until its required Independent Review confirms it.
_Avoid_: Pending decision

**Independent Review**:
The review of a Decision Proposal by an eligible Operations reviewer other than its author, who either confirms or declines it before any effect occurs.
_Avoid_: Second approval, independent approval, dual control

**Reconsideration**:
A request for a reviewer who did not participate in the original decision to reassess a final adverse decision, ordinarily within 30 days and later only when material new evidence or a credible factual or procedural error warrants review.
It preserves the original decision and produces a new recorded outcome rather than editing history.
_Avoid_: Appeal, correction, resubmission, renewal
