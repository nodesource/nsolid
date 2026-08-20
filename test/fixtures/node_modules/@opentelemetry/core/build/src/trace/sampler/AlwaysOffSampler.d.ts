import { Sampler, SamplingResult } from '@opentelemetry/api';
/** Sampler that samples no traces. */
export declare class AlwaysOffSampler implements Sampler {
    shouldSample(): SamplingResult;
    toString(): string;
}
//# sourceMappingURL=AlwaysOffSampler.d.ts.map