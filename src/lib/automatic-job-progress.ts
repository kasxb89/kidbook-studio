type AutomaticJobProgress = {
  automatic?: boolean;
  status: string;
  leaseUntil: string | null;
};

export function needsAutomaticJobRefresh(job: AutomaticJobProgress, now = Date.now()) {
  if (!job.automatic || ["complete", "failed"].includes(job.status)) return false;
  // A resumed request retains its old paused/retryable status until it commits.
  // Reloading that request must keep polling while its server lease is active.
  return ["preparing", "outline", "images"].includes(job.status) ||
    (!!job.leaseUntil && Date.parse(job.leaseUntil) > now);
}
