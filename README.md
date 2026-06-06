# Tenant Hub

An enterprise-grade, multi-tenant digital intake and support management portal designed for housing associations. 
Tenant Hub streamlines the process of onboarding new tenants by extracting data from paper forms using AI, presenting it for staff review, and executing a cryptographically-verifiable sign-off by the tenant.

## Key Features
- **AI-Powered Intake**: Extracts tenant details directly from uploaded images of paper forms.
- **Blockchain Audit Trail**: Every database write (creation, updates, deletions) is cryptographically hashed and chained to a genesis block. This ensures that records are immutable and provides unquestionable provenance.
- **Dynamic Support Plan (Goals)**: Follows the Reliance format, allowing staff to track goals across 5 core areas (Achieve Economic Wellbeing, Being Healthy, Enjoy and Achieve, Make a Positive Contribution, Staying Safe). Includes 3-month review alerts and interaction logs.
- **Unified Master Record**: All forms are combined into a single unified record. Updating a tenant's details once reflects everywhere.
- **True Multi-Tenancy**: Built for SaaS with distinct data isolation per organisation (`org_id`).

## Architecture
- **Frontend**: Next.js 14 (App Router), React, Radix UI.
- **Backend**: Next.js API Routes, Supabase (PostgreSQL), Redis (Upstash) for Rate Limiting.
- **Worker**: Standalone background Node.js process using BullMQ to handle intensive cryptographic hashing and blockchain anchoring.

## Getting Started

1. **Install dependencies**: `pnpm install`
2. **Start the database locally**: `npx supabase start`
3. **Run the development server**: `pnpm dev`
4. **Run the worker**: `cd apps/worker && pnpm dev`

## Deployment
This project is configured for deployment on **Vercel** with the database hosted on **Supabase Cloud**. 
- Push to the `main` branch to trigger a Vercel production build.
- Database migrations are applied using `npx supabase db push`.
