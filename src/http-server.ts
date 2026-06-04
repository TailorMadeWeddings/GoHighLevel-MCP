/**
 * GoHighLevel MCP HTTP Server
 * HTTP version for ChatGPT web integration
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import * as dotenv from 'dotenv';

import { GHLApiClient } from './clients/ghl-api-client';
import { ContactTools } from './tools/contact-tools';
import { ConversationTools } from './tools/conversation-tools';
import { BlogTools } from './tools/blog-tools';
import { OpportunityTools } from './tools/opportunity-tools';
import { CalendarTools } from './tools/calendar-tools';
import { EmailTools } from './tools/email-tools';
import { LocationTools } from './tools/location-tools';
import { EmailISVTools } from './tools/email-isv-tools';
import { SocialMediaTools } from './tools/social-media-tools';
import { MediaTools } from './tools/media-tools';
import { ObjectTools } from './tools/object-tools';
import { AssociationTools } from './tools/association-tools';
import { CustomFieldV2Tools } from './tools/custom-field-v2-tools';
import { WorkflowTools } from './tools/workflow-tools';
import { SurveyTools } from './tools/survey-tools';
import { StoreTools } from './tools/store-tools';
import { ProductsTools } from './tools/products-tools.js';
import { PaymentsTools } from './tools/payments-tools.js';
import { InvoicesTools } from './tools/invoices-tools.js';
import { GHLConfig } from './types/ghl-types';
import { requireAuth, isOAuthEnabled } from './middleware/auth.js';

// Load environment variables
dotenv.config();

/**
 * Holds all tool instances for a single GHL sub-account
 */
interface AccountToolSet {
  name: string;
  locationId: string;
  client: GHLApiClient;
  contactTools: ContactTools;
  conversationTools: ConversationTools;
  blogTools: BlogTools;
  opportunityTools: OpportunityTools;
  calendarTools: CalendarTools;
  emailTools: EmailTools;
  locationTools: LocationTools;
  emailISVTools: EmailISVTools;
  socialMediaTools: SocialMediaTools;
  mediaTools: MediaTools;
  objectTools: ObjectTools;
  associationTools: AssociationTools;
  customFieldV2Tools: CustomFieldV2Tools;
  workflowTools: WorkflowTools;
  surveyTools: SurveyTools;
  storeTools: StoreTools;
  productsTools: ProductsTools;
  paymentsTools: PaymentsTools;
  invoicesTools: InvoicesTools;
}

/**
 * HTTP MCP Server class for web deployment
 */
class GHLMCPHttpServer {
  private app: express.Application;
  private server: Server;
  private accounts: Map<string, AccountToolSet> = new Map();
  private activeAccountName: string = '';
  private port: number;

