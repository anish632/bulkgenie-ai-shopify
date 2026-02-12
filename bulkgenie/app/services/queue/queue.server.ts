import { Queue } from "bullmq";
import { getRedisConnection } from "./connection.server";

let jobQueue: Queue | null = null;

export function getJobQueue(): Queue {
  if (!jobQueue) {
    jobQueue = new Queue("content-generation", {
      connection: getRedisConnection(),
    });
  }
  return jobQueue;
}
