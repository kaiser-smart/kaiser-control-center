import { DurableObject } from "cloudflare:workers";
import worker, { VistosContinuationController } from "./vistos-leadhub-profile-sync-runner.js";

export class VistosLeadHubContinuation extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.controller = new VistosContinuationController(ctx.storage, env);
  }
  async ensureScheduled() { return this.controller.ensureScheduled(); }
  async alarm() { return this.controller.alarm(); }
}

export default worker;
