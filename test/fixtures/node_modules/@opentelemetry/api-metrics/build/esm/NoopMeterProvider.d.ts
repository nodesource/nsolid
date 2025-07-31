import { Meter, MeterOptions } from './types/Meter';
import { MeterProvider } from './types/MeterProvider';
/**
 * An implementation of the {@link MeterProvider} which returns an impotent Meter
 * for all calls to `getMeter`
 */
export declare class NoopMeterProvider implements MeterProvider {
    getMeter(_name: string, _version?: string, _options?: MeterOptions): Meter;
}
export declare const NOOP_METER_PROVIDER: NoopMeterProvider;
//# sourceMappingURL=NoopMeterProvider.d.ts.map