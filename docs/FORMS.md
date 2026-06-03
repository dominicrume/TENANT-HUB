# Forms Catalogue — Tenant Hub

Source: `docs/forms details/forms .docx` — a manifest of **53 detailed form documents** (Google
Docs links) plus the instruction: *"allow the number population to accept all countries"* (now
implemented — see Phone, below). The detailed per-field specs live in the linked Google Docs; this
file organises them, maps what the app already implements, and prevents duplication.

> The 53 source documents are external Google Docs (links preserved in the .docx). They were not
> fetched during this build (no credentials in the build environment). Treat the links as the
> field-level source of truth; this catalogue is the implementation index.

## Phone numbers — international (done)
`packages/validation/src/primitives.ts` `PhoneSchema` now accepts numbers from all countries
(`/^\+?[\d\s().-]{7,20}$/`). `UkPhoneSchema` is kept as an alias so existing imports are unchanged.
Applies to tenant `mobile`, `nok_phone`, and any new phone field. (Brief referenced sample pages
14, 22, 24.)

## Implemented in the app
| Form | Where | Backed by |
|------|-------|-----------|
| Personal Details (Form 3, all fields) | Tenant detail → Personal tab | `CanonicalTenantSchema` |
| Confidentiality Declaration | Personal tab, section 6 | static text + signature block |
| Support Sessions (daily/weekly/monthly) | Tenant detail → Sessions tab | `SessionSchema` |
| Service Charge Agreement / ledger | Tenant detail → Service Charge tab | `ServiceChargeSchema` |
| Intake Checklist (10 items) | Tenant detail → Checklist tab | `IntakeChecklistSchema` |
| Eviction / Notice Seeking Possession | FormsPanel → Eviction modal | EXPORT audit event |
| Monthly Council Support Report | /reports | `/api/reports` |

## Referenced in the checklist (not yet standalone forms)
These appear as intake-checklist items and Forms-panel cards; full standalone form pages are a
follow-up once the linked specs are reviewed (avoid duplicating fields already on Form 3):
- Housing Benefit Claim
- Missing Person Form
- Initial Assessment
- Risk Assessment & Support Plan
- GP / Universal Credit registration

## Anti-duplication principle
Every form derives from the canonical Zod schemas in `packages/validation` — no hand-typed
duplicate field sets. New forms from the 53 docs should add fields to the relevant canonical schema
(or a new schema) and render via the shared `components/form/fields` + `RecordFields`, never a
bespoke field list.

## The 53 source documents
Preserved verbatim from the brief (numbering as given; some numbers absent in the original):

