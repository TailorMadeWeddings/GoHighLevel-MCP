/**
 * MCP Email Tools for GoHighLevel Integration
 * Exposes email campaign and template management capabilities to the MCP server
 */

import axios from 'axios';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { GHLApiClient } from '../clients/ghl-api-client.js';
import {
  MCPGetEmailCampaignsParams,
  MCPCreateEmailTemplateParams,
  MCPGetEmailTemplatesParams,
  MCPUpdateEmailTemplateParams,
  MCPDeleteEmailTemplateParams,
  MCPGetEmailTemplateContentParams,
  GHLEmailCampaign,
  GHLEmailTemplate,
  // Email statistics (v3)
  GHLEmailStatsSource,
  GHLEmailCampaignStats,
  MCPListWorkflowEmailCampaignsParams,
  MCPGetWorkflowEmailCampaignParams,
  MCPGetEmailCampaignStatsParams,
  MCPGetWorkflowEmailReportParams
} from '../types/ghl-types.js';

/**
 * Email Tools Class
 * Implements MCP tools for email campaigns and templates
 */
export class EmailTools {
  constructor(private ghlClient: GHLApiClient) {}

  /**
   * Get all email tool definitions for MCP server
   */
  getToolDefinitions(): Tool[] {
    return [
      {
        name: 'get_email_campaigns',
        description: 'Get a list of email campaigns from GoHighLevel.',
        inputSchema: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              description: 'Filter campaigns by status.',
              enum: ['active', 'pause', 'complete', 'cancelled', 'retry', 'draft', 'resend-scheduled'],
              default: 'active'
            },
            limit: {
              type: 'number',
              description: 'Maximum number of campaigns to return.',
              default: 10
            },
            offset: {
              type: 'number',
              description: 'Number of campaigns to skip for pagination.',
              default: 0
            }
          }
        }
      },
      {
        name: 'create_email_template',
        description: 'Create a new email template in GoHighLevel.',
        inputSchema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Title of the new template.'
            },
            html: {
              type: 'string',
              description: 'HTML content of the template.'
            },
            isPlainText: {
              type: 'boolean',
              description: 'Whether the template is plain text.',
              default: false
            }
          },
          required: ['title', 'html']
        }
      },
      {
        name: 'get_email_templates',
        description: 'Get a list of email templates from GoHighLevel. Without folderId, returns root-level templates and folder objects. With folderId, returns the templates inside that folder.',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Maximum number of templates to return.',
              default: 10
            },
            offset: {
              type: 'number',
              description: 'Number of templates to skip for pagination.',
              default: 0
            },
            folderId: {
              type: 'string',
              description: 'List the templates inside this folder ID; omit for root level. Folder IDs are returned by the root-level call as items with templateType "folder".'
            },
            includeNested: {
              type: 'boolean',
              description: 'When true, fetches root-level templates plus all templates inside every folder, returning a flat list. Each template includes a "folderName" and "folderId" field indicating which folder it came from (null for root-level). This makes N+1 API calls (one per folder). Cannot be combined with folderId.',
              default: false
            }
          }
        }
      },
      {
        name: 'update_email_template',
        description: 'Update an existing email template in GoHighLevel.',
        inputSchema: {
          type: 'object',
          properties: {
            templateId: {
              type: 'string',
              description: 'The ID of the template to update.'
            },
            html: {
              type: 'string',
              description: 'The updated HTML content of the template.'
            },
            previewText: {
              type: 'string',
              description: 'The updated preview text for the template.'
            }
          },
          required: ['templateId', 'html']
        }
      },
      {
        name: 'delete_email_template',
        description: 'Delete an email template from GoHighLevel.',
        inputSchema: {
          type: 'object',
          properties: {
            templateId: {
              type: 'string',
              description: 'The ID of the template to delete.'
            }
          },
          required: ['templateId']
        }
      },
      {
        name: 'get_email_template_content',
        description: 'Fetch the rendered HTML body of an email template by ID (or by previewUrl) and return it inline. Resolves the template\'s Firebase previewUrl server-side and fetches it. Use this to read live template content for auditing/diffing against a blueprint.',
        inputSchema: {
          type: 'object',
          properties: {
            templateId: {
              type: 'string',
              description: 'The ID of the template. Resolved to a previewUrl via the email template list. Provide this or previewUrl.'
            },
            previewUrl: {
              type: 'string',
              description: 'The Firebase previewUrl of the template (e.g. from get_email_templates output). Fast path - fetched directly, no listing needed. Provide this or templateId.'
            },
            locationId: {
              type: 'string',
              description: 'Optional. Defaults to the active sub-account (same default as the other email tools).'
            }
          }
        }
      },
      {
        name: 'list_workflow_email_campaigns',
        description: 'List workflow email campaigns for the active sub-account (Email API v3). Each campaign\'s sourceId is the workflow UUID (join key to ghl_get_workflows). Requires the emails/campaigns.readonly PIT scope. Full delivered/bounce/unsub metrics require LC Email (Mailgun) as sender.',
        inputSchema: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              description: 'Filter campaigns by status.',
              enum: ['published', 'draft']
            },
            search: {
              type: 'string',
              description: 'Filter campaigns by name.'
            },
            limit: {
              type: 'number',
              description: 'Max campaigns to return (1-20).',
              default: 20
            },
            offset: {
              type: 'number',
              description: 'Number of campaigns to skip for pagination.',
              default: 0
            }
          }
        }
      },
      {
        name: 'get_workflow_email_campaign',
        description: 'Get a single workflow email campaign by ID, including its per-email steps (subSources[]) - one per email action in the workflow, with name, subject, step id (subSourceId for stats), and editorContentUrl (fetchable HTML for a copy audit). Email API v3; requires emails/campaigns.readonly scope.',
        inputSchema: {
          type: 'object',
          properties: {
            campaignId: {
              type: 'string',
              description: 'The campaign id from list_workflow_email_campaigns.'
            }
          },
          required: ['campaignId']
        }
      },
      {
        name: 'get_email_campaign_stats',
        description: 'Get engagement statistics (sent/delivered/opened/clicked/replied/bounced/unsubscribed + precomputed rates) for a campaign, or a single email step when subSourceId is given. Returns a rolling last-30-days window (no custom date range available on this endpoint). Email API v3; requires emails/stats.readonly scope.',
        inputSchema: {
          type: 'object',
          properties: {
            source: {
              type: 'string',
              description: 'The campaign source type.',
              enum: ['email-campaigns', 'workflow-campaigns', 'bulk-actions'],
              default: 'workflow-campaigns'
            },
            sourceId: {
              type: 'string',
              description: 'For workflow-campaigns this is the workflow sourceId (UUID) - that is the identifier the stats endpoint keys off. A campaign id (mongo-style) is auto-resolved to its sourceId, since keying off the campaign id returns all-zero counters. For email-campaigns/bulk-actions, pass that source\'s id.'
            },
            subSourceId: {
              type: 'string',
              description: 'Optional. Only valid for workflow-campaigns. The step id from get_workflow_email_campaign; omit for whole-workflow totals.'
            }
          },
          required: ['sourceId']
        }
      },
      {
        name: 'get_workflow_email_report',
        description: 'One-call engagement report for a workflow nurture: resolves the campaign, pulls every email step, and returns a flat analysis-ready table (per-email sent/delivered/openRate/clickRate/replyRate/bounceRate/unsubscribed/complained) plus whole-workflow totals. Stats are a rolling last-30-days window. Email API v3; requires emails/campaigns.readonly + emails/stats.readonly scopes.',
        inputSchema: {
          type: 'object',
          properties: {
            workflow: {
              type: 'string',
              description: 'Workflow name (case-insensitive contains), workflow UUID (sourceId), or campaign id. One of workflow or campaignId is required.'
            },
            campaignId: {
              type: 'string',
              description: 'Direct campaign id (skips name resolution). One of workflow or campaignId is required.'
            }
          }
        }
      }
    ];
  }

  /**
   * Execute email tool based on tool name and arguments
   */
  async executeTool(name: string, args: any): Promise<any> {
    switch (name) {
      case 'get_email_campaigns':
        return this.getEmailCampaigns(args as MCPGetEmailCampaignsParams);
      case 'create_email_template':
        return this.createEmailTemplate(args as MCPCreateEmailTemplateParams);
      case 'get_email_templates':
        return this.getEmailTemplates(args as MCPGetEmailTemplatesParams);
      case 'update_email_template':
        return this.updateEmailTemplate(args as MCPUpdateEmailTemplateParams);
      case 'delete_email_template':
        return this.deleteEmailTemplate(args as MCPDeleteEmailTemplateParams);
      case 'get_email_template_content':
        return this.getEmailTemplateContent(args as MCPGetEmailTemplateContentParams);
      case 'list_workflow_email_campaigns':
        return this.listWorkflowEmailCampaigns(args as MCPListWorkflowEmailCampaignsParams);
      case 'get_workflow_email_campaign':
        return this.getWorkflowEmailCampaign(args as MCPGetWorkflowEmailCampaignParams);
      case 'get_email_campaign_stats':
        return this.getEmailCampaignStats(args as MCPGetEmailCampaignStatsParams);
      case 'get_workflow_email_report':
        return this.getWorkflowEmailReport(args as MCPGetWorkflowEmailReportParams);
      default:
        throw new Error(`Unknown email tool: ${name}`);
    }
  }

  private async getEmailCampaigns(params: MCPGetEmailCampaignsParams): Promise<{ success: boolean; campaigns: GHLEmailCampaign[]; total: number; message: string }> {
    try {
      const response = await this.ghlClient.getEmailCampaigns(params);
      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Failed to get email campaigns.');
      }
      return {
        success: true,
        campaigns: response.data.schedules,
        total: response.data.total,
        message: `Successfully retrieved ${response.data.schedules.length} email campaigns.`
      };
    } catch (error) {
      throw new Error(`Failed to get email campaigns: ${error}`);
    }
  }

  private async createEmailTemplate(params: MCPCreateEmailTemplateParams): Promise<{ success: boolean; template: any; message: string }> {
    try {
      const response = await this.ghlClient.createEmailTemplate(params);
      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Failed to create email template.');
      }
      return {
        success: true,
        template: response.data,
        message: `Successfully created email template.`
      };
    } catch (error) {
      throw new Error(`Failed to create email template: ${error}`);
    }
  }

  /**
   * Extract the builders array from the GHL email templates response.
   * The API returns { templates: { builders: [...], total: [...] } } but
   * historically this was typed as a flat array.
   */
  private extractBuilders(data: any): GHLEmailTemplate[] {
    if (Array.isArray(data)) return data;
    const builders = data?.templates?.builders ?? data?.builders;
    return Array.isArray(builders) ? builders : [];
  }

  private async getEmailTemplates(params: MCPGetEmailTemplatesParams): Promise<{ success: boolean; templates: any; message: string }> {
    try {
      const { includeNested, folderId } = params;

      const response = await this.ghlClient.getEmailTemplates(params);
      if (!response.success || !response.data) {
        return { success: false, templates: [], message: response.error?.message || 'Failed to get email templates.' };
      }

      const builders = this.extractBuilders(response.data);

      // If includeNested is requested (and no specific folderId), fetch all folder children
      if (includeNested && !folderId) {
        const folders = builders.filter((t: any) => t.templateType === 'folder');
        const rootTemplates = builders
          .filter((t: any) => t.templateType !== 'folder')
          .map((t: any) => ({ ...t, folderName: null, folderId: null }));

        const nested: any[] = [];
        for (const folder of folders) {
          try {
            const folderResp = await this.ghlClient.getEmailTemplates({
              limit: params.limit ?? 200,
              offset: 0,
              folderId: folder.id
            });
            const folderBuilders = this.extractBuilders(folderResp?.data);
            for (const child of folderBuilders) {
              nested.push({ ...child, folderName: folder.name, folderId: folder.id });
            }
          } catch (err: any) {
            console.error(`[EmailTools] Failed to fetch folder ${folder.id} (${folder.name}): ${err?.message ?? String(err)}`);
          }
        }

        const allTemplates = [...rootTemplates, ...nested];
        return {
          success: true,
          templates: allTemplates,
          message: `Successfully retrieved ${rootTemplates.length} root templates and ${nested.length} nested templates from ${folders.length} folders.`
        };
      }

      return {
        success: true,
        templates: builders,
        message: `Successfully retrieved ${builders.length} email templates.`
      };
    } catch (error: any) {
      return { success: false, templates: [], message: `Failed to get email templates: ${error?.message ?? String(error)}` };
    }
  }

  private async updateEmailTemplate(params: MCPUpdateEmailTemplateParams): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.ghlClient.updateEmailTemplate(params);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to update email template.');
      }
      return {
        success: true,
        message: 'Successfully updated email template.'
      };
    } catch (error) {
      throw new Error(`Failed to update email template: ${error}`);
    }
  }

  private async deleteEmailTemplate(params: MCPDeleteEmailTemplateParams): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.ghlClient.deleteEmailTemplate(params);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to delete email template.');
      }
      return {
        success: true,
        message: 'Successfully deleted email template.'
      };
    } catch (error) {
      throw new Error(`Failed to delete email template: ${error}`);
    }
  }

  /**
   * Fetch a Firebase-hosted previewUrl server-side with a plain GET.
   * No auth header is sent - the download token is already in the URL.
   * Never throws: returns a status/ok pair instead.
   */
  private async fetchFirebaseHtml(url: string): Promise<{ ok: boolean; status: number; html?: string }> {
    try {
      const response = await axios.get<string>(url, {
        timeout: 15000,
        responseType: 'text',
        // Keep the body as a raw string regardless of content-type.
        transformResponse: [(data) => data],
        // Never throw on non-2xx - we inspect the status ourselves.
        validateStatus: () => true
      });
      const ok = response.status >= 200 && response.status < 300;
      return { ok, status: response.status, html: ok ? (response.data as string) : undefined };
    } catch (error: any) {
      // Network/timeout error - surface as a non-ok status without throwing.
      console.error(`[EmailTools] Firebase fetch error: ${error?.message ?? String(error)}`);
      return { ok: false, status: error?.response?.status ?? 0 };
    }
  }

  /**
   * Resolve a templateId to its previewUrl by reusing the existing list call
   * (which carries the GHL auth + active sub-account routing).
   * Searches root-level templates first, then falls back to folder contents.
   */
  private async resolvePreviewUrl(templateId: string): Promise<{ previewUrl?: string; name?: string }> {
    const response = await this.ghlClient.getEmailTemplates({ limit: 200, offset: 0 });
    const builders = this.extractBuilders(response?.data);

    // Search root-level templates first
    let hit = builders.find((t: any) => t.id === templateId);
    if (hit) return { previewUrl: hit.previewUrl, name: hit.name };

    // Folder fallback: search inside each folder
    const folders = builders.filter((t: any) => t.templateType === 'folder');
    for (const folder of folders) {
      try {
        const folderResp = await this.ghlClient.getEmailTemplates({
          limit: 200,
          offset: 0,
          folderId: folder.id
        });
        const folderBuilders = this.extractBuilders(folderResp?.data);
        hit = folderBuilders.find((t: any) => t.id === templateId);
        if (hit) return { previewUrl: hit.previewUrl, name: hit.name };
      } catch {
        // Skip this folder, keep searching
      }
    }

    return {};
  }

  /**
   * Fetch the rendered HTML body of an email template and return it inline.
   * Hard requirement: this must NEVER throw - a single uncaught exception has
   * previously crash-looped the Railway server. Always return { success, ... }.
   */
  private async getEmailTemplateContent(
    params: MCPGetEmailTemplateContentParams
  ): Promise<{ success: boolean; templateId?: string; name?: string; sizeBytes?: number; html?: string; error?: string }> {
    try {
      let { templateId, previewUrl } = params;

      if (!templateId && !previewUrl) {
        return { success: false, error: 'Provide either templateId or previewUrl.' };
      }

      let name: string | undefined;

      // Resolve previewUrl from the listing when only an ID was supplied.
      if (!previewUrl && templateId) {
        const resolved = await this.resolvePreviewUrl(templateId);
        previewUrl = resolved.previewUrl;
        name = resolved.name;
        if (!previewUrl) {
          return {
            success: false,
            error: `templateId ${templateId} not found at root or in any folder.`
          };
        }
      }

      let resp = await this.fetchFirebaseHtml(previewUrl!);

      // Stale-token retry: Firebase download tokens rotate when a template is
      // updated. If we have an ID, re-resolve a fresh URL once and retry.
      if (!resp.ok && (resp.status === 403 || resp.status === 401) && templateId) {
        console.error(`[EmailTools] Stale token for template ${templateId} (HTTP ${resp.status}); re-resolving previewUrl.`);
        const resolved = await this.resolvePreviewUrl(templateId);
        if (resolved.previewUrl) {
          name = name ?? resolved.name;
          resp = await this.fetchFirebaseHtml(resolved.previewUrl);
        }
      }

      if (!resp.ok || !resp.html) {
        return { success: false, error: `Firebase fetch failed (HTTP ${resp.status}).` };
      }

      return {
        success: true,
        templateId,
        name,
        sizeBytes: Buffer.byteLength(resp.html, 'utf8'),
        html: resp.html
      };
    } catch (error: any) {
      // Must never throw - see hard constraints.
      return { success: false, error: `get_email_template_content failed: ${error?.message ?? String(error)}` };
    }
  }

  // -------------------------------------------------------------------------
  // Email Statistics (Email API v3)
  // -------------------------------------------------------------------------

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Walk the workflow-campaigns list to find the "other" id for a given one:
   * given a campaign `id` returns its `sourceId`, given a `sourceId` returns its
   * `id`. Used to recover from GOTCHA-3 (stats keyed off the wrong identifier).
   */
  private async resolveAlternateId(providedId: string): Promise<string | undefined> {
    try {
      let offset = 0;
      const limit = 20;
      // Cap pagination so a mismatch can never loop unbounded.
      for (let page = 0; page < 25; page++) {
        const resp = await this.ghlClient.listWorkflowEmailCampaigns({ limit, offset });
        const campaigns = resp?.data?.campaigns ?? [];
        for (const c of campaigns) {
          if (c.id === providedId && c.sourceId) return c.sourceId;
          if (c.sourceId === providedId && c.id) return c.id;
        }
        if (campaigns.length < limit) break;
        offset += limit;
      }
    } catch (err: any) {
      console.error(`[EmailTools] resolveAlternateId failed: ${err?.message ?? String(err)}`);
    }
    return undefined;
  }

  /**
   * Fetch workflow-campaign stats using the correct identifier.
   *
   * GOTCHA 3 (resolved against live data): the stats endpoint keys off the
   * workflow `sourceId` (UUID), NOT the campaign `id`. Passing the campaign id
   * returns HTTP 200 with an all-zero stats object - it does not 404 - so we
   * must key off sourceId primarily and only fall back to the campaign id if
   * sourceId genuinely 404s.
   */
  private async getWorkflowStats(
    workflowSourceId: string | undefined,
    campaignId: string | undefined,
    subSourceId?: string
  ): Promise<{ stats: GHLEmailCampaignStats; idUsed: 'sourceId' | 'id'; sourceIdUsed: string }> {
    const primary = workflowSourceId ?? campaignId;
    if (!primary) {
      throw new Error('No workflow sourceId or campaignId available for stats.');
    }
    const primaryKind: 'sourceId' | 'id' = workflowSourceId ? 'sourceId' : 'id';
    try {
      const r = await this.ghlClient.getEmailCampaignStats('workflow-campaigns', primary, subSourceId);
      return { stats: r.data?.stats ?? {}, idUsed: primaryKind, sourceIdUsed: primary };
    } catch (error: any) {
      const msg = error?.message ?? String(error);
      if (workflowSourceId && campaignId && campaignId !== workflowSourceId && /\b404\b/.test(msg)) {
        const r = await this.ghlClient.getEmailCampaignStats('workflow-campaigns', campaignId, subSourceId);
        console.error(`[EmailTools] stats fallback: sourceId '${workflowSourceId}' returned 404, used campaign id '${campaignId}'.`);
        return { stats: r.data?.stats ?? {}, idUsed: 'id', sourceIdUsed: campaignId };
      }
      throw error;
    }
  }

  private async listWorkflowEmailCampaigns(
    params: MCPListWorkflowEmailCampaignsParams
  ): Promise<{ success: boolean; campaigns?: any[]; total?: number; message: string }> {
    try {
      const response = await this.ghlClient.listWorkflowEmailCampaigns(params);
      const data = response.data;
      const campaigns = (data?.campaigns ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        sourceId: c.sourceId,
        deleted: c.deleted
      }));
      return {
        success: true,
        campaigns,
        total: data?.total ?? campaigns.length,
        message: `Successfully retrieved ${campaigns.length} workflow email campaign(s).`
      };
    } catch (error: any) {
      return { success: false, message: `Failed to list workflow email campaigns: ${error?.message ?? String(error)}` };
    }
  }

  private async getWorkflowEmailCampaign(
    params: MCPGetWorkflowEmailCampaignParams
  ): Promise<{ success: boolean; campaign?: any; message: string }> {
    try {
      if (!params.campaignId) {
        return { success: false, message: 'campaignId is required.' };
      }
      const response = await this.ghlClient.getWorkflowEmailCampaign(params.campaignId);
      const detail = response.data;
      const subSources = (detail?.subSources ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        subject: s.subject,
        fromName: s.fromName,
        fromEmail: s.fromEmail,
        editorType: s.editorType,
        editorContentUrl: s.editorContentUrl,
        createdAt: s.createdAt
      }));
      return {
        success: true,
        campaign: {
          id: detail?.id,
          name: detail?.name,
          status: detail?.status,
          sourceId: detail?.sourceId,
          subSources
        },
        message: `Successfully retrieved campaign with ${subSources.length} email step(s).`
      };
    } catch (error: any) {
      return { success: false, message: `Failed to get workflow email campaign: ${error?.message ?? String(error)}` };
    }
  }

  private async getEmailCampaignStats(
    params: MCPGetEmailCampaignStatsParams
  ): Promise<{ success: boolean; stats?: GHLEmailCampaignStats; idUsed?: string; sourceIdUsed?: string; message: string }> {
    try {
      if (!params.sourceId) {
        return { success: false, message: 'sourceId is required.' };
      }
      const source: GHLEmailStatsSource = params.source ?? 'workflow-campaigns';

      // Non-workflow sources: single direct call (no id/sourceId duality).
      if (source !== 'workflow-campaigns') {
        const r = await this.ghlClient.getEmailCampaignStats(source, params.sourceId, params.subSourceId);
        return {
          success: true,
          stats: r.data?.stats ?? {},
          sourceIdUsed: params.sourceId,
          message: 'Successfully retrieved stats (last 30 days).'
        };
      }

      // workflow-campaigns: stats key off the workflow sourceId (UUID). If the
      // caller passed a campaign id (mongo-style, no dashes), resolve it to the
      // sourceId so we don't silently get an all-zero response.
      const given = params.sourceId;
      let workflowSourceId: string | undefined;
      let campaignId: string | undefined;
      if (given.includes('-')) {
        workflowSourceId = given;
        campaignId = await this.resolveAlternateId(given);
      } else {
        campaignId = given;
        workflowSourceId = (await this.resolveAlternateId(given)) ?? given;
      }

      const result = await this.getWorkflowStats(workflowSourceId, campaignId, params.subSourceId);
      return {
        success: true,
        stats: result.stats,
        idUsed: result.idUsed,
        sourceIdUsed: result.sourceIdUsed,
        message: `Successfully retrieved stats (last 30 days) using ${result.idUsed}.`
      };
    } catch (error: any) {
      return { success: false, message: `Failed to get email campaign stats: ${error?.message ?? String(error)}` };
    }
  }

  /**
   * Aggregator: resolve a workflow nurture to a campaign, pull every email step,
   * and return a flat analysis-ready table plus whole-workflow totals.
   * Stats are a rolling last-30-days window (GHL server-side; no custom range).
   */
  private async getWorkflowEmailReport(
    params: MCPGetWorkflowEmailReportParams
  ): Promise<any> {
    try {
      if (!params.campaignId && !params.workflow) {
        return { success: false, message: 'Provide either workflow (name/UUID/campaign id) or campaignId.' };
      }

      // 1. Resolve the campaign.
      let campaignId = params.campaignId;
      if (!campaignId) {
        const needle = (params.workflow ?? '').toLowerCase();
        let offset = 0;
        const limit = 20;
        let found: any;
        for (let page = 0; page < 25 && !found; page++) {
          const resp = await this.ghlClient.listWorkflowEmailCampaigns({ limit, offset });
          const campaigns = resp?.data?.campaigns ?? [];
          found = campaigns.find(
            (c) =>
              (c.name && c.name.toLowerCase().includes(needle)) ||
              c.sourceId === params.workflow ||
              c.id === params.workflow
          );
          if (found || campaigns.length < limit) break;
          offset += limit;
        }
        if (!found) {
          return { success: false, message: `No workflow campaign matched "${params.workflow}".` };
        }
        campaignId = found.id;
      }

      // 2. Get the per-email steps.
      const detailResp = await this.ghlClient.getWorkflowEmailCampaign(campaignId!);
      const detail = detailResp.data;
      const steps = [...(detail?.subSources ?? [])].sort(
        (a, b) => +new Date(a.createdAt ?? 0) - +new Date(b.createdAt ?? 0)
      );

      const workflowSourceId = detail?.sourceId;
      let idUsed: 'id' | 'sourceId' | undefined;

      // 3. Per-step stats (throttled ~8/sec to respect the rate limit).
      const emails: any[] = [];
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        try {
          const r = await this.getWorkflowStats(workflowSourceId, detail!.id, s.id);
          idUsed = idUsed ?? r.idUsed;
          const st = r.stats;
          emails.push({
            step: i + 1,
            name: s.name,
            subject: s.subject,
            sent: st.sent,
            delivered: st.delivered,
            openRate: st.openRate,
            clickRate: st.clickRate,
            replyRate: st.replyRate,
            bounceRate: st.bounceRate,
            unsubscribed: st.unsubscribed,
            complained: st.complained
          });
        } catch (err: any) {
          emails.push({ step: i + 1, name: s.name, subject: s.subject, error: err?.message ?? String(err) });
        }
        if (i < steps.length - 1) await this.sleep(130);
      }

      // 4. Whole-workflow totals.
      let totals: GHLEmailCampaignStats | undefined;
      let totalsError: string | undefined;
      try {
        const t = await this.getWorkflowStats(workflowSourceId, detail!.id);
        totals = t.stats;
        idUsed = idUsed ?? t.idUsed;
      } catch (err: any) {
        totalsError = err?.message ?? String(err);
      }

      return {
        success: true,
        workflow: detail?.name,
        campaignId: detail?.id,
        workflowId: workflowSourceId,
        statsWindow: 'last-30-days',
        idUsed,
        totals,
        ...(totalsError ? { totalsError } : {}),
        emails,
        message: `Report for "${detail?.name}": ${emails.length} email step(s), stats keyed off ${idUsed ?? 'unknown'} (last 30 days).`
      };
    } catch (error: any) {
      return { success: false, message: `Failed to build workflow email report: ${error?.message ?? String(error)}` };
    }
  }
}