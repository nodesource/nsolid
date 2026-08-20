/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { NOOP_METER_PROVIDER } from '../NoopMeterProvider';
import { API_BACKWARDS_COMPATIBILITY_VERSION, GLOBAL_METRICS_API_KEY, makeGetter, _global, } from './global-utils';
/**
 * Singleton object which represents the entry point to the OpenTelemetry Metrics API
 */
export class MetricsAPI {
    /** Empty private constructor prevents end users from constructing a new instance of the API */
    constructor() { }
    /** Get the singleton instance of the Metrics API */
    static getInstance() {
        if (!this._instance) {
            this._instance = new MetricsAPI();
        }
        return this._instance;
    }
    /**
     * Set the current global meter. Returns the initialized global meter provider.
     */
    setGlobalMeterProvider(provider) {
        if (_global[GLOBAL_METRICS_API_KEY]) {
            // global meter provider has already been set
            return this.getMeterProvider();
        }
        _global[GLOBAL_METRICS_API_KEY] = makeGetter(API_BACKWARDS_COMPATIBILITY_VERSION, provider, NOOP_METER_PROVIDER);
        return provider;
    }
    /**
     * Returns the global meter provider.
     */
    getMeterProvider() {
        var _a, _b;
        return ((_b = (_a = _global[GLOBAL_METRICS_API_KEY]) === null || _a === void 0 ? void 0 : _a.call(_global, API_BACKWARDS_COMPATIBILITY_VERSION)) !== null && _b !== void 0 ? _b : NOOP_METER_PROVIDER);
    }
    /**
     * Returns a meter from the global meter provider.
     */
    getMeter(name, version, options) {
        return this.getMeterProvider().getMeter(name, version, options);
    }
    /** Remove the global meter provider */
    disable() {
        delete _global[GLOBAL_METRICS_API_KEY];
    }
}
//# sourceMappingURL=metrics.js.map