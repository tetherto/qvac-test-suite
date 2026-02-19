interface TrackedModel {
	modelId: string;
	lastUsedAtTest: number;
}

export class SDKProxy {
	private tracker = new Map<string, TrackedModel>();
	private currentTestCount = 0;
	private sdk: any;
	private cancelFn: any;
	private log: (msg: string) => void;
	private _proxy: any = null;

	constructor(sdk: any, cancelFn: any, log: (msg: string) => void) {
		this.sdk = sdk;
		this.cancelFn = cancelFn;
		this.log = log;
	}

	setTestCount(n: number) {
		this.currentTestCount = n;
	}

	createProxy(): any {
		if (this._proxy) return this._proxy;

		const self = this;
		this._proxy = new Proxy(this.sdk, {
			get(target: any, prop: string | symbol) {
				const value = target[prop];
				if (typeof value !== "function") return value;

				const name = String(prop);

				if (name === "loadModel") {
					return async (...args: any[]) => {
						const modelId = await value.apply(target, args);
						self.tracker.set(modelId, {
							modelId,
							lastUsedAtTest: self.currentTestCount,
						});
						self.log(`   [proxy] Tracked model load: ${modelId} (${self.tracker.size} loaded)`);
						return modelId;
					};
				}

				if (name === "unloadModel") {
					return async (...args: any[]) => {
						const opts = args[0];
						if (opts?.modelId) {
							self.tracker.delete(opts.modelId);
						}
						self.log(`   [proxy] Model ${opts?.modelId} unloaded`);
						return value.apply(target, args);
					};
				}

				return (...args: any[]) => {
					const firstArg = args[0];
					if (firstArg && typeof firstArg === "object" && typeof firstArg.modelId === "string") {
						const entry = self.tracker.get(firstArg.modelId);
						if (entry) {
							entry.lastUsedAtTest = self.currentTestCount;
						}
						self.log(`   [proxy] Model ${firstArg.modelId} used`);
					}
					return value.apply(target, args);
				};
			},
		});

		return this._proxy;
	}

	private async evict(modelId: string) {
		try {
			await this.cancelFn({ operation: "inference", modelId });
		} catch (err: any) {
			this.log(`   [proxy] Cancel error for ${modelId}: ${err.message}`);
		}
		try {
			await this.sdk.unloadModel({ modelId });
			await new Promise(resolve => setTimeout(resolve, 100));
		} catch (err: any) {
			this.log(`   [proxy] Unload error for ${modelId}: ${err.message}`);
		}
		this.log(`   [proxy] Model ${modelId} evicted`);
		this.tracker.delete(modelId);
	}

	async evictStaleModels(threshold: number): Promise<string[]> {
		const evicted: string[] = [];
		for (const [modelId, entry] of this.tracker) {
			if (this.currentTestCount - entry.lastUsedAtTest >= threshold) {
				evicted.push(modelId);
			}
		}
		for (const modelId of evicted) {
			this.log(`   [proxy] Evicting stale model: ${modelId}`);
			await this.evict(modelId);
		}
		return evicted;
	}

	async evictAll(): Promise<string[]> {
		const all = Array.from(this.tracker.keys());
		for (const modelId of all) {
			await this.evict(modelId);
		}
		return all;
	}

	getLoadedCount(): number {
		return this.tracker.size;
	}

	getLoadedModelIds(): string[] {
		return Array.from(this.tracker.keys());
	}
}
