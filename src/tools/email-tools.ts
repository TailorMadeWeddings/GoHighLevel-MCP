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
  GHLEmailTemplate
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
}