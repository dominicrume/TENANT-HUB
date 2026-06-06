"use client";

import { useState, useEffect } from "react";
import { formatShortDate } from "../../../lib/format";

export default function ContractorJobsPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulated fetch for contractor jobs
    setTimeout(() => {
      setJobs([
        { id: "1", title: "Fix Boiler", status: "open", urgency: "high", location: "Room 12", created_at: new Date().toISOString() },
        { id: "2", title: "Replace Window", status: "in_progress", urgency: "medium", location: "Room 5", created_at: new Date().toISOString() },
      ]);
      setLoading(false);
    }, 1000);
  }, []);

  if (loading) return <div className="p-8 text-slate-400">Loading your jobs...</div>;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-white">My Active Jobs</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {jobs.map((job) => (
          <div key={job.id} className="p-6 bg-slate-900 border border-slate-800 rounded-xl space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-medium text-white">{job.title}</h3>
                <p className="text-sm text-slate-400">Reported: {formatShortDate(job.created_at)}</p>
              </div>
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                job.urgency === 'high' ? 'bg-red-500/10 text-red-400' : 'bg-yellow-500/10 text-yellow-400'
              }`}>
                {job.urgency.toUpperCase()}
              </span>
            </div>
            
            <div className="p-3 bg-slate-800/50 rounded-lg">
              <p className="text-sm text-slate-300"><span className="text-slate-500 mr-2">Location:</span> {job.location}</p>
            </div>

            <div className="pt-4 flex justify-end">
              <button className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors">
                Mark as Complete
              </button>
            </div>
          </div>
        ))}
        
        {jobs.length === 0 && (
          <div className="col-span-full p-12 text-center text-slate-500 border border-dashed border-slate-800 rounded-xl">
            You have no active jobs assigned.
          </div>
        )}
      </div>
    </div>
  );
}
