import type { ComponentType } from 'react';
import {
  createDefaultRegistry,
  type ComponentRegistry,
} from '@enterpriseaigroup/core/config';

export const eaiPackageProfiles = ['external', 'internal', 'hybrid'] as const;
/** Template runtime mode used to filter package and customer blocks. */
export type EAIPackageProfile = (typeof eaiPackageProfiles)[number];

/** Catalog lane used by Gofer/CLI tools when grouping available blocks. */
export type EAIBlockPackageLane = 'foundation' | 'product' | 'addon' | 'dev';
/** Backend dependency level that determines the default supported profiles. */
export type EAIBlockBackendCoupling =
  | 'external-safe'
  | 'external-with-adapter'
  | 'platform-only';

const eaiBlockPackageLanes = ['foundation', 'product', 'addon', 'dev'] as const;
const eaiBlockBackendCouplings = [
  'external-safe',
  'external-with-adapter',
  'platform-only',
] as const;
const supportedProfilesByCoupling: Record<
  EAIBlockBackendCoupling,
  readonly EAIPackageProfile[]
> = {
  'external-safe': ['external', 'internal', 'hybrid'],
  'external-with-adapter': ['external', 'hybrid'],
  'platform-only': ['internal', 'hybrid'],
};

/** Manifest entry for one component that can be registered in the app block registry. */
export interface EAIBlockManifestEntryLike {
  id: string;
  title: string;
  packageName: string;
  importPath: string;
  exportName: string;
  packageLane: EAIBlockPackageLane;
  backendCoupling: EAIBlockBackendCoupling;
  capabilities?: string[];
  profiles?: EAIPackageProfile[];
}

/** Package manifest contributed by an EAI catalog package or customer extension. */
export interface EAIBlockManifestLike {
  schemaVersion: string;
  packageName: string;
  blocks: EAIBlockManifestEntryLike[];
}

/** JSON-safe block metadata exposed to Gofer/CLI paths without React components. */
export interface EAIBlockCatalogEntry extends EAIBlockManifestEntryLike {
  profiles: EAIPackageProfile[];
}

/** Validation output for extension manifests and their component bindings. */
export interface EAIBlockExtensionValidationResult {
  valid: boolean;
  errors: string[];
  blockIds: string[];
  catalog: EAIBlockCatalogEntry[];
}

/** Options for building the runtime component registry. */
export interface EAIBlockRegistryOptions {
  profile?: EAIPackageProfile;
  validate?: boolean;
}

/** Options for exposing block manifests to non-rendering consumers. */
export interface EAIBlockManifestOptions {
  profile?: EAIPackageProfile;
  includeResolvedProfiles?: boolean;
  validate?: boolean;
}

/** Options for exposing flattened block metadata to non-rendering consumers. */
export interface EAIBlockCatalogOptions {
  profile?: EAIPackageProfile;
  validate?: boolean;
}

/** Starter apps add package or customer blocks here without editing EAI packages. */
export interface ClientBlockExtension {
  manifest: EAIBlockManifestLike;
  components: Record<string, ComponentType<unknown>>;
}

export const eaiPackageProfile: EAIPackageProfile = 'external';

export const clientBlockExtensions: ClientBlockExtension[] = [];

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isAllowedValue<T extends string>(
  value: unknown,
  allowed: readonly T[]
): value is T {
  return typeof value === 'string' && allowed.includes(value as T);
}

function uniqueProfiles(
  profiles: readonly EAIPackageProfile[]
): EAIPackageProfile[] {
  return Array.from(new Set(profiles));
}

/** Resolves explicit profiles or derives default profiles from backend coupling. */
export function resolveBlockProfiles(
  block: EAIBlockManifestEntryLike
): EAIPackageProfile[] {
  return uniqueProfiles(
    block.profiles && block.profiles.length > 0
      ? block.profiles
      : supportedProfilesByCoupling[block.backendCoupling]
  );
}

