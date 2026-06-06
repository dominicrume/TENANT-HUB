import React from "react";

export default function TermsOfService() {
  return (
    <div className="max-w-3xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-navy-900 mb-6">Terms of Service</h1>
      <div className="prose prose-navy">
        <p>Effective Date: {new Date().toLocaleDateString()}</p>
        <h2>1. Acceptance of Terms</h2>
        <p>By accessing Tenant Hub, you agree to these Terms of Service.</p>
        <h2>2. Use of Service</h2>
        <p>You agree to use this service only for lawful purposes related to tenancy management.</p>
        <h2>3. Account Security</h2>
        <p>You are responsible for maintaining the confidentiality of your account credentials.</p>
        <h2>4. Termination</h2>
        <p>We reserve the right to suspend or terminate access for violations of these terms.</p>
      </div>
    </div>
  );
}
