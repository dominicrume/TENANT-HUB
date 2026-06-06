import React from "react";

export default function PrivacyPolicy() {
  return (
    <div className="max-w-3xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-navy-900 mb-6">Privacy Policy</h1>
      <div className="prose prose-navy">
        <p>Effective Date: {new Date().toLocaleDateString()}</p>
        <h2>1. Data Collection</h2>
        <p>We collect information necessary for tenancy management, including identity documents, financial status, and support needs.</p>
        <h2>2. Data Processing</h2>
        <p>Your data is processed to manage your tenancy and provide necessary support services. We do not sell your data.</p>
        <h2>3. Data Retention</h2>
        <p>We retain your data only as long as necessary for legal and operational purposes.</p>
        <h2>4. Your Rights (GDPR)</h2>
        <p>You have the right to access, rectify, or request erasure of your data. Contact us to exercise these rights.</p>
      </div>
    </div>
  );
}
