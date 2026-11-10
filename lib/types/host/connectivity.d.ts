/** Resolves `true` when the host looks online. Must never reject. */
export type ConnectivityProbe = () => Promise<boolean>;
/** Host-side connectivity check: a non-loopback interface plus one resolvable public name. */
export declare const probeConnectivity: ConnectivityProbe;
