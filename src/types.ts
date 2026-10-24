export type LockfileKind = "npm" | "yarn" | "pnpm";

export interface LockedPackage {
  name: string;
  version: string;
  /** Tarball URL, git URL or file path the package is installed from */
  resolved?: string;
  /** Subresource-integrity string, e.g. "sha512-..." */
  integrity?: string;
  /** npm lockfiles record whether a package runs preinstall/install/postinstall */
  hasInstallScript?: boolean;
  license?: string;
  dev?: boolean;
  optional?: boolean;
  /** Deprecation notice, when the lockfile records it (pnpm) */
  deprecated?: string;
}

export interface Lockfile {
  kind: LockfileKind;
  /** Unique by name@version (a lockfile may install the same version in several places) */
  packages: Map<string, LockedPackage>;
}

export interface Upgrade {
  name: string;
  from: string[];
  to: string[];
}

export interface Tampered {
  before: LockedPackage;
  after: LockedPackage;
}

export interface LockDiff {
  /** name@version that is new and whose name wasn't in the base lockfile at all */
  added: LockedPackage[];
  /** names that disappeared entirely */
  removed: LockedPackage[];
  /** names present in both whose set of versions changed */
  upgraded: Upgrade[];
  /** every name@version that is new, including versions from upgrades; these are what gets installed fresh */
  introduced: LockedPackage[];
  /** same name@version but different source or hash */
  modified: Tampered[];
}

export type Severity = "high" | "medium" | "low" | "info";

export const SEVERITY_ORDER: Severity[] = ["high", "medium", "low", "info"];

export interface Finding {
  severity: Severity;
  rule: string;
  package: string;
  version?: string;
  message: string;
}