/** Checks whether a manifest block should register for a package profile. */
export function isBlockEnabledForProfile(
  block: EAIBlockManifestEntryLike,
  profile: EAIPackageProfile
): boolean {
  return resolveBlockProfiles(block).includes(profile);
}

function toCatalogEntry(
  block: EAIBlockManifestEntryLike
): EAIBlockCatalogEntry {
  return {
    ...block,
    profiles: resolveBlockProfiles(block),
  };
}

function getProfiledBlocks(
  blocks: EAIBlockManifestEntryLike[],
  profile?: EAIPackageProfile,
  includeResolvedProfiles = false
): EAIBlockManifestEntryLike[] {
  return blocks
    .filter((block) => !profile || isBlockEnabledForProfile(block, profile))
    .map((block) =>
      includeResolvedProfiles
        ? {
            ...block,
            profiles: resolveBlockProfiles(block),
          }
        : block
    );
}

/** Reports duplicate IDs, invalid profile/coupling pairs, and missing component bindings. */
export function validateClientBlockExtensions(
  extensions: ClientBlockExtension[] = clientBlockExtensions
): EAIBlockExtensionValidationResult {
  const errors: string[] = [];
  const blockIds: string[] = [];
  const catalog: EAIBlockCatalogEntry[] = [];
  const seenBlockIds = new Map<string, string>();

  extensions.forEach((extension, extensionIndex) => {
    const manifest = extension.manifest;
    const manifestLabel = hasText(manifest?.packageName)
      ? manifest.packageName
      : `extension[${extensionIndex}]`;

    if (!manifest) {
      errors.push(`Extension ${extensionIndex} is missing a manifest.`);
      return;
    }

    if (!hasText(manifest.schemaVersion)) {
      errors.push(`${manifestLabel} is missing manifest.schemaVersion.`);
    }

    if (!hasText(manifest.packageName)) {
      errors.push(`Extension ${extensionIndex} is missing manifest.packageName.`);
    }

    if (!Array.isArray(manifest.blocks)) {
      errors.push(`${manifestLabel} manifest.blocks must be an array.`);
      return;
    }

    if (!extension.components || typeof extension.components !== 'object') {
      errors.push(`${manifestLabel} components must be an object.`);
    }

    manifest.blocks.forEach((block, blockIndex) => {
      const blockLabel = hasText(block?.id)
        ? block.id
        : `${manifestLabel}.blocks[${blockIndex}]`;
      const requiredTextFields = [
        'id',
        'title',
        'packageName',
        'importPath',
        'exportName',
      ] as const;

      for (const field of requiredTextFields) {
        if (!hasText(block?.[field])) {
          errors.push(`${blockLabel} is missing ${field}.`);
        }
      }

      if (
        hasText(block?.packageName) &&
        hasText(manifest.packageName) &&
        block.packageName !== manifest.packageName
      ) {
        errors.push(
          `${blockLabel} packageName must match manifest.packageName.`
        );
      }

      if (hasText(block?.id)) {
        blockIds.push(block.id);
        const previousPackage = seenBlockIds.get(block.id);
        if (previousPackage) {
          errors.push(
            `${blockLabel} duplicates block id already declared by ${previousPackage}.`
          );
        } else {
          seenBlockIds.set(block.id, manifestLabel);
        }
      }

      if (!isAllowedValue(block?.packageLane, eaiBlockPackageLanes)) {
        errors.push(`${blockLabel} has an unsupported packageLane.`);
      }

      if (!isAllowedValue(block?.backendCoupling, eaiBlockBackendCouplings)) {
        errors.push(`${blockLabel} has an unsupported backendCoupling.`);
      }

      if (block?.profiles !== undefined && !Array.isArray(block.profiles)) {
        errors.push(`${blockLabel} profiles must be an array when provided.`);
      }

      const profiles =
        Array.isArray(block?.profiles) && block.profiles.length > 0
          ? block.profiles
          : isAllowedValue(block?.backendCoupling, eaiBlockBackendCouplings)
            ? supportedProfilesByCoupling[block.backendCoupling]
            : [];

      if (Array.isArray(block?.profiles) && block.profiles.length === 0) {
        errors.push(`${blockLabel} profiles cannot be empty when provided.`);
      }

      for (const profile of profiles) {
        if (!isAllowedValue(profile, eaiPackageProfiles)) {
          errors.push(`${blockLabel} has an unsupported profile "${profile}".`);
          continue;
        }

        if (
          isAllowedValue(block?.backendCoupling, eaiBlockBackendCouplings) &&
          !supportedProfilesByCoupling[block.backendCoupling].includes(profile)
        ) {
          errors.push(
            `${blockLabel} profile "${profile}" is not valid for ${block.backendCoupling}.`
          );
        }
      }

      if (
        hasText(block?.exportName) &&
        (!extension.components ||
          !Object.prototype.hasOwnProperty.call(
            extension.components,
            block.exportName
          ))
      ) {
        errors.push(
          `${blockLabel} references exportName "${block.exportName}" without a matching component.`
        );
      }

      if (
        hasText(block?.id) &&
        hasText(block?.title) &&
        hasText(block?.packageName) &&
        hasText(block?.importPath) &&
        hasText(block?.exportName) &&
        isAllowedValue(block?.packageLane, eaiBlockPackageLanes) &&
        isAllowedValue(block?.backendCoupling, eaiBlockBackendCouplings)
      ) {
        catalog.push(toCatalogEntry(block));
      }
    });
  });

  return {
    valid: errors.length === 0,
    errors,
    blockIds,
    catalog,
  };
}