1. https://docs.google.com/document/d/1mI0Z_FZr7_LB6rtWHl1bG7fJ3ITEFf7AG4tAyf5-5GA/edit
2. https://docs.google.com/document/d/1B8zBiGjz_OQlIfqmIdCuGPisXKVI9byNsVySNviO3To/edit
3. https://docs.google.com/document/d/1r9vD2Eij9l66pfl3hbDjdDshI0OtDD5hrQYg3oaPL1E/edit
5. https://docs.google.com/document/d/1wiAnN_TLwylvtAzC48TvyDxC5a56IGxEQoLkmQGLQHk/edit
6. https://docs.google.com/document/d/1glp-G-vhb2u3Uqo3lcB_eHRxFatBEvwi93ciUT-Z-_4/edit
7. https://docs.google.com/document/d/1l7b08IursrEe_1OV2B25JFm4sa6F1pJ-MfNPzOMtMvE/edit
8. https://docs.google.com/document/d/11iyRKgSeYpsQFLagBVJXIXDS6K4UVc8MIysgO0gE81E/edit
9. https://docs.google.com/document/d/1nLkD3-CLyQnBk7ZxZHvLjBz5H3ALusWcx13HJi1qoRg/edit
10. https://docs.google.com/document/d/189p49XzjIJfC-QbR1QF9hFLNjqeb3Gw1JR8vCsQ6_HI/edit
11. https://docs.google.com/document/d/18sarZgtIsauheROY0kyZSh7f-2DWujq7-TBc8jRTUoI/edit
12. https://docs.google.com/document/d/1GMfXRNXJ1HugYpBwx1E97p6lFx_Blt086LdofruV1rI/edit
13. https://docs.google.com/document/d/1grMSBFk0x0m5EDdxu0p5ZLUGYKJXmqLBuyIBcFJi-ZE/edit
15. https://docs.google.com/document/d/1bmZDndtI6ANd92TI_868FvlPCbTLQVw03wP42AO76NA/edit
16. https://docs.google.com/document/d/1TbHf8OkMgCgf0G5Lp15hEHMbvJnfd3NJOjsNgbkheT0/edit
17. https://docs.google.com/document/d/1TpGrPjzj7uqkcaetO45kg_LWHFcntbYzJslAjB_ZwRk/edit
18. https://docs.google.com/document/d/1l8dHVXkTlBm2-Cq61-tICXt5bAh7NV-BIUS39c7DnQg/edit
19. https://docs.google.com/document/d/1r9GkaqP09au8M6o8drr-5Wyj1SxWwXucp9VlgzzhG5o/edit
20. https://docs.google.com/document/d/14_O82GGHcp3YRdCDbt8uArCXWv5ZOXfgIZZfhHSKcJY/edit
21. https://docs.google.com/document/d/1GmBa0psz4AFMvRryjnA7RdknOxuiL0upAcJ80kzznps/edit
23. https://docs.google.com/document/d/1qxTHGiBRoJWvYgObsKZGnsjAfT7zYf9k0eLNFPzz954/edit
25. https://docs.google.com/document/d/1nw5o4hFIbIFUsSA5lemmvT0Ewpg1fBGhGGTS3T0-lGI/edit
26. https://docs.google.com/document/d/16Ec15rPOXyE-Ywrv893U6uM9EWDzNAhmjTIwZTsUOyg/edit
27. https://docs.google.com/document/d/1qb9QHjV2mIzqd1D5xc_yjQHu4ZcJQQpKrezpI0K1bls/edit
28. https://docs.google.com/document/d/1MWa3i75sne02qbC9CAVCFdqs4Y_tszSKX8340qvwajI/edit
29. https://docs.google.com/document/d/1Jd46E7Rr6cgl2ssDuLjyvPTsTs2GnExNiXUKqdsUd0Y/edit
30. https://docs.google.com/document/d/1MbYSVWfeWWvujZNjwTXy4CCEbkQM9XxD0YQEqypzoew/edit
31. https://docs.google.com/document/d/1fgRP2YBMjHPmCYyIVLUvveknpexgUv1m6ADxKHMeKgo/edit
32. https://docs.google.com/document/d/1xT6fDoTum4wV_iwLJsBxub4qnCzF_22nM-yLZHKuzbA/edit
33. https://docs.google.com/document/d/1la6RnQpmB3cLA47A3Sh8I13lMdm97BnBq7xYjoikT8A/edit
34. https://docs.google.com/document/d/1jhcVI936pXVHz7M9TJX6bh96vy0XYfK9xT-GyZyFIwA/edit
35. https://docs.google.com/document/d/1QldRp4LpNReQH-pltmRAUkzNeMjkiUCJzA-iodS7u5E/edit
36. https://docs.google.com/document/d/1hnWK6QkuxC_yc1NvsoNE8PAyE_swEI3o7_xT40-aQYM/edit
37. https://docs.google.com/document/d/1BZohdwWLkw5q--FF_SP1Q1GFR5HNhU3y85jf39OTjeM/edit
38. https://docs.google.com/document/d/1yqzgCfspsbBkG65luFYPK68tmONBV6sak5U-N2ZLD7w/edit
39. https://docs.google.com/document/d/1RluOtk6pMMhCNwP9zwtMxinA1AN57NSkCIBchyfpl_A/edit
40. https://docs.google.com/document/d/1GfU0AiF-vldNKhSgQrB2aJlvctOpnY3GQeZ14QM0J6Y/edit
41. https://docs.google.com/document/d/1G2HFo9dbT4OkhaJ8Uigmax6n_UtGItJ7M1NVl4tHV-8/edit
42. https://docs.google.com/document/d/1-vK7REK7IrVXivDJ_rdKTkfPF6p0NPUdfo_WIYl7NzU/edit
43. https://docs.google.com/document/d/191FIUkJaj2577eCA4w_z8cyKWxV4m_XxV4-AVDp_hyU/edit
44. https://docs.google.com/document/d/1GRg10Fi5JZfn4SREh1AKJoDPKh5mrSP4XquCTdtEpXQ/edit
45. https://docs.google.com/document/d/1yZxDkH5g9KL5QaN2mnFiVlBBqs0V4X521LgJe6Pm_b4/edit
46. https://docs.google.com/document/d/11f6C23GmBD_m3BaYQvyJHEi3SN8AYp4HJyVm32HVq7g/edit
47. https://docs.google.com/document/d/1GzbWFdWHhasiggvLBAZ5IkXUDJ0PMVtXI5W9sl4_so0/edit
48. https://docs.google.com/document/d/1HL502wLVKFjTYhfEVw8B6X0mtETRRIGa1q2udtCb7-w/edit
49. https://docs.google.com/document/d/1zHH2UPwV1IfKz7FmRJJDe9bPNNI6G0_9aSbPOYr0h3A/edit
50. https://docs.google.com/document/d/1z6I7ZzF4Or0yFEdlxz6pBcPNYjk0pIDfsZ3NqD6cwnY/edit
51. https://docs.google.com/document/d/1EXXtiQ3FNNxMeOAlmBgA4sEFVhXkMFabBXraFl89Q3E/edit
52. https://docs.google.com/document/d/1YLiM37ZAYMhdR9LyxFc_-LaTgeQucLuK97dU5G4xPew/edit
53. https://docs.google.com/document/d/1O15b3eEbbqCjhaiIuYLzbcoFXjV-I_be-zsDEg-tv5U/edit
