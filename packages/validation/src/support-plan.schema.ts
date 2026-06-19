import { z } from "zod";

export const SUPPORT_PLAN_PRESETS = [
  {
    category: "Achieve Economic Wellbeing",
    objectives: [
      {
        id: "aew-benefits",
        title: "Accessing Benefits",
        steps: [
          "Assess what benefits are in place and discuss any additional benefits that can be applied for. This includes Housing Benefit.",
          "Complete necessary paperwork for any benefit application and submit",
          "Follow up any claims and ensure any issues are addressed",
          "Any claims are now active",
          "Quarterly reviews of benefit claims or sooner if there are any issues with claims or circumstances change"
        ]
      },
      {
        id: "aew-budgeting",
        title: "Budgeting",
        steps: [
          "Complete an income and expenditure form",
          "Review what is essential and what is non essential",
          "Agree a budget plan",
          "Quarterly review of budget plan and re-assess if needed"
        ]
      },
      {
        id: "aew-debt",
        title: "Reducing Debt",
        steps: [
          "Gather all relevant debt information – who they are owed to and amounts",
          "Contact all relevant agencies to discuss repayment plans",
          "Ensure debt repayment plans are sustainable – if not refer to relevant agency",
          "Relevant payment plans now in place",
          "Quarterly review to ensure re-payments are being made"
        ]
      },
      {
        id: "aew-bank",
        title: "Setting up a bank account/savings account",
        steps: [
          "Discuss the type of account that is needed",
          "Completed forms if needed and gather any documentation needed and submit application",
          "Follow up if there are any issues/more documentation needed",
          "Ensure any benefits/wages are set up to go into a new account or agreed savings amount is set up.",
          "Quarterly review to ensure that account is active and being used"
        ]
      },
      {
        id: "aew-shop",
        title: "To learn how to shop wisely",
        steps: [
          "Discussion around shopping and spending habits",
          "Explore better shopping/buying habits",
          "Implementation on spending plan",
          "Quarterly reviews"
        ]
      },
      {
        id: "aew-recoup",
        title: "To recoup monies owed",
        steps: [
          "Assessment of exact amounts owed",
          "Contacting of debtors",
          "Broker payment plans/make offers of repayment",
          "Repayments are being made",
          "Quarterly reviews"
        ]
      }
    ]
  },
  {
    category: "Be Healthy",
    objectives: [
      {
        id: "bh-mental",
        title: "To better manage/improve mental health",
        steps: [
          "GP assessment of current mental health condition",
          "Access appropriate mental health services and medication if appropriate",
          "Set targets for mental health improvement with relevant plan produced",
          "Engaging with plan and appropriate services",
          "Quarterly review"
        ]
      },
      {
        id: "bh-physical",
        title: "To better manage/improve physical health",
        steps: [
          "GP assessment of current physical health condition",
          "Set targets for physical health improvements",
          "Agreement on a relevant health improvement plan and potential services to access",
          "Follow plan for improved health targets",
          "Quarterly review"
        ]
      },
      {
        id: "bh-diet",
        title: "To follow a healthy diet",
        steps: [
          "Discussion and assessment of current eating habits",
          "Research into providers/services available",
          "Discussion and agreement on an improvement strategy/plan",
          "Quarterly reviews"
        ]
      },
      {
        id: "bh-hygiene",
        title: "To maintain good personal hygiene",
        steps: [
          "Discussion and assessment of current personal hygiene habits",
          "Discussion and agreement on an improvement strategy/plan",
          "Improvement in personal hygiene",
          "Quarterly review"
        ]
      },
      {
        id: "bh-substance",
        title: "To reduce substance misuse",
        steps: [
          "Assessment of current substance misuse (amount and regularity etc)",
          "Discussion and agreement on reduction strategy",
          "Set up specialist agency support package, if required",
          "Engaging with appropriate plan/services",
          "Quarterly reviews"
        ]
      },
      {
        id: "bh-dentist",
        title: "To register with a Dentist",
        steps: [
          "If already registered, locate dentist and seek to transfer to local dentist / If not, register at nearest appropriate dentist",
          "Discuss any health needs that would require a dentist visit",
          "Initiate visit if needed",
          "Quarterly reviews to ensure dentist is being accessed when required"
        ]
      },
      {
        id: "bh-gp",
        title: "To register with a GP",
        steps: [
          "If already registered, locate GP and seek to transfer to local surgery / If not, register at nearest appropriate GP",
          "Discuss any health needs that would require a GP visit",
          "Initiate health visit if needed",
          "Quarterly reviews to ensure GP is being accessed when required"
        ]
      }
    ]
  },
  {
    category: "Enjoy and Achieve",
    objectives: [
      {
        id: "eaa-training",
        title: "Accessing Training/Education",
        steps: [
          "Discuss training/education desires",
          "Discuss and research appropriate providers and courses",
          "Complete applications",
          "Quarterly reviews to discuss applications"
        ]
      },
      {
        id: "eaa-employment",
        title: "Accessing Employment",
        steps: [
          "Gather work history and build CV",
          "Discuss appropriate job opportunities",
          "Complete applications",
          "Quarterly reviews to discuss applications"
        ]
      },
      {
        id: "eaa-leisure",
        title: "Accessing Leisure, Faith or Cultural Activities",
        steps: [
          "Discuss activities of interest",
          "Discuss and research appropriate providers and signpost",
          "Access services",
          "Quarterly reviews to discuss activities"
        ]
      },
      {
        id: "eaa-volunteering",
        title: "Accessing volunteering",
        steps: [
          "Discuss volunteering desires",
          "Discuss and research appropriate providers",
          "Complete applications",
          "Successful in finding a placement",
          "Quarterly reviews to discuss progress"
        ]
      },
      {
        id: "eaa-moveon",
        title: "Move on",
        steps: [
          "Discuss requirements and appropriate providers",
          "Discuss independent living skills and readiness for move on",
          "Address any independent living skills that require additional support",
          "Complete applications to appropriate providers",
          "Regularly discuss application progress/bidding etc",
          "Move on finalized"
        ]
      },
      {
        id: "eaa-equality",
        title: "Support with equality and diversity",
        steps: [
          "Discussion on relevant equality and diversity support needs",
          "Internal or external arrangement of support delivery",
          "Delivery and on-going review of support received/delivered"
        ]
      }
    ]
  },
  {
    category: "Making a positive contribution",
    objectives: [
      {
        id: "mpc-networks",
        title: "Establishing positive support networks",
        steps: [
          "Discussion and agreement on developing positive support networks",
          "Agreement to a strategy of finding new/other interests",
          "Building positive support networks",
          "Quarterly reviews"
        ]
      },
      {
        id: "mpc-antisocial",
        title: "To address anti-social behaviour",
        steps: [
          "Discussion on tenancy and legal obligations",
          "Agreement on a behaviour improvement plan/strategy",
          "Reduction in anti-social behaviour",
          "Quarterly reviews"
        ]
      },
      {
        id: "mpc-offending",
        title: "To address offending behaviour",
        steps: [
          "Discussion on the expectations and implications of the statutory orders",
          "Discussion on the causes for the offending behaviour",
          "Agreement on committing to the support plan offered by probation",
          "Agreement and commitment to a reducing offending behaviour plan by accessing alternative activities",
          "Reduction in offending behaviour",
          "Quarterly reviews"
        ]
      }
    ]
  },
  {
    category: "Stay Safe",
    objectives: [
      {
        id: "ss-living",
        title: "To develop independent living skills",
        steps: [
          "Assessment of current living skills/abilities",
          "Agreement of areas of development and commitment to improvement plan",
          "Quarterly reviews"
        ]
      },
      {
        id: "ss-accommodation",
        title: "To maintain accommodation",
        steps: [
          "Discuss in regards to accommodation needs/issues",
          "Discussion in regards to tenancy obligations and agreement to comply with",
          "Agree a plan for maintaining accommodation",
          "Regular checks of accommodation to ensure plan is being followed",
          "Quarterly reviews"
        ]
      },
      {
        id: "ss-risk",
        title: "To minimize risk of harm",
        steps: [
          "Discussion and assessment on vulnerability and/or anger management",
          "Agreement and commitment to a harm minimisation plan/strategy",
          "Undertaking of helpful support and/or programmes to raise awareness",
          "Quarterly reviews"
        ]
      }
    ]
  }
];

