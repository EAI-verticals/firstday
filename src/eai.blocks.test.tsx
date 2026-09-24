import { createElement, type ComponentType } from 'react';
import { render, screen } from '@testing-library/react';
import {
  createAppBlockRegistry,
  getClientBlockCatalog,
  getClientBlockManifests,
  validateClientBlockExtensions,
  type ClientBlockExtension,
} from './eai.blocks';

function makeBlock(testId: string): ComponentType<unknown> {
  return (() =>
    createElement('div', { 'data-testid': testId }, testId)) as ComponentType<unknown>;
}

describe('EAI block extensions', () => {
  const BaseShell = makeBlock('base-shell');
  const EaiExternalSummary = makeBlock('eai-external-summary');
  const EaiInternalAdmin = makeBlock('eai-internal-admin');
  const CustomerExternalPanel = makeBlock('customer-external-panel');
  const CustomerAdapterPanel = makeBlock('customer-adapter-panel');
  const CustomerInternalPanel = makeBlock('customer-internal-panel');
  const CustomerHybridOnlyPanel = makeBlock('customer-hybrid-only-panel');

  const eaiCatalogExtension: ClientBlockExtension = {
    manifest: {
      schemaVersion: '1.0.0',
      packageName: '@enterpriseaigroup/catalog-blocks',
      blocks: [
        {
          id: 'eai.external-summary',
          title: 'EAI External Summary',
          packageName: '@enterpriseaigroup/catalog-blocks',
          importPath: '@enterpriseaigroup/catalog-blocks',
          exportName: 'EaiExternalSummary',
          packageLane: 'foundation',
          backendCoupling: 'external-safe',
          capabilities: ['summary'],
        },
        {
          id: 'eai.internal-admin',
          title: 'EAI Internal Admin',
          packageName: '@enterpriseaigroup/catalog-blocks',
          importPath: '@enterpriseaigroup/catalog-blocks/internal',
          exportName: 'EaiInternalAdmin',
          packageLane: 'product',
          backendCoupling: 'platform-only',
          capabilities: ['admin'],
        },
      ],
    },
    components: {
      EaiExternalSummary,
      EaiInternalAdmin,
    },
  };

  const customerExtension: ClientBlockExtension = {
    manifest: {
      schemaVersion: '1.0.0',
      packageName: '@customer/app-blocks',
      blocks: [
        {
          id: 'customer.external-panel',
          title: 'Customer External Panel',
          packageName: '@customer/app-blocks',
          importPath: '@/eai.blocks',
          exportName: 'CustomerExternalPanel',
          packageLane: 'addon',
          backendCoupling: 'external-safe',
          capabilities: ['customer'],
        },
        {
          id: 'customer.adapter-panel',
          title: 'Customer Adapter Panel',
          packageName: '@customer/app-blocks',
          importPath: '@/eai.blocks',
          exportName: 'CustomerAdapterPanel',
          packageLane: 'addon',
          backendCoupling: 'external-with-adapter',
          capabilities: ['customer-adapter'],
        },
        {
          id: 'customer.internal-panel',
          title: 'Customer Internal Panel',
          packageName: '@customer/app-blocks',
          importPath: '@/eai.blocks',
          exportName: 'CustomerInternalPanel',
          packageLane: 'addon',
          backendCoupling: 'platform-only',
          capabilities: ['customer-internal'],
        },
        {
          id: 'customer.hybrid-only-panel',
          title: 'Customer Hybrid Only Panel',
          packageName: '@customer/app-blocks',
          importPath: '@/eai.blocks',
          exportName: 'CustomerHybridOnlyPanel',
          packageLane: 'addon',
          backendCoupling: 'external-safe',
          capabilities: ['customer-hybrid'],
          profiles: ['hybrid'],
        },
      ],
    },
    components: {
      CustomerExternalPanel,
      CustomerAdapterPanel,
      CustomerInternalPanel,
      CustomerHybridOnlyPanel,
    },
  };

  const extensions = [eaiCatalogExtension, customerExtension];

  function renderRegisteredBlock(
    registry: Map<string, ComponentType<unknown>>,
    componentName: string,
    testId: string
  ) {
    const Component = registry.get(componentName);

    expect(Component).toBeDefined();
    render(createElement(Component as ComponentType<unknown>));
    expect(screen.getByTestId(testId)).toBeInTheDocument();
  }

  it('HP001 preserves the external default while composing EAI catalog and customer blocks', () => {
    const baseRegistry = new Map<string, ComponentType<unknown>>([
      ['BaseShell', BaseShell],
    ]);
    const registry = createAppBlockRegistry(extensions, baseRegistry);

    expect(registry.get('BaseShell')).toBe(BaseShell);
    expect(registry.get('EaiExternalSummary')).toBe(EaiExternalSummary);
    expect(registry.get('CustomerExternalPanel')).toBe(CustomerExternalPanel);
    expect(registry.get('CustomerAdapterPanel')).toBe(CustomerAdapterPanel);
    expect(registry.has('EaiInternalAdmin')).toBe(false);
    expect(registry.has('CustomerInternalPanel')).toBe(false);
    expect(registry.has('CustomerHybridOnlyPanel')).toBe(false);
    renderRegisteredBlock(registry, 'CustomerAdapterPanel', 'customer-adapter-panel');
  });

  it('HP002 renders internal profile blocks without editing EAI-owned package source', () => {
    const registry = createAppBlockRegistry(extensions, new Map(), {
      profile: 'internal',
    });

    expect(registry.get('EaiExternalSummary')).toBe(EaiExternalSummary);
    expect(registry.get('EaiInternalAdmin')).toBe(EaiInternalAdmin);
    expect(registry.get('CustomerExternalPanel')).toBe(CustomerExternalPanel);
    expect(registry.get('CustomerInternalPanel')).toBe(CustomerInternalPanel);
    expect(registry.has('CustomerAdapterPanel')).toBe(false);
    expect(registry.has('CustomerHybridOnlyPanel')).toBe(false);
    renderRegisteredBlock(registry, 'CustomerInternalPanel', 'customer-internal-panel');
  });

  it('HP003 renders hybrid profile blocks from EAI catalog and customer extensions', () => {
    const registry = createAppBlockRegistry(extensions, new Map(), {
      profile: 'hybrid',
    });

    expect(registry.get('EaiExternalSummary')).toBe(EaiExternalSummary);
    expect(registry.get('EaiInternalAdmin')).toBe(EaiInternalAdmin);
    expect(registry.get('CustomerExternalPanel')).toBe(CustomerExternalPanel);
    expect(registry.get('CustomerAdapterPanel')).toBe(CustomerAdapterPanel);
    expect(registry.get('CustomerInternalPanel')).toBe(CustomerInternalPanel);
    expect(registry.get('CustomerHybridOnlyPanel')).toBe(CustomerHybridOnlyPanel);
    renderRegisteredBlock(
      registry,
      'CustomerHybridOnlyPanel',
      'customer-hybrid-only-panel'
    );
  });

  it('HP004 exposes block IDs, coupling, and profile metadata for Gofer catalog checks', () => {
    const validation = validateClientBlockExtensions(extensions);
    const manifests = getClientBlockManifests(extensions, {
      profile: 'hybrid',
      includeResolvedProfiles: true,
      validate: true,
    });
    const externalCatalog = getClientBlockCatalog(extensions, {
      profile: 'external',
    });

    expect(validation.valid).toBe(true);
    expect(validation.blockIds).toEqual(
      expect.arrayContaining([
        'eai.external-summary',
        'customer.external-panel',
        'customer.adapter-panel',
      ])
    );
    expect(manifests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          packageName: '@customer/app-blocks',
          blocks: expect.arrayContaining([
            expect.objectContaining({
              id: 'customer.internal-panel',
              backendCoupling: 'platform-only',
              profiles: ['internal', 'hybrid'],
            }),
            expect.objectContaining({
              id: 'customer.hybrid-only-panel',
              backendCoupling: 'external-safe',
              profiles: ['hybrid'],
            }),
          ]),
        }),
      ])
    );
    expect(externalCatalog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'customer.adapter-panel',
          backendCoupling: 'external-with-adapter',
          profiles: ['external', 'hybrid'],
        }),
      ])
    );
    expect(externalCatalog.map((block) => block.id)).not.toContain(
      'customer.internal-panel'
    );
  });

  it('BP001 rejects manifest blocks that do not have matching component bindings', () => {
    const invalidExtension: ClientBlockExtension = {
      manifest: {
        schemaVersion: '1.0.0',
        packageName: '@customer/broken-blocks',
        blocks: [
          {
            id: 'customer.missing-binding',
            title: 'Missing Binding',
            packageName: '@customer/broken-blocks',
            importPath: '@/eai.blocks',
            exportName: 'MissingBinding',
            packageLane: 'addon',
            backendCoupling: 'external-safe',
          },
        ],
      },
      components: {},
    };
    const validation = validateClientBlockExtensions([invalidExtension]);

    expect(validation.valid).toBe(false);
    expect(validation.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('without a matching component'),
      ])
    );
    expect(() => createAppBlockRegistry([invalidExtension])).toThrow(
      /matching component/
    );
  });

  it('BP002 rejects duplicate IDs and profile/coupling mismatches before registration', () => {
    const invalidExtension: ClientBlockExtension = {
      manifest: {
        schemaVersion: '1.0.0',
        packageName: '@customer/conflicting-blocks',
        blocks: [
          {
            id: 'eai.external-summary',
            title: 'Duplicate External Summary',
            packageName: '@customer/conflicting-blocks',
            importPath: '@/eai.blocks',
            exportName: 'ConflictingExternalSummary',
            packageLane: 'addon',
            backendCoupling: 'platform-only',
            profiles: ['external'],
          },
        ],
      },
      components: {
        ConflictingExternalSummary: makeBlock('conflicting-external-summary'),
      },
    };
    const validation = validateClientBlockExtensions([
      eaiCatalogExtension,
      invalidExtension,
    ]);

    expect(validation.valid).toBe(false);
    expect(validation.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('duplicates block id'),
        expect.stringContaining('profile "external" is not valid for platform-only'),
      ])
    );
    expect(() =>
      createAppBlockRegistry([eaiCatalogExtension, invalidExtension])
    ).toThrow(/Invalid EAI block extension manifest/);
  });
});
