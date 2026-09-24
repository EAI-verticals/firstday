/**
 * Default Configuration
 *
 * A minimal configuration scaffold for the EAI App Template.
 * The portal's Step 5 updates tenantId and workflowId via regex replacement.
 * Copy this as a starting point for your own app.
 */

import {
  defineConfig,
  type EAIConfig,
} from '@enterpriseaigroup/core/config/server';

import {
  templateDeploymentContract,
  type TemplateDeploymentContract,
} from './deployment-contract';

type TemplateConfig = EAIConfig & {
  deploymentContract: TemplateDeploymentContract;
};

const templateConfigSource = {
  // ==========================================================================
  // IDENTITY
  // ==========================================================================
  tenantId: 'template',
  workflowId: 'demo-workflow',
  defaultEmail: 'demo@example.com',

  // ==========================================================================
  // METADATA
  // ==========================================================================
  meta: {
    title: 'Demo Template',
    description: 'A config-driven app built with Enterprise AI',
  },

  // ==========================================================================
  // FEATURES
  // ==========================================================================
  features: {
    enableTenantSwitching: false,
  },

  // ==========================================================================
  // DEPLOYMENT CONTRACT
  // ==========================================================================
  deploymentContract: templateDeploymentContract,

  // ==========================================================================
  // API
  // ==========================================================================
  api: {
    // Prefix with NEXT_PUBLIC_APP_BASE_PATH so client-side fetches from
    // the platform SDK go through Next.js basePath (e.g.
    // `/my-app/api/eai/v4/...`). Without this, raw fetch() hits
    // `/api/eai/v4/...` and 404s under basePath. No-op when empty.
    baseUrl: `${(process.env.NEXT_PUBLIC_APP_BASE_PATH ?? '').replace(/\/+$/, '')}/api/eai`,
    endpoints: {},
  },

  // ==========================================================================
  // STORAGE
  // ==========================================================================
  storage: {
    prefix: 'demo',
    persistenceStrategy: 'sessionStorage',
    globalStoreKey: 'demo-global-store',
    selectedTenantKey: 'demo-selected-tenant',
  },

  // ==========================================================================
  // STORE SLICES
  // ==========================================================================
  store: {
    // User slice - authentication and user info
    user: {
      initialState: {
        isAuthenticated: false,
        name: null,
        email: null,
      },
      persist: true,
    },

    // UI slice - UI state (not persisted)
    ui: {
      initialState: {
        showWelcome: true,
        theme: 'light',
      },
      persist: false,
    },
  },

  // ==========================================================================
  // LAYOUT
  // ==========================================================================
  layout: {
    // Header slot
    header: {
      className: 'bg-white border-b shadow-sm',
      components: [
        {
          component: 'Card',
          priority: 1,
          props: {
            className: 'w-full rounded-none border-0 shadow-none',
            children: null, // Will be set via componentOverrides or custom component
          },
        },
      ],
    },

    // Middle pane - main content area
    middlePane: {
      className: 'flex-1 p-6 space-y-6',
      components: [
        // Welcome card using ExampleCard from demo package
        {
          component: 'ExampleCard',
          priority: 1,
          props: {
            title: 'Welcome to the Demo Template',
            description:
              'This is a config-driven UI system. Components are defined in configuration and rendered automatically.',
            actionLabel: 'Get Started',
            className: 'max-w-2xl mx-auto',
          },
        },

        // Feature cards showing core UI components
        {
          component: 'Card',
          priority: 2,
          props: {
            className: 'max-w-2xl mx-auto',
          },
        },
      ],
    },

    // Right pane - optional sidebar
    rightPane: {
      className: 'w-80 p-4 bg-gray-50 border-l hidden lg:block',
      components: [
        {
          component: 'Card',
          priority: 1,
          props: {
            className: 'sticky top-4',
          },
        },
      ],
    },
  },
} satisfies TemplateConfig;

const templateConfig = defineConfig(templateConfigSource) as TemplateConfig;

export default templateConfig;
