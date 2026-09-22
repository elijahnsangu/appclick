# Recall, conformity, and inspection evidence sources

Date: 2026-07-27.

Status: Research decision for [Research recall, conformity, and inspection evidence sources](https://github.com/elijahnsangu/marliket/issues/36) under [Wayfinder: First marketplace slice](https://github.com/elijahnsangu/marliket/issues/18).

## Question

Which legally authoritative and operationally usable sources can support recall, conformity, roadworthiness, authenticity, product-safety, and inspection decisions for Vehicles, Vehicle Parts, and Vehicle Accessories published in Zambia?

What qualification, independence, scope, freshness, conflict, calibration, failure, and fallback rules should Marliket apply to evidence providers?

## Method and boundary

This research uses primary sources only, including legislation, regulator pages, accreditation registers, standards-owner pages, recall authorities, and manufacturer or authorized-distributor material.

The research distinguishes legal authority, public access, reuse permission, territorial coverage, identifier coverage, and Marliket's product recommendation because those properties are not interchangeable.

This is product and source-governance research rather than legal advice, and Zambia counsel must confirm the consolidated law, compulsory-standard schedule, and planned data uses before launch.

The decision preserves the existing restricted-subject policy that an open manufacturer safety recall blocks publication, exact fitment and other safety-critical facts cannot be `Unknown`, independent condition inspection cannot replace recall verification, and every material claim remains limited to what its evidence proves.

## Decision

Marliket must operate a layered evidence system rather than treating any single regulator, recall database, certificate, or inspection as universal clearance.

The minimum layers are Zambia legal and regulatory status, manufacturer or authorized-distributor identifier status, market-specific foreign recall screening, product or vehicle condition evidence, and evidence-provider qualification.

A pass in one layer never cures a failure or absence in another layer.

A Zambia roadworthiness certificate proves only the statutory examination outcome and date within its legal scope, not the absence of a manufacturer recall, genuine-part status, exact fitment, remaining service life, or the truth of every Listing claim.

A manufacturer or authorized distributor is the primary source for VIN or chassis campaign applicability, completion status, part-number fitment, and brand authenticity, but it is not independent evidence of general vehicle condition.

Zambia regulators are primary for Zambia legal status, compulsory standards, import controls, roadworthiness, market action, and consumer warnings, but the reviewed public services do not form a complete VIN, serial, or batch recall database.

NHTSA, UK DVSA, EU Safety Gate, and Japan MLIT are useful market-specific screening sources only when the subject's provenance and identifier fall within that source's market and coverage.

A negative result from a foreign source is never evidence that a Zambia-market vehicle or product has no open recall.

An unavailable, ambiguous, stale, territorially mismatched, or legally unusable source leaves the relevant safety gate unsatisfied rather than producing an inferred clearance.

## Zambia authority and source matrix

| Source | Legal or evidential role | Public access and reuse position | Coverage and product recommendation |
| --- | --- | --- | --- |
| Road Transport and Safety Agency | RTSA is established by the [Road Traffic Act No. 11 of 2002](https://www.rtsa.org.zm/wp-content/uploads/2019/09/The-Road-Traffic-Act-No-11-of-2002.pdf), registers vehicles, performs vehicle examinations, and issues roadworthiness-related outcomes through the services described by [RTSA examinations](https://www.rtsa.org.zm/transport/examinations/) and [RTSA registration](https://www.rtsa.org.zm/transport/registration/). | The reviewed RTSA pages are publicly readable, but they publish no open-data licence or supported bulk verification interface, while account-based services are routed through [ZamPortal](https://www.rtsa.org.zm/pay-online/). | Use a current RTSA result for Zambia registration, physical-examination, roadworthiness, and de-registration status within the result's stated scope, but never use it as recall, authenticity, fitment, or comprehensive condition clearance. |
| Zambia Compulsory Standards Agency | The [Compulsory Standards Act No. 3 of 2017](https://www.parliament.gov.zm/node/7327) establishes ZCSA and its public-safety, consumer-protection, and environmental mandate, while ZCSA describes import monitoring, domestic monitoring, factory inspection, and post-market surveillance on its [inspection page](https://www.zcsa.org.zm/index.php/inspections/). | ZCSA publishes a [current list of compulsory standards](https://www.zcsa.org.zm/index.php/list-of-compulsory-standards/), inspection information, and regulatory downloads for public reading, but the reviewed pages state no open-data licence for systematic copying or republication. | Treat a compulsory standard, ZCSA permit, import clearance, non-conforming-product action, or market-surveillance notice as authoritative within the specified product and legal scope, and obtain permission or legal approval before bulk ingestion or republication. |
| ZCSA used-vehicle roadworthiness scheme | ZCSA states that ZS 560 is compulsory and that appointed agents perform pre-shipment roadworthiness inspection for used vehicles exported to Zambia from named origin countries under its [Vehicle Roadworthiness Inspection scheme](https://www.zcsa.org.zm/index.php/roadworthiness-inspetion-of-imported-used-vehicles/). | The scheme page is publicly readable, but verification data, agent appointment status, certificate validation, and reuse terms are not exposed there as an open dataset. | Require the applicable ZCSA pre-shipment result for an imported used vehicle when the scheme applies, verify the agent and certificate with ZCSA, and still require the separate RTSA and manufacturer-recall gates. |
| ZCSA tyre and automotive product controls | The current compulsory list includes lead-acid batteries, pneumatic tyres under ZS 437:2017, engine oils, automotive gear oils, and other specified products, and the [consolidated list](https://www.zcsa.org.zm/wp-content/uploads/2025/08/New-Consolidated-List-of-Compulsory-Standards.pdf) ties each listed product to a standard and statutory instrument. | The list is publicly downloadable, but the standards themselves are not made open by publication of their identifiers. | Resolve every relevant Vehicle Part or Vehicle Accessory against the current compulsory list and require the product-specific ZCSA evidence before publication when regulated. |
| Zambia Bureau of Standards | The [Standards Act No. 4 of 2017](https://www.parliament.gov.zm/sites/default/files/documents/acts/Standards%20Act%20No.%204%20of%202017.pdf) assigns national standards functions to ZABS, and ZABS describes standards development, testing, and voluntary certification on its [institutional page](https://www.zabs.org.zm/) and [standards-development page](https://www.zabs.org.zm/standards-development). | The [ZABS terms](https://www.zabs.org.zm/terms) state that website content and standards are protected, that a purchased standard is licensed for internal use, and that standards may not be reproduced or distributed without permission. | Use ZABS to identify and lawfully obtain the applicable standard and to obtain in-scope testing or certification, but do not reproduce standards in Marliket and do not describe a voluntary ZABS certification as a compulsory legal approval. |
| Competition and Consumer Protection Commission | Section 49 of the [Competition and Consumer Protection Act No. 24 of 2010](https://www.parliament.gov.zm/sites/default/files/documents/acts/The%20Competition%20and%20Consumer%20Protection%202010.pdf), as amended by [Act No. 21 of 2023](https://www.parliament.gov.zm/sites/default/files/documents/acts/Act%20No.%2021%20of%202023%2C%20The%20Competition%20and%20Consumer%20Protection%20%28Amendment%29.pdf), prohibits defective or unsuitable goods and permits CCPC to recall a product, while the 2023 amendment incorporates COMESA rules that provide for product-safety warnings and compulsory recalls. | CCPC publishes public notices, including identifier-specific recall warnings such as its [Appletiser batch recall](https://www.ccpc.org.zm/details/54), but the reviewed site states no open-data licence or complete recall-feed contract. | Treat a CCPC or domesticated COMESA warning, withdrawal, or recall that covers Zambia and the subject identifier as a publication block, while recognizing that absence from CCPC's public pages is not proof of absence. |
| Current Zambia amendments | The National Assembly records the [Competition and Consumer Protection Amendment Act No. 21 of 2023](https://www.parliament.gov.zm/node/11544), the [Competition and Consumer Protection Commission Amendment Act No. 48 of 2026](https://www.parliament.gov.zm/node/13355), and the [Standards Amendment Act No. 58 of 2026](https://www.parliament.gov.zm/node/13370). | The official Acts are publicly readable, but Marliket needs a consolidated legal interpretation rather than relying on frozen section numbering from an earlier Act. | Make launch counsel confirmation of the consolidated consumer-protection and standards law a gate, while continuing to treat the operative product-warning and recall powers as binding. |

## What the Zambia sources do not provide

The reviewed RTSA, ZCSA, ZABS, and CCPC services do not expose one complete public service that accepts every Zambia-market VIN or chassis number and returns all open manufacturer safety campaigns.

The reviewed Zambia services also do not expose a complete serial or batch registry for all Vehicle Parts and Vehicle Accessories, all product withdrawals, all counterfeit findings, and all remedy completion statuses.

The absence of a record on a public Zambia webpage therefore cannot support a `No open recall`, `Authentic`, `Approved`, or `Safe` claim.

The lack of a complete public database is a launch integration gate, not permission to infer a negative result.

## Manufacturer and authorized-distributor evidence

The vehicle manufacturer or its territory-authorized distributor is the first identifier-specific source for campaign applicability and remedy status because the foreign regulator sources expressly defer some individual identifier questions to manufacturers.

Japan MLIT states that its public search works by name, model, and notification date and directs users seeking chassis-number applicability to the manufacturer or seller on its [recall search guidance](https://www.mlit.go.jp/jidosha/carinf/rcl/recall_searchinfo.html).

NHTSA states that its VIN result can omit repaired recalls, some recently announced recalls, recalls older than 15 years, some small manufacturers, non-safety campaigns, and recalls involving an international vehicle on its [consumer recall page](https://www.nhtsa.gov/recalls).

Marliket must therefore collect a result from the manufacturer's official identifier service or a dated written confirmation from the manufacturer or Zambia-authorized distributor that records the identifier queried, campaign references, open or completed status, query time, market or territory, and source.

For a grey import, Marliket must query the manufacturer or authorized representative for the vehicle's original market and the Zambia authorized distributor when one can support the chassis, because either market alone may have incomplete campaign visibility.

CFAO Mobility Zambia identifies itself as the Zambia-authorized distributor for Toyota, Ford, Suzuki, Volkswagen, Hino, and Sinotruk on its [official Zambia site](https://cfao.co.zm/), which makes it an appropriate first-party route for supported vehicles but not proof that it covers every imported chassis.

Toyota Zambia's own used-vehicle guidance tells customers to check recall or special-service-campaign status with the Zambia dealer and supplies a VIN checker in its [Automark guidance](https://www.toyotazambia.co.zm/wp-content/uploads/2023/06/Automark-A4-brochure-c.pdf).

An open manufacturer safety recall blocks publication even if RTSA, ZCSA, a condition inspector, or a foreign database otherwise passes the vehicle.

Re-publication after a recall requires manufacturer or authorized-distributor evidence that the remedy is complete for the exact VIN or chassis, followed by a fresh recall query.

## Vehicle Part and Vehicle Accessory evidence

Part and accessory recall screening must use the exact available identifier, including manufacturer, brand, part number, serial number, batch or lot, date code, production range, and intended market.

The product identifier must be checked against Zambia regulator actions, the manufacturer and territory-authorized distributor, and an applicable foreign regulator source only when that source covers the product type and market.

NHTSA's recall dataset covers vehicles, tyres, child safety seats, and motor-vehicle equipment, but its metadata specifies United States granularity on the [official datasets and APIs page](https://www.nhtsa.gov/nhtsa-datasets-and-apis).

UK DVSA publishes vehicle and other equipment recalls, including examples such as tyres and child seats, and offers a downloadable record from 1992 on its [official recall service](https://www.check-vehicle-recalls.service.gov.uk/).

EU Safety Gate publishes alerts for dangerous non-food products, including motor vehicles and accessories, through the [Safety Gate service](https://ec.europa.eu/safety-gate/).

Japan MLIT's public recall search includes automobiles, child seats, and tyres, but individual chassis applicability must still be confirmed with the manufacturer under its [search guidance](https://www.mlit.go.jp/jidosha/carinf/rcl/recall_searchinfo.html).

An official manufacturer withdrawal, stop-sale, safety campaign, ZCSA action, CCPC or COMESA warning, or applicable regulator recall blocks publication for every identifier within the action.

If the published action identifies a range but the item's serial or batch cannot be read and applicability cannot be excluded by the manufacturer, the safety-critical fact is unresolved and publication remains blocked.

## Authenticity and counterfeit evidence

No reviewed Zambia authority exposes a universal public serial-authentication registry for all brands and categories.

Marliket must not convert packaging appearance, a logo, a barcode scan, a seller invoice, or a generic laboratory pass into an unqualified `Genuine` claim.

Acceptable authenticity evidence is a positive identifier-specific confirmation from the manufacturer or territory-authorized distributor, or a traceable authorized-channel record that the manufacturer or distributor confirms covers the exact item.

The evidence must retain the supplier identity, invoice or shipment reference, part number, serial or batch where issued, source channel, date, and confirmation scope.

Toyota Zambia explains that its dealer catalogue selects parts for a specific vehicle and that genuine parts are available through its authorized outlets on its [genuine-parts page](https://www.toyotazambia.co.zm/toyota-genuine-parts/), which supports authorized-channel evidence for Toyota but cannot authenticate another brand or an item outside the documented channel.

Toyota Zambia also warns that counterfeit safety-critical components include brake pads and airbags on its [anti-counterfeit page](https://www.toyotazambia.co.zm/anti-counterfeit/), which supports treating counterfeit suspicion as a safety issue rather than a merchandising dispute.

A manufacturer or distributor refusal, mismatch, ambiguous identifier, broken chain of custody, altered label, or credible counterfeit warning changes the decision to `Changes Requested` or an immediate publication pause.

A repairer or inspector may document counterfeit indicators, but only the rights holder, authorized distributor, regulator, or legally competent adjudicator can support a positive authenticity conclusion for publication.

## International fallback sources

| Source | Authority and coverage | Reuse position | Marliket use |
| --- | --- | --- | --- |
| United States NHTSA | NHTSA records United States safety recalls for vehicles, tyres, child seats, and motor-vehicle equipment, and its consumer VIN service identifies important omissions on the [recall page](https://www.nhtsa.gov/recalls). | NHTSA provides downloadable campaign datasets, but its [API use policy](https://api.nhtsa.gov/) expressly says that the API is not intended for bulk VIN lookups. | Use campaign data for United States-market screening and one-at-a-time VIN checks where allowed, but never use a negative result as Zambia-market absence proof or evade the bulk-use restriction. |
| United Kingdom DVSA | DVSA publishes vehicle and equipment safety recalls and describes its result as indicative at the specified date in the [service terms](https://www.check-vehicle-recalls.service.gov.uk/terms-and-conditions). | The terms state that most service content is Crown copyright under the Open Government Licence, subject to the stated conditions and exclusions. | Use the downloadable dataset for UK-market screening with required attribution, but obtain identifier-specific manufacturer confirmation because the public customer service is not universal Zambia clearance. |
| European Union Safety Gate | Safety Gate is the EU rapid-alert service for dangerous non-food products and publishes product, risk, identifier, market, and measure details through the [official service](https://ec.europa.eu/safety-gate/). | The service has a specific [Safety Gate disclaimer](https://webgate.ec.europa.eu/safety/consumers/consumers_safety_gate/menu/documents/New_disclaimer_EN.pdf), so Marliket must complete legal review of the disclaimer, Commission reuse rules, attribution, and third-party fields before automated ingestion or republication. | Use alerts as EU-market product and campaign screening and as a trigger for human review, but never as a universal VIN, serial, or Zambia-market negative registry. |
| Japan MLIT | MLIT publishes Japan-market vehicle recall notices and a search covering automobiles, child seats, and tyres on its [recall portal](https://www.mlit.go.jp/en/jidosha/vehicle_recall.html). | MLIT's [standard terms](https://www.mlit.go.jp/page/kanbo01_hy_003776.html) permit content reuse under Public Data Licence 1.0 with source attribution, edited-content labelling, and stated exclusions. | Use MLIT data for Japan-market screening with the required attribution, and ask the manufacturer or seller for exact chassis applicability because MLIT directs users there. |

These fallbacks supplement rather than outrank a Zambia legal action or identifier-specific manufacturer result.

A contradiction between sources triggers a publication pause and human escalation rather than source averaging.

## Evidence-provider qualification

### Common provider record

Marliket must approve an evidence provider before relying on its work and must retain the provider's legal identity, physical location, named practitioner, role, qualifications, registrations, practising licences, accreditation body, accreditation number, current status, exact schedule of accreditation, insurance where relevant, sample reports, disciplinary or enforcement findings, and verified contact channel.

Provider approval must be capability-specific because competence to inspect food, perform a chemical test, service one manufacturer, or inspect general vehicle condition does not establish competence for another activity.

The Engineering Institution of Zambia Act regulates engineering professionals and organizations under the [Engineering Institution of Zambia Act No. 17 of 2010](https://www.parliament.gov.zm/node/3251), and EIZ states that practicing engineering requires current registration and a practising licence through its [registration portal](https://portal.eiz.org.zm/).

When a report includes regulated engineering practice or an engineering opinion, Marliket must verify the individual and organization against the current EIZ register and the relevant discipline rather than accepting an academic certificate alone.

For automotive craft competence, TEVETA's official institution service lists automotive mechanics and automotive electrical trade and craft qualifications on its [programme register](https://certification.teveta.org.zm/applicant/institution.php), while ZAQA explains qualification registration and validation on its [official qualifications page](https://www.zaqa.gov.zm/institutions/).

A trade qualification supports practitioner competence only within its learning and experience scope and does not create statutory roadworthiness authority, laboratory accreditation, manufacturer authorization, or independence.

### Accreditation and exact scope

SADCAS maintains public registers for [inspection bodies](https://sadcas.org/index.php/accredited-organisations/inspection-bodies) and [testing laboratories](https://www.sadcas.org/accredited-organisations/testing-laboratories), including status, expiry, and a schedule of accreditation.

ILAC lists SADCAS as an MRA signatory for testing, calibration, and inspection in its [signatory search](https://ilac.org/signatory-search/), which supports cross-border confidence only for results inside the signatory and accredited body's recognized scope.

The visible SADCAS certificate for ZCSA, [INSP-1 003](https://www.sadcas.org/sites/default/files/2024-02/IBAS_-_ZCSA_Cert_SoA_%28Issue_02%29_2023.pdf), is Type A but covers inspection of food products rather than automotive inspection.

ZCSA's food-only accreditation must not be presented as accreditation of used-vehicle, tyre, part, accessory, or general automotive inspection.

The visible SADCAS certificate for ZABS product certification, [PROD-CERT 001](https://www.sadcas.org/sites/default/files/2024-10/ZABS%20-%20Cert%20%26%20SoA%20-%20Prod-Cert%20%28SoA%20Issue%2002%29%202024.pdf), covers listed flour, beverage, detergent, and cement products rather than automotive products.

The [older ZABS chemical-testing schedule](https://www.sadcas.org/sites/default/files/2025-06/Testing%20-%20ZABS%20Cert%20%20SoA%20%28Chemical%20%29%20%28SoA%20Issue%20%2003%29%202025_FINAL.pdf) expired on 2026-05-28 and is absent from the [current SADCAS organization directory](https://www.sadcas.org/accreditation-organisations-all), so a generic statement that ZABS has laboratories or certification services is only a provider lead and not evidence of current automotive scope.

The absence of a publicly verified Zambia automotive inspection-body scope is a launch gate for any Marliket claim that requires accredited automotive inspection.

ISO states that [ISO/IEC 17020:2026](https://www.iso.org/standard/17020) is the current inspection-body standard for competence, impartiality, and consistent operation and that it replaced ISO/IEC 17020:2012 on 2026-03-27.

Marliket must verify the accreditation body's published transition rules and the provider's current certificate and schedule rather than hard-coding the withdrawn 2012 edition or assuming immediate conversion.

ISO states that [ISO/IEC 17025:2017](https://www.iso.org/standard/66912.html) remains current and is the competence, impartiality, and consistent-operation standard used to accredit testing and calibration laboratories.

Laboratory or calibration evidence is acceptable only when the exact material, measurement, method, range, site, and named signatory fall inside the current schedule.

An ISO certificate for a management system, an expired certificate, a certificate without its schedule, or accreditation for a different method is not a substitute for the required inspection or test scope.

ISO states that its publications are copyright protected and require permission for reproduction on its [copyright page](https://www.iso.org/copyright.html), so Marliket may record the standard identifier and compliance evidence but must not copy normative ISO text into product rules without a suitable licence.

### Provider-class rules

| Provider class | Qualification floor | Evidence it may support | Evidence it may not support alone |
| --- | --- | --- | --- |
| RTSA or legally appointed vehicle examiner | The provider must have current statutory authority for the exact examination and a verifiable RTSA result. | The provider may support the statutory physical-examination, test-certificate, certificate-of-fitness, or roadworthiness outcome stated in the result. | The provider may not support no-recall, authenticity, exact part fitment, comprehensive pre-purchase condition, or future reliability. |
| ZCSA or appointed pre-shipment agent | The provider and appointment must be verified with ZCSA for the origin country, scheme, vehicle, and date. | The provider may support compliance with the applicable ZCSA used-vehicle pre-shipment scheme. | The provider may not support manufacturer recall completion or every post-shipment condition fact. |
| General vehicle inspector | The named practitioner must have verified automotive competence, current legally required registrations, adequate insurance, a defined method, calibrated equipment, and no disqualifying conflict. | The provider may support directly observed condition facts within the report method and limitations. | The provider may not support recall absence, legal registration status, untested hidden condition, authenticity, or exact safety-critical fitment without the separate authoritative evidence. |
| Tyre specialist | The named practitioner must have verified tyre competence, the tools needed for the measurements, and current calibration evidence for safety-critical measurements. | The provider may support observed size, markings, date code, tread, visible damage, pressure, and measured condition for the exact tyres inspected. | The provider may not support recall absence, manufacturer authenticity, internal integrity not tested, or compatibility without manufacturer specifications and exact vehicle data. |
| Repairer | The repairer must have verified trade competence and any required EIZ registration, and manufacturer authorization is required for an `Authorized repair` claim. | The repairer may document work performed, parts used, measurements, and post-work checks. | The repairer may not independently certify its own repair, decide recall applicability, or authenticate a part solely because it installed or sold it. |
| Manufacturer or authorized distributor | Authorization must be confirmed through the manufacturer's or territory distributor's official channel for the brand, market, service, and date. | The provider may support VIN or chassis campaign status, remedy completion, brand authenticity, part-number supersession, exact fitment, and manufacturer specifications within its confirmed scope. | The provider may not be labelled independent condition evidence when it sold, services, warrants, or has another material interest in the subject. |
| Inspection body | The body must have current ISO/IEC 17020 accreditation or valid transition status from SADCAS or another ILAC-recognized body for the exact automotive scope, method, site, and independence class. | The body may support the inspection conclusions expressly inside that scope. | The body may not support an activity outside its schedule, and food-only ZCSA accreditation cannot support automotive conclusions. |
| Testing laboratory | The laboratory must have current ISO/IEC 17025 accreditation from SADCAS or another ILAC-recognized body for the exact method, material, range, site, and signatory. | The laboratory may support the reported result for the identified sample and method. | The laboratory may not generalize one sample to another serial, lot, batch, product, or vehicle without a valid sampling basis. |
| Calibration provider | The provider must have current ISO/IEC 17025 calibration scope for the equipment and measurement range. | The provider may support traceable calibration status for the identified instrument and range. | The provider may not prove that the inspector used the instrument correctly or that a result outside the calibrated range is valid. |

## Independence and conflict rules

Marliket may call evidence `Independent` only when the provider is organizationally separate from the seller, owner, manufacturer, distributor, repairer, and prospective buyer and the engagement creates no outcome-dependent financial interest.

Current ISO/IEC 17020:2026 reduces the prior three independence categories to Type A and Type non-A according to the [ISO change summary](https://www.iso.org/standard/17020), so Marliket must use the provider's current accreditation language and transition status rather than an obsolete label mapping.

An accredited Type A conclusion within exact scope is the preferred basis for an `Independent inspection` claim.

A seller-paid fixed inspection may be admitted as disclosed third-party evidence only if the provider otherwise satisfies independence and conflict checks, while a contingent fee, repair referral, sales commission, warranty exposure, ownership link, recent repair, or repeated undisclosed commercial dependence disqualifies the `Independent` label.

Every engagement must record who selected and paid the provider, the fee basis, ownership and employment relationships, repair or sales relationships during the preceding 24 months, referral benefits, prior work on the subject, and any limitation on access or testing.

A manufacturer or authorized distributor can be authoritative and conflicted at the same time, so its evidence may decide recall, fitment, or authenticity while remaining unsuitable as independent general-condition evidence.

A repairer's completion record is first-party evidence of work performed and requires a separate qualified provider when the publication claim is that a safety-critical repair was independently verified.

## Report, method, and calibration rules

Every accepted report must identify the Listing, exact VIN or chassis or product identifiers, inspected or sampled item, location, custody, date and time, odometer where relevant, provider and practitioner, method and standard, equipment IDs, calibration status, observations, measurements, photographs or source records, limitations, exceptions, conclusion, and signature.

The report must separate facts directly observed, measurements, records supplied by others, professional opinions, and matters not inspected.

The inspection scope must list inaccessible areas, dismantling limits, diagnostic coverage, road-test conditions, environmental conditions, sampling basis, and any seller restriction.

Safety-critical measuring equipment must be uniquely identified, inside its calibration interval and range, checked before use where the method requires it, and traceable to an in-scope calibration certificate.

An expired calibration, broken seal, out-of-range measurement, missing equipment ID, unexplained correction, or method deviation invalidates the affected conclusion.

Photographs must preserve capture time and subject association where practical, but photographs alone do not prove recall status, hidden condition, calibration, or authenticity.

Marliket must retain the original private evidence, a cryptographic digest, ingestion time, reviewer decision, source and provider versions, and every superseding result rather than overwriting history.

## Freshness rules

Recall and withdrawal status is dynamic, so Marliket must query the available Zambia and manufacturer sources at review and no more than 24 hours before initial publication or re-publication.

Published restricted Listings must be re-screened at least every seven calendar days and immediately after a manufacturer, distributor, regulator, provider, or customer alert that could affect the subject.

If the authoritative recall route cannot be checked at a required time, the Listing must not publish or must pause until the check succeeds.

A provider's identity, legal authority, practising licence, accreditation status, exact scope, and calibration evidence must be current on the work date and revalidated before Marliket relies on the result.

A vehicle condition report expires after 30 calendar days or 500 additional kilometres, whichever occurs first, and expires immediately after a collision, warning indication, material repair, modification, loss of custody, flood or fire exposure, tyre change affecting a claim, or another reported condition change.

A tyre condition report expires after 30 calendar days and immediately after fitment, removal, puncture, repair, impact, abnormal pressure event, storage-condition concern, or change of vehicle.

A laboratory result remains tied to its exact sample, lot or batch, method, and storage or chain-of-custody conditions rather than becoming a perpetual product claim.

Manufacturer fitment, supersession, authenticity, and campaign evidence expires when the manufacturer revises the record, the product or vehicle identifier changes, or a new campaign or technical notice creates a conflict.

The 24-hour, seven-day, 30-day, and 500-kilometre limits are Marliket risk controls for the first slice rather than legal validity periods, and operations may shorten them for higher-risk subjects.

## Failure, contradiction, and fallback rules

Marliket must fail closed for recall, withdrawal, compulsory conformity, authenticity, exact fitment, and every other safety-critical publication gate.

Source timeout, access denial, unsupported identifier, ambiguous market, unreadable serial, missing schedule, stale credential, or unknown rights does not become a negative result.

The fallback order for a vehicle recall is the manufacturer identifier service, a dated manufacturer or territory-authorized-distributor confirmation, the applicable Zambia regulator action, and market-matched foreign regulator screening, with all available positive actions remaining blocking.

The fallback order for a part or accessory is a manufacturer or authorized-distributor serial or batch confirmation, an applicable Zambia regulator or CCPC action, and a product- and market-matched foreign regulator notice.

Foreign negative results never replace missing manufacturer confirmation for an identifier-specific clearance.

When two sources conflict, Marliket must pause publication, retain both results, obtain clarification from the manufacturer and applicable Zambia authority, and require a human reviewer to record the resolution.

When a recall or withdrawal appears after publication, Marliket must immediately pause the Listing, suppress the affected item from discovery, preserve the triggering evidence, notify the Business and operations, and require remedy or non-applicability evidence before re-publication.

When a provider is suspended, withdrawn, expired, found conflicted, or shown to have unreliable methods, Marliket must stop accepting new work, identify every still-live Listing that relied on the provider, reassess those claims, and commission replacement evidence where needed.

An inspection can establish condition only within its method, while recall status, legal conformity, fitment, and authenticity retain their separate gates in every fallback path.

## Reuse and provenance policy

Public access is permission to read and link, not automatic permission to scrape, republish, alter, or commercialize a dataset.

Marliket must record, per source, the owner, official URL, governing terms, licence version, attribution, permitted fields and uses, market, identifier coverage, access method, rate limits, update time, retrieval time, and legal-review decision.

The source record must distinguish storing a private verification result for review from republishing source content or building a customer-facing derivative database.

Zambia source automation remains permission or legal-review gated where the reviewed authority supplies no explicit open-data licence.

ZABS standards and ISO standards must be purchased or licensed for the intended internal users and must not be copied into Marliket's database or public content beyond permitted references.

NHTSA campaign datasets may support United States-market screening, but Marliket must not use its public API for bulk VIN lookup contrary to the [API policy](https://api.nhtsa.gov/).

DVSA content may be reused under the stated Open Government Licence conditions on its [terms page](https://www.check-vehicle-recalls.service.gov.uk/terms-and-conditions).

MLIT content may be reused under its Public Data Licence 1.0 conditions, including source attribution and edited-content labelling, on its [standard-terms page](https://www.mlit.go.jp/page/kanbo01_hy_003776.html).

Safety Gate automation and republication remain legal-review gated until Marliket records the effect of the [service disclaimer](https://webgate.ec.europa.eu/safety/consumers/consumers_safety_gate/menu/documents/New_disclaimer_EN.pdf), general Commission reuse terms, and any third-party rights on the intended fields.

Manufacturer and authorized-distributor sites are proprietary sources, so Marliket must obey their terms, avoid copying catalogues or marks, and seek an integration agreement where ongoing commercial verification is required.

## Launch gates

- Zambia counsel must confirm the consolidated Road Traffic, Compulsory Standards, Standards, Competition and Consumer Protection, import, and applicable technical-regulation requirements for the first-slice categories.
- ZCSA must confirm the current compulsory-standard schedule, product approval evidence, used-vehicle agent register, certificate-verification method, non-conforming-product process, and permitted automated or commercial use.
- RTSA must confirm a reliable verification route for registration, roadworthiness, examination, de-registration, and certificate status, plus the permitted data fields and reuse conditions.
- CCPC must confirm the current public-warning and recall route, whether a structured feed exists, the effect of the 2023 and 2026 amendments, and permitted systematic reuse.
- Marliket must contract or document manufacturer and territory-authorized-distributor recall routes that cover the launch vehicle population, including grey imports and non-17-character chassis numbers.
- Marliket must identify which launch parts and accessories have serial, batch, date-code, or other actionable identifiers and disable safety-critical publication where exact applicability cannot be resolved.
- Marliket must obtain written reuse approval or a completed legal basis for every Zambia source that will be ingested, monitored, or republished.
- Marliket must complete the Safety Gate reuse review and obey NHTSA, DVSA, MLIT, manufacturer, and distributor access conditions before automation.
- Marliket must identify an adequate pool of qualified automotive inspectors, tyre specialists, repairers, inspection bodies, testing laboratories, and calibration providers for each required scope and launch location.
- Marliket must not treat ZCSA's SADCAS food-inspection accreditation as automotive accreditation, and any required accredited automotive inspection remains disabled until an exact current scope is verified.
- Marliket must not treat ZABS's public service descriptions or non-automotive product-certification scope as automotive accreditation, and ZABS testing remains only a provider lead until the exact current automotive method and product scope is verified.
- Marliket must record the SADCAS and provider transition rules for ISO/IEC 17020:2026 and must continue checking current schedules rather than accepting a standard number alone.
- Marliket must license any ZABS and ISO standards needed internally and encode original Marliket rules rather than reproducing protected normative text.
- Operations must have tested pause, evidence-preservation, notification, remedy-confirmation, provider-suspension, and re-publication procedures before any restricted Listing publishes.

If any launch gate remains unresolved for a category or claim, Marliket must disable that category or claim rather than weaken the evidence rule.

## Result

The authoritative launch model is a Zambia-first legal and conformity layer, an identifier-specific manufacturer or authorized-distributor layer, a market-matched foreign screening layer, and a separately qualified condition-evidence layer.

RTSA, ZCSA, ZABS, CCPC, manufacturers, distributors, SADCAS, laboratories, and foreign recall authorities each answer different questions and cannot substitute for one another.

The key unresolved operational gaps are complete identifier-specific recall coverage for Zambia and grey imports, explicit reuse rights and supported interfaces for Zambia sources, exact serial and batch coverage for launch products, and a verified provider pool with automotive scopes and current calibration.

Those gaps are launch gates, while `Unknown` remains unavailable for recalls, exact safety-critical fitment, authenticity where claimed, compulsory conformity, and any other fact whose absence could make publication unsafe or unlawful.