  constructor() {
    this.port = parseInt(process.env.PORT || process.env.MCP_SERVER_PORT || '8000');

    // Initialize Express app
    this.app = express();
    this.setupExpress();

    // Initialize MCP server with capabilities
    this.server = new Server(
      {
        name: 'ghl-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize all GHL accounts
    this.initializeAccounts();

    // Setup MCP handlers
    this.setupMCPHandlers();
    this.setupRoutes();
  }

  /**
   * Get the currently active account's tool set
   */
  private getActiveAccount(): AccountToolSet {
    const account = this.accounts.get(this.activeAccountName);
    if (!account) {
      throw new Error(`No active account. Available: ${Array.from(this.accounts.keys()).join(', ')}`);
    }
    return account;
  }

  /**
   * Initialize all GHL accounts from environment variables.
   */
  private initializeAccounts(): void {
    const accountNames = process.env.GHL_ACCOUNTS;
    const baseUrl = process.env.GHL_BASE_URL || 'https://services.leadconnectorhq.com';

    if (accountNames) {
      // Multi-account mode
      const names = accountNames.split(',').map(n => n.trim()).filter(Boolean);
      if (names.length === 0) {
        throw new Error('GHL_ACCOUNTS is set but contains no account names');
      }

      for (const name of names) {
        const apiKey = process.env[`GHL_${name}_API_KEY`];
        const locationId = process.env[`GHL_${name}_LOCATION_ID`];

        if (!apiKey) {
          throw new Error(`GHL_${name}_API_KEY environment variable is required for account "${name}"`);
        }
        if (!locationId) {
          throw new Error(`GHL_${name}_LOCATION_ID environment variable is required for account "${name}"`);
        }

        const account = this.createAccountToolSet(name, {
          accessToken: apiKey,
          baseUrl,
          version: '2021-07-28',
          locationId
        });
        this.accounts.set(name, account);
        console.log(`[GHL MCP HTTP] Loaded account "${name}" (Location: ${locationId})`);
      }

      this.activeAccountName = names[0];
      console.log(`[GHL MCP HTTP] Active account: "${this.activeAccountName}"`);
    } else {
      // Legacy single-account mode
      const apiKey = process.env.GHL_API_KEY || '';
      const locationId = process.env.GHL_LOCATION_ID || '';

      if (!apiKey) {
        throw new Error('GHL_API_KEY environment variable is required (or use GHL_ACCOUNTS for multi-account)');
      }
      if (!locationId) {
        throw new Error('GHL_LOCATION_ID environment variable is required (or use GHL_ACCOUNTS for multi-account)');
      }

      const name = 'default';
      const account = this.createAccountToolSet(name, {
        accessToken: apiKey,
        baseUrl,
        version: '2021-07-28',
        locationId
      });
      this.accounts.set(name, account);
      this.activeAccountName = name;

      console.log(`[GHL MCP HTTP] Single-account mode (Location: ${locationId})`);
    }
  }

  /**
   * Create a full tool set for a single GHL account
   */
  private createAccountToolSet(name: string, config: GHLConfig): AccountToolSet {
    const client = new GHLApiClient(config);
    return {
      name,
      locationId: config.locationId,
      client,
      contactTools: new ContactTools(client),
      conversationTools: new ConversationTools(client),
      blogTools: new BlogTools(client),
      opportunityTools: new OpportunityTools(client),
      calendarTools: new CalendarTools(client),
      emailTools: new EmailTools(client),
      locationTools: new LocationTools(client),
      emailISVTools: new EmailISVTools(client),
      socialMediaTools: new SocialMediaTools(client),
      mediaTools: new MediaTools(client),
      objectTools: new ObjectTools(client),
      associationTools: new AssociationTools(client),
      customFieldV2Tools: new CustomFieldV2Tools(client),
      workflowTools: new WorkflowTools(client),
      surveyTools: new SurveyTools(client),
      storeTools: new StoreTools(client),
      productsTools: new ProductsTools(client),
      paymentsTools: new PaymentsTools(client),
      invoicesTools: new InvoicesTools(client),
    };
  }

  /**
   * Setup Express middleware and configuration
   */
  private setupExpress(): void {
    // Enable CORS for ChatGPT integration
    this.app.use(cors({
      origin: ['https://chatgpt.com', 'https://chat.openai.com', 'http://localhost:*'],
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
      credentials: true
    }));

    // Parse JSON requests
    this.app.use(express.json());

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`[HTTP] ${req.method} ${req.path} - ${new Date().toISOString()}`);
      next();
    });
  }

  /**
   * Get the account management tool definitions
   */
  private getAccountToolDefinitions() {
    return [
      {
        name: 'list_subaccounts',
        description: 'List all configured GHL sub-accounts and show which one is currently active.',
        inputSchema: {
          type: 'object' as const,
          properties: {}
        }
      },
      {
        name: 'switch_subaccount',
        description: 'Switch the active GHL sub-account. All subsequent tool calls will use this account until switched again.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            name: {
              type: 'string',
              description: 'The name of the sub-account to switch to (as configured in .env GHL_ACCOUNTS)'
            }
          },
          required: ['name']
        }
      }
    ];
  }

  /**
   * Setup MCP request handlers
   */
  private setupMCPHandlers(): void {
    // Handle list tools requests
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      console.log('[GHL MCP HTTP] Listing available tools...');

      try {
        const acct = this.getActiveAccount();

        const allTools = [
          ...this.getAccountToolDefinitions(),
          ...acct.contactTools.getToolDefinitions(),
          ...acct.conversationTools.getToolDefinitions(),
          ...acct.blogTools.getToolDefinitions(),
          ...acct.opportunityTools.getToolDefinitions(),
          ...acct.calendarTools.getToolDefinitions(),
          ...acct.emailTools.getToolDefinitions(),
          ...acct.locationTools.getToolDefinitions(),
          ...acct.emailISVTools.getToolDefinitions(),
          ...acct.socialMediaTools.getTools(),
          ...acct.mediaTools.getToolDefinitions(),
          ...acct.objectTools.getToolDefinitions(),
          ...acct.associationTools.getTools(),
          ...acct.customFieldV2Tools.getTools(),
          ...acct.workflowTools.getTools(),
          ...acct.surveyTools.getTools(),
          ...acct.storeTools.getTools(),
          ...acct.productsTools.getTools(),
          ...acct.paymentsTools.getTools(),
          ...acct.invoicesTools.getTools()
        ];

        console.log(`[GHL MCP HTTP] Registered ${allTools.length} tools (${this.accounts.size} account(s))`);

        return {
          tools: allTools
        };
      } catch (error) {
        console.error('[GHL MCP HTTP] Error listing tools:', error);
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to list tools: ${error}`
        );
      }
    });

    // Handle tool execution requests
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      console.log(`[GHL MCP HTTP] Executing tool: ${name} (account: ${this.activeAccountName})`);

      try {
        let result: any;

        // Handle account management tools first
        if (name === 'list_subaccounts') {
          const accountList = Array.from(this.accounts.entries()).map(([acctName, acct]) => ({
            name: acctName,
            locationId: acct.locationId,
            active: acctName === this.activeAccountName
          }));
          result = {
            success: true,
            activeAccount: this.activeAccountName,
            accounts: accountList,
            message: `${accountList.length} sub-account(s) configured. Active: "${this.activeAccountName}"`
          };
        } else if (name === 'switch_subaccount') {
          const targetName = (args as any)?.name;
          if (!targetName) {
            throw new Error('Account name is required');
          }
          if (!this.accounts.has(targetName)) {
            const available = Array.from(this.accounts.keys()).join(', ');
            throw new Error(`Account "${targetName}" not found. Available: ${available}`);
          }
          this.activeAccountName = targetName;
          const acct = this.accounts.get(targetName)!;
          console.log(`[GHL MCP HTTP] Switched to account "${targetName}" (Location: ${acct.locationId})`);
          result = {
            success: true,
            activeAccount: targetName,
            locationId: acct.locationId,
            message: `Switched to sub-account "${targetName}" (Location: ${acct.locationId})`
          };
        } else {
          // Route to the active account's tool handler
          const acct = this.getActiveAccount();

          if (this.isContactTool(name)) {
            result = await acct.contactTools.executeTool(name, args || {});
          } else if (this.isConversationTool(name)) {
            result = await acct.conversationTools.executeTool(name, args || {});
          } else if (this.isBlogTool(name)) {
            result = await acct.blogTools.executeTool(name, args || {});
          } else if (this.isOpportunityTool(name)) {
            result = await acct.opportunityTools.executeTool(name, args || {});
          } else if (this.isCalendarTool(name)) {
            result = await acct.calendarTools.executeTool(name, args || {});
          } else if (this.isEmailTool(name)) {
            result = await acct.emailTools.executeTool(name, args || {});
          } else if (this.isLocationTool(name)) {
            result = await acct.locationTools.executeTool(name, args || {});
          } else if (this.isEmailISVTool(name)) {
            result = await acct.emailISVTools.executeTool(name, args || {});
          } else if (this.isSocialMediaTool(name)) {
            result = await acct.socialMediaTools.executeTool(name, args || {});
          } else if (this.isMediaTool(name)) {
            result = await acct.mediaTools.executeTool(name, args || {});
          } else if (this.isObjectTool(name)) {
            result = await acct.objectTools.executeTool(name, args || {});
          } else if (this.isAssociationTool(name)) {
            result = await acct.associationTools.executeAssociationTool(name, args || {});
          } else if (this.isCustomFieldV2Tool(name)) {
            result = await acct.customFieldV2Tools.executeCustomFieldV2Tool(name, args || {});
          } else if (this.isWorkflowTool(name)) {
            result = await acct.workflowTools.executeWorkflowTool(name, args || {});
          } else if (this.isSurveyTool(name)) {
            result = await acct.surveyTools.executeSurveyTool(name, args || {});
          } else if (this.isStoreTool(name)) {
            result = await acct.storeTools.executeStoreTool(name, args || {});
          } else if (this.isProductsTool(name)) {
            result = await acct.productsTools.executeProductsTool(name, args || {});
          } else if (this.isPaymentsTool(name)) {
            result = await acct.paymentsTools.handleToolCall(name, args || {});
          } else if (this.isInvoicesTool(name)) {
            result = await acct.invoicesTools.handleToolCall(name, args || {});
          } else {
            throw new Error(`Unknown tool: ${name}`);
          }
        }

        console.log(`[GHL MCP HTTP] Tool ${name} executed successfully`);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        console.error(`[GHL MCP HTTP] Error executing tool ${name}:`, error);

        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error}`
        );
      }
    });
  }

  /**
   * Setup HTTP routes
   */
  private setupRoutes(): void {
    // OAuth Protected Resource Metadata (RFC 9728)
    // This MUST be unauthenticated — Claude uses it to discover the auth server
    this.app.get('/.well-known/oauth-protected-resource', (req, res) => {
      const resource = process.env.MCP_RESOURCE_IDENTIFIER
        || `${req.get('x-forwarded-proto') || req.protocol}://${req.get('host')}`;
      const authServer = process.env.STYTCH_PROJECT_DOMAIN;

      if (!authServer) {
        res.status(404).json({ error: 'OAuth not configured' });
        return;
      }

      res.json({
        resource,
        authorization_servers: [authServer],
        bearer_methods_supported: ['header'],
        scopes_supported: ['openid', 'profile', 'email']
      });
    });

    // OAuth consent pages (unauthenticated — these ARE the login/consent flow)
    // Serves static HTML with the Stytch public token injected into a data attribute
    const oauthPages = ['authorize', 'login', 'authenticate'];
    for (const page of oauthPages) {
      this.app.get(`/oauth/${page}`, (req, res) => {
        const publicToken = process.env.STYTCH_PUBLIC_TOKEN || '';
        const htmlPath = path.resolve(process.cwd(), 'public', 'oauth', `${page}.html`);

        try {
          let html = fs.readFileSync(htmlPath, 'utf-8');
          // Inject the public token as a data attribute on <html> so the JS can read it
          html = html.replace('<html lang="en">', `<html lang="en" data-stytch-token="${publicToken}">`);
          res.type('html').send(html);
        } catch (err) {
          console.error(`[GHL MCP HTTP] Failed to serve /oauth/${page}:`, err);
          res.status(500).send('OAuth page not found');
        }
      });
    }

    // Health check endpoint (unauthenticated)
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        server: 'ghl-mcp-server',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        accounts: this.accounts.size,
        activeAccount: this.activeAccountName,
        tools: this.getToolsCount()
      });
    });

    // MCP capabilities endpoint (guarded)
    this.app.get('/capabilities', requireAuth, (req, res) => {
      res.json({
        capabilities: {
          tools: {},
        },
        server: {
          name: 'ghl-mcp-server',
          version: '1.0.0'
        }
      });
    });

    // Tools listing endpoint (guarded — leaks tool surface if open)
    this.app.get('/tools', requireAuth, async (req, res) => {
      try {
        const acct = this.getActiveAccount();
        const allTools = [
          ...this.getAccountToolDefinitions(),
          ...acct.contactTools.getToolDefinitions(),
          ...acct.conversationTools.getToolDefinitions(),
          ...acct.blogTools.getToolDefinitions(),
          ...acct.opportunityTools.getToolDefinitions(),
          ...acct.calendarTools.getToolDefinitions(),
          ...acct.emailTools.getToolDefinitions(),
          ...acct.locationTools.getToolDefinitions(),
          ...acct.emailISVTools.getToolDefinitions(),
          ...acct.socialMediaTools.getTools(),
          ...acct.mediaTools.getToolDefinitions(),
          ...acct.objectTools.getToolDefinitions(),
          ...acct.associationTools.getTools(),
          ...acct.customFieldV2Tools.getTools(),
          ...acct.workflowTools.getTools(),
          ...acct.surveyTools.getTools(),
          ...acct.storeTools.getTools(),
          ...acct.productsTools.getTools(),
          ...acct.paymentsTools.getTools(),
          ...acct.invoicesTools.getTools()
        ];

        res.json({
          tools: allTools,
          count: allTools.length
        });
      } catch (error) {
        res.status(500).json({ error: 'Failed to list tools' });
      }
    });

    // SSE endpoint for ChatGPT MCP connection
    const handleSSE = async (req: express.Request, res: express.Response) => {
      const sessionId = req.query.sessionId || 'unknown';
      console.log(`[GHL MCP HTTP] New SSE connection from: ${req.ip}, sessionId: ${sessionId}, method: ${req.method}`);

      try {
        // Create SSE transport (this will set the headers)
        const transport = new SSEServerTransport('/sse', res);

        // Connect MCP server to transport
        await this.server.connect(transport);

        console.log(`[GHL MCP HTTP] SSE connection established for session: ${sessionId}`);

        // Handle client disconnect
        req.on('close', () => {
          console.log(`[GHL MCP HTTP] SSE connection closed for session: ${sessionId}`);
        });

      } catch (error) {
        console.error(`[GHL MCP HTTP] SSE connection error for session ${sessionId}:`, error);

        // Only send error response if headers haven't been sent yet
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to establish SSE connection' });
        } else {
          // If headers were already sent, close the connection
          res.end();
        }
      }
    };

    // Handle both GET and POST for SSE (MCP protocol requirements)
    // Auth middleware gates access when Stytch is configured; passes through in open mode
    this.app.get('/sse', requireAuth, handleSSE);
    this.app.post('/sse', requireAuth, handleSSE);

    // Root endpoint with server info
    this.app.get('/', (req, res) => {
      res.json({
        name: 'GoHighLevel MCP Server',
        version: '1.0.0',
        status: 'running',
        endpoints: {
          health: '/health',
          capabilities: '/capabilities',
          tools: '/tools',
          sse: '/sse'
        },
        accounts: this.accounts.size,
        activeAccount: this.activeAccountName,
        tools: this.getToolsCount(),
        documentation: 'https://github.com/your-repo/ghl-mcp-server'
      });
    });
  }

  /**
   * Get tools count summary
   */
  private getToolsCount() {
    const acct = this.getActiveAccount();
    const total = 2 + // account management tools
      acct.contactTools.getToolDefinitions().length +
      acct.conversationTools.getToolDefinitions().length +
      acct.blogTools.getToolDefinitions().length +
      acct.opportunityTools.getToolDefinitions().length +
      acct.calendarTools.getToolDefinitions().length +
      acct.emailTools.getToolDefinitions().length +
      acct.locationTools.getToolDefinitions().length +
      acct.emailISVTools.getToolDefinitions().length +
      acct.socialMediaTools.getTools().length +
      acct.mediaTools.getToolDefinitions().length +
      acct.objectTools.getToolDefinitions().length +
      acct.associationTools.getTools().length +
      acct.customFieldV2Tools.getTools().length +
      acct.workflowTools.getTools().length +
      acct.surveyTools.getTools().length +
      acct.storeTools.getTools().length +
      acct.productsTools.getTools().length +
      acct.paymentsTools.getTools().length +
      acct.invoicesTools.getTools().length;

    return { total };
  }

  /**
   * Tool name validation helpers
   */
  private isContactTool(toolName: string): boolean {
    const contactToolNames = [
      'create_contact', 'search_contacts', 'get_contact', 'update_contact',
      'add_contact_tags', 'remove_contact_tags', 'delete_contact',
      'get_contact_tasks', 'create_contact_task', 'get_contact_task', 'update_contact_task',
      'delete_contact_task', 'update_task_completion',
      'get_contact_notes', 'create_contact_note', 'get_contact_note', 'update_contact_note',
      'delete_contact_note',
      'upsert_contact', 'get_duplicate_contact', 'get_contacts_by_business', 'get_contact_appointments',
      'bulk_update_contact_tags', 'bulk_update_contact_business',
      'add_contact_followers', 'remove_contact_followers',
      'add_contact_to_campaign', 'remove_contact_from_campaign', 'remove_contact_from_all_campaigns',
      'add_contact_to_workflow', 'remove_contact_from_workflow'
    ];
    return contactToolNames.includes(toolName);
  }

  private isConversationTool(toolName: string): boolean {
    const conversationToolNames = [
      'send_sms', 'send_email', 'search_conversations', 'get_conversation',
      'create_conversation', 'update_conversation', 'delete_conversation', 'get_recent_messages',
      'get_email_message', 'get_message', 'upload_message_attachments', 'update_message_status',
      'add_inbound_message', 'add_outbound_call',
      'get_message_recording', 'get_message_transcription', 'download_transcription',
      'cancel_scheduled_message', 'cancel_scheduled_email',
      'live_chat_typing'
    ];
    return conversationToolNames.includes(toolName);
  }

  private isBlogTool(toolName: string): boolean {
    const blogToolNames = [
      'create_blog_post', 'update_blog_post', 'get_blog_posts', 'get_blog_sites',
      'get_blog_authors', 'get_blog_categories', 'check_url_slug'
    ];
    return blogToolNames.includes(toolName);
  }

  private isOpportunityTool(toolName: string): boolean {
    const opportunityToolNames = [
      'search_opportunities', 'get_pipelines', 'get_opportunity', 'create_opportunity',
      'update_opportunity_status', 'delete_opportunity', 'update_opportunity',
      'upsert_opportunity', 'add_opportunity_followers', 'remove_opportunity_followers'
    ];
    return opportunityToolNames.includes(toolName);
  }

  private isCalendarTool(toolName: string): boolean {
    const calendarToolNames = [
      'get_calendar_groups', 'create_calendar_group', 'validate_group_slug',
      'update_calendar_group', 'delete_calendar_group', 'disable_calendar_group',
      'get_calendars', 'create_calendar', 'get_calendar', 'update_calendar', 'delete_calendar',
      'get_calendar_events', 'get_free_slots', 'create_appointment', 'get_appointment',
      'update_appointment', 'delete_appointment',
      'get_appointment_notes', 'create_appointment_note', 'update_appointment_note', 'delete_appointment_note',
      'get_calendar_resources', 'get_calendar_resource_by_id', 'update_calendar_resource', 'delete_calendar_resource',
      'get_calendar_notifications', 'create_calendar_notification', 'update_calendar_notification', 'delete_calendar_notification',
      'create_block_slot', 'update_block_slot', 'get_blocked_slots', 'delete_blocked_slot'
    ];
    return calendarToolNames.includes(toolName);
  }

  private isEmailTool(toolName: string): boolean {
    const emailToolNames = [
      'get_email_campaigns', 'create_email_template', 'get_email_templates',
      'update_email_template', 'delete_email_template'
    ];
    return emailToolNames.includes(toolName);
  }

  private isLocationTool(toolName: string): boolean {
    const locationToolNames = [
      'search_locations', 'get_location', 'create_location', 'update_location', 'delete_location',
      'get_location_tags', 'create_location_tag', 'get_location_tag', 'update_location_tag', 'delete_location_tag',
      'search_location_tasks',
      'get_location_custom_fields', 'create_location_custom_field', 'get_location_custom_field',
      'update_location_custom_field', 'delete_location_custom_field',
      'get_location_custom_values', 'create_location_custom_value', 'get_location_custom_value',
      'update_location_custom_value', 'delete_location_custom_value',
      'get_location_templates', 'delete_location_template',
      'get_timezones'
    ];
    return locationToolNames.includes(toolName);
  }

  private isEmailISVTool(toolName: string): boolean {
    return toolName === 'verify_email';
  }

  private isSocialMediaTool(toolName: string): boolean {
    const socialMediaToolNames = [
      'search_social_posts', 'create_social_post', 'get_social_post', 'update_social_post',
      'delete_social_post', 'bulk_delete_social_posts',
      'get_social_accounts', 'delete_social_account',
      'upload_social_csv', 'get_csv_upload_status', 'set_csv_accounts',
      'get_social_categories', 'get_social_category', 'get_social_tags', 'get_social_tags_by_ids',
      'start_social_oauth', 'get_platform_accounts'
    ];
    return socialMediaToolNames.includes(toolName);
  }

  private isMediaTool(toolName: string): boolean {
    const mediaToolNames = ['get_media_files', 'upload_media_file', 'delete_media_file'];
    return mediaToolNames.includes(toolName);
  }

  private isObjectTool(toolName: string): boolean {
    const objectToolNames = [
      'get_all_objects', 'create_object_schema', 'get_object_schema', 'update_object_schema',
      'create_object_record', 'get_object_record', 'update_object_record', 'delete_object_record',
      'search_object_records'
    ];
    return objectToolNames.includes(toolName);
  }

  private isAssociationTool(toolName: string): boolean {
    const associationToolNames = [
      'ghl_get_all_associations', 'ghl_create_association', 'ghl_get_association_by_id',
      'ghl_update_association', 'ghl_delete_association', 'ghl_get_association_by_key',
      'ghl_get_association_by_object_key', 'ghl_create_relation', 'ghl_get_relations_by_record',
      'ghl_delete_relation'
    ];
    return associationToolNames.includes(toolName);
  }

  private isCustomFieldV2Tool(toolName: string): boolean {
    const customFieldV2ToolNames = [
      'ghl_get_custom_field_by_id', 'ghl_create_custom_field', 'ghl_update_custom_field',
      'ghl_delete_custom_field', 'ghl_get_custom_fields_by_object_key', 'ghl_create_custom_field_folder',
      'ghl_update_custom_field_folder', 'ghl_delete_custom_field_folder'
    ];
    return customFieldV2ToolNames.includes(toolName);
  }

  private isWorkflowTool(toolName: string): boolean {
    return toolName === 'ghl_get_workflows';
  }

  private isSurveyTool(toolName: string): boolean {
    return toolName === 'ghl_get_surveys' || toolName === 'ghl_get_survey_submissions';
  }

  private isStoreTool(toolName: string): boolean {
    const storeToolNames = [
      'ghl_create_shipping_zone', 'ghl_list_shipping_zones', 'ghl_get_shipping_zone',
      'ghl_update_shipping_zone', 'ghl_delete_shipping_zone', 'ghl_get_available_shipping_rates',
      'ghl_create_shipping_rate', 'ghl_list_shipping_rates', 'ghl_get_shipping_rate',
      'ghl_update_shipping_rate', 'ghl_delete_shipping_rate', 'ghl_create_shipping_carrier',
      'ghl_list_shipping_carriers', 'ghl_get_shipping_carrier', 'ghl_update_shipping_carrier',
      'ghl_delete_shipping_carrier', 'ghl_create_store_setting', 'ghl_get_store_setting'
    ];
    return storeToolNames.includes(toolName);
  }

  private isProductsTool(toolName: string): boolean {
    const productsToolNames = [
      'ghl_create_product', 'ghl_list_products', 'ghl_get_product', 'ghl_update_product',
      'ghl_delete_product', 'ghl_bulk_update_products', 'ghl_create_price', 'ghl_list_prices',
      'ghl_get_price', 'ghl_update_price', 'ghl_delete_price', 'ghl_list_inventory',
      'ghl_update_inventory', 'ghl_get_product_store_stats', 'ghl_update_product_store',
      'ghl_create_product_collection', 'ghl_list_product_collections', 'ghl_get_product_collection',
      'ghl_update_product_collection', 'ghl_delete_product_collection', 'ghl_list_product_reviews',
      'ghl_get_reviews_count', 'ghl_update_product_review', 'ghl_delete_product_review',
      'ghl_bulk_update_product_reviews'
    ];
    return productsToolNames.includes(toolName);
  }

  private isPaymentsTool(toolName: string): boolean {
    const paymentsToolNames = [
      'create_whitelabel_integration_provider', 'list_whitelabel_integration_providers',
      'list_orders', 'get_order_by_id',
      'create_order_fulfillment', 'list_order_fulfillments',
      'list_transactions', 'get_transaction_by_id',
      'list_subscriptions', 'get_subscription_by_id',
      'list_coupons', 'create_coupon', 'update_coupon', 'delete_coupon', 'get_coupon',
      'create_custom_provider_integration', 'delete_custom_provider_integration',
      'get_custom_provider_config', 'create_custom_provider_config', 'disconnect_custom_provider_config'
    ];
    return paymentsToolNames.includes(toolName);
  }

  private isInvoicesTool(toolName: string): boolean {
    const invoicesToolNames = [
      'create_invoice_template', 'list_invoice_templates', 'get_invoice_template', 'update_invoice_template', 'delete_invoice_template',
      'update_invoice_template_late_fees', 'update_invoice_template_payment_methods',
      'create_invoice_schedule', 'list_invoice_schedules', 'get_invoice_schedule', 'update_invoice_schedule', 'delete_invoice_schedule',
      'schedule_invoice_schedule', 'auto_payment_invoice_schedule', 'cancel_invoice_schedule',
      'create_invoice', 'list_invoices', 'get_invoice', 'update_invoice', 'delete_invoice', 'void_invoice', 'send_invoice',
      'record_invoice_payment', 'generate_invoice_number', 'text2pay_invoice', 'update_invoice_last_visited',
      'create_estimate', 'list_estimates', 'update_estimate', 'delete_estimate', 'send_estimate', 'create_invoice_from_estimate',
      'generate_estimate_number', 'update_estimate_last_visited',
      'list_estimate_templates', 'create_estimate_template', 'update_estimate_template', 'delete_estimate_template', 'preview_estimate_template'
    ];
    return invoicesToolNames.includes(toolName);
  }

  /**
   * Test GHL API connection for all accounts
   */
  private async testGHLConnection(): Promise<void> {
    for (const [name, acct] of this.accounts) {
      try {
        console.log(`[GHL MCP HTTP] Testing connection for account "${name}"...`);
        const result = await acct.client.testConnection();
        console.log(`[GHL MCP HTTP] ✅ Account "${name}" connected (Location: ${result.data?.locationId})`);
      } catch (error) {
        console.error(`[GHL MCP HTTP] ❌ Account "${name}" connection failed:`, error);
        throw new Error(`Failed to connect to GHL API for account "${name}": ${error}`);
      }
    }
  }

  /**
   * Start the HTTP server
   */
  async start(): Promise<void> {
    console.log('🚀 Starting GoHighLevel MCP HTTP Server...');
    console.log('=========================================');

    try {
      // Test GHL API connection
      await this.testGHLConnection();

      // Start HTTP server
      this.app.listen(this.port, '0.0.0.0', () => {
        console.log('✅ GoHighLevel MCP HTTP Server started successfully!');
        console.log(`🌐 Server running on: http://0.0.0.0:${this.port}`);
        console.log(`🔗 SSE Endpoint: http://0.0.0.0:${this.port}/sse`);
        console.log(`📋 Tools Available: ${this.getToolsCount().total}`);
        console.log(`🏢 Sub-accounts: ${this.accounts.size} (active: "${this.activeAccountName}")`);
        for (const [acctName, acctData] of this.accounts) {
          const marker = acctName === this.activeAccountName ? '→' : ' ';
          console.log(`   ${marker} ${acctName} (Location: ${acctData.locationId})`);
        }
        console.log(`🔐 OAuth: ${isOAuthEnabled() ? 'ENABLED (Stytch)' : 'DISABLED (open mode)'}`);
        console.log('=========================================');
      });

    } catch (error) {
      console.error('❌ Failed to start GHL MCP HTTP Server:', error);
      process.exit(1);
    }
  }
}

/**
 * Handle graceful shutdown
 */
function setupGracefulShutdown(): void {
  const shutdown = (signal: string) => {
    console.log(`\n[GHL MCP HTTP] Received ${signal}, shutting down gracefully...`);
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  try {
    // Setup graceful shutdown
    setupGracefulShutdown();

    // Create and start HTTP server
    const server = new GHLMCPHttpServer();
    await server.start();

  } catch (error) {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  }
}

// Start the server
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
