import { Sampler, SamplingResult } from '@opentelemetry/api';
/** Sampler that samples all traces. */
export declare class AlwaysOnSampler implements Sampler {
    shouldSample(): SamplingResult;
    toString(): string;
}
//# sourceMappingURL=AlwaysOnSampler.d.ts.map