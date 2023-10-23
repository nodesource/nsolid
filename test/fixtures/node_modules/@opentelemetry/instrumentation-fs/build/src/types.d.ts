/// <reference types="node" />
import type * as fs from 'fs';
import type * as api from '@opentelemetry/api';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
export declare type FunctionPropertyNames<T> = {
    [K in keyof T]: T[K] extends Function ? K : never;
}[keyof T];
export declare type FunctionProperties<T> = Pick<T, FunctionPropertyNames<T>>;
export declare type FMember = FunctionPropertyNames<typeof fs>;
export declare type FPMember = FunctionPropertyNames<typeof fs['promises']>;
export declare type CreateHook = (functionName: FMember | FPMember, info: {
    args: ArrayLike<unknown>;
}) => boolean;
export declare type EndHook = (functionName: FMember | FPMember, info: {
    args: ArrayLike<unknown>;
    span: api.Span;
    error?: Error;
}) => void;
export interface FsInstrumentationConfig extends InstrumentationConfig {
    createHook?: CreateHook;
    endHook?: EndHook;
}
//# sourceMappingURL=types.d.ts.map