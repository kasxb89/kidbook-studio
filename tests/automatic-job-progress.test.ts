import { expect, it } from "vitest";
import { needsAutomaticJobRefresh } from "@/lib/automatic-job-progress";

const now = Date.parse("2026-10-21T00:00:00+08:00");
const leaseUntil = new Date(now + 60_000).toISOString();

it("keeps a retried request observable across reload until it commits or fails", () => {
  const job = {automatic:true,status:"retryable",leaseUntil};
  expect(needsAutomaticJobRefresh(job, now)).toBe(true);
  expect(needsAutomaticJobRefresh({...job,status:"images",leaseUntil:null}, now)).toBe(true);
  expect(needsAutomaticJobRefresh({...job,status:"retryable",leaseUntil:null}, now)).toBe(false);
  expect(needsAutomaticJobRefresh({...job,status:"complete",leaseUntil:null}, now)).toBe(false);
});

it("observes a resumed paused request but leaves a settled pause under user control", () => {
  expect(needsAutomaticJobRefresh({automatic:true,status:"paused",leaseUntil}, now)).toBe(true);
  expect(needsAutomaticJobRefresh({automatic:true,status:"paused",leaseUntil:null}, now)).toBe(false);
});

it("does not poll expired retry leases, terminal jobs or manual jobs indefinitely", () => {
  const job = {automatic:true,status:"retryable",leaseUntil};
  expect(needsAutomaticJobRefresh(job, now + 60_001)).toBe(false);
  expect(needsAutomaticJobRefresh({...job,status:"failed"}, now)).toBe(false);
  expect(needsAutomaticJobRefresh({...job,status:"complete"}, now)).toBe(false);
  expect(needsAutomaticJobRefresh({...job,automatic:false}, now)).toBe(false);
  expect(needsAutomaticJobRefresh({...job,status:"images"}, now + 60_001)).toBe(true);
});