function assertValidClientBlockExtensions(
  extensions: ClientBlockExtension[]
): void {
  const validation = validateClientBlockExtensions(extensions);

  if (!validation.valid) {
    throw new Error(
      `Invalid EAI block extension manifest:\n${validation.errors.join('\n')}`
    );
  }
}

/** Builds a registry from EAI catalog blocks plus customer blocks for one profile. */
export function createAppBlockRegistry(
  extensions: ClientBlockExtension[] = clientBlockExtensions,
  baseRegistry: ComponentRegistry = createDefaultRegistry(),
  options: EAIBlockRegistryOptions = {}
): ComponentRegistry {
  if (options.validate !== false) {
    assertValidClientBlockExtensions(extensions);
  }

  const profile = options.profile ?? eaiPackageProfile;
  const registry = new Map(baseRegistry);

  for (const extension of extensions) {
    for (const block of extension.manifest.blocks) {
      if (!isBlockEnabledForProfile(block, profile)) {
        continue;
      }

      const component = extension.components[block.exportName];
      if (component) {
        registry.set(block.exportName, component);
      }
    }
  }

  return registry;
}

/** Returns manifests, optionally filtered and annotated for a package profile. */
export function getClientBlockManifests(
  extensions: ClientBlockExtension[] = clientBlockExtensions,
  options: EAIBlockManifestOptions = {}
): EAIBlockManifestLike[] {
  if (options.validate) {
    assertValidClientBlockExtensions(extensions);
  }

  if (!options.profile && !options.includeResolvedProfiles) {
    return extensions.map((extension) => extension.manifest);
  }

  return extensions
    .map((extension) => ({
      ...extension.manifest,
      blocks: getProfiledBlocks(
        extension.manifest.blocks,
        options.profile,
        options.includeResolvedProfiles
      ),
    }))
    .filter((manifest) => !options.profile || manifest.blocks.length > 0);
}

/** Returns flattened JSON-safe block metadata for Gofer/CLI catalog checks. */
export function getClientBlockCatalog(
  extensions: ClientBlockExtension[] = clientBlockExtensions,
  options: EAIBlockCatalogOptions = {}
): EAIBlockCatalogEntry[] {
  if (options.validate !== false) {
    assertValidClientBlockExtensions(extensions);
  }

  return extensions.flatMap((extension) =>
    extension.manifest.blocks
      .filter(
        (block) =>
          !options.profile || isBlockEnabledForProfile(block, options.profile)
      )
      .map(toCatalogEntry)
  );
}