export const SupportPlanStepSchema = z.object({
  description: z.string(),
  completed: z.boolean().default(false),
  completed_date: z.string().optional(),
  signed_by: z.string().optional(), // Support worker or client name
});

export const SupportPlanObjectiveSchema = z.object({
  id: z.string(),
  title: z.string(),
  active: z.boolean().default(false), // Users can toggle objectives on/off
  steps: z.array(SupportPlanStepSchema),
  comments: z.string().optional(),
});

export const SupportPlanCategorySchema = z.object({
  category: z.string(),
  objectives: z.array(SupportPlanObjectiveSchema),
});

export const SupportPlanSchema = z.object({
  id: z.string().uuid().optional(),
  tenant_id: z.string().uuid(),
  
  initial_date: z.string(),
  review_date: z.string(),
  support_workers: z.array(z.string()).default([]),
  
  categories: z.array(SupportPlanCategorySchema),
  
  additional_needs: z.string().optional(),
  
  overall_client_signature: z.string().optional(),
  overall_client_signature_date: z.string().optional(),
  
  overall_worker_signature: z.string().optional(),
  overall_worker_signature_date: z.string().optional(),
  
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type SupportPlan = z.infer<typeof SupportPlanSchema>;
export type SupportPlanCategory = z.infer<typeof SupportPlanCategorySchema>;
export type SupportPlanObjective = z.infer<typeof SupportPlanObjectiveSchema>;
export type SupportPlanStep = z.infer<typeof SupportPlanStepSchema>;
