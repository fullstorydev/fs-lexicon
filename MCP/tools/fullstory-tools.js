/**
 * FullStory Tools - MCP Explicit Handler Pattern (JSON Schema, Spec-Compliant)
 *
 * - All tool registration is explicit, stateless, and MCP-compliant
 * - All tool schemas use plain JSON Schema
 * - No legacy registration, no Zod, no .tool() API
 */

import fullstoryConnector from '../../Fullstory.js';
import { inputValidator } from '../validation/inputValidator.js';
import config from '../../config.js';

// --- TOOL SCHEMAS (aligned with Fullstory.js) ---
const fullstoryTools = [
  // --- Session Profile APIs (all params as per JSDoc) ---
  {
    name: 'fullstory_get_profile',
    description: 'Get a session profile (FullStory v2)',
    inputSchema: {
      type: 'object',
      properties: {
        profile_id: { type: 'string', description: 'The session profile ID (required, used as a path parameter)' },
        // Only profile_id is required and supported for getSessionProfile
      },
      required: ['profile_id']
    }
  },
  {
    name: 'fullstory_list_session_profiles',
    description: 'List session profiles (FullStory v2)',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query string to filter profiles by name or ID' },
        limit: { type: 'number', description: 'Maximum number of profiles to return (default: 100)' },
        offset: { type: 'number', description: 'Number of profiles to skip for pagination (default: 0)' },
        sort: { type: 'string', description: "Sort order (e.g., 'created_time', 'name')" }
      },
      required: []
    }
  },
  {
    name: 'fullstory_update_profile',
    description: 'Update a session profile (FullStory v2)',
    inputSchema: {
      type: 'object',
      properties: {
        profile_id: { type: 'string', description: 'The session profile ID (required, used as a path parameter)' },
        slice: {
          type: 'object',
          description: 'Slicing options for the session',
          properties: {
            mode: { type: 'string', enum: ['UNSPECIFIED', 'FIRST', 'LAST', 'TIMESTAMP'], description: "Slicing mode" },
            event_limit: { type: 'number', description: 'Limit number of events' },
            duration_limit_ms: { type: 'number', description: 'Limit session duration in ms' },
            start_timestamp: { type: 'string', description: 'Start timestamp for slicing (ISO8601)' }
          }
        },
        context: {
          type: 'object',
          description: 'Context configuration',
          properties: {
            include: { type: 'array', items: { type: 'string' }, description: 'Fields to include in the context' },
            exclude: { type: 'array', items: { type: 'string' }, description: 'Fields to exclude from the context' }
          }
        },
        events: {
          type: 'object',
          description: 'Events configuration',
          properties: {
            include_types: { type: 'array', items: { type: 'string' }, description: 'Event types to include' },
            exclude_types: { type: 'array', items: { type: 'string' }, description: 'Event types to exclude' }
          }
        },
        cache: { type: 'object', description: 'Cache configuration (object)' },
        llm: {
          type: 'object',
          description: 'LLM configuration',
          properties: {
            model: { type: 'string', enum: ['GEMINI_2_FLASH', 'GEMINI_2_FLASH_LITE'], description: 'LLM model to use' },
            temperature: { type: 'number', description: 'LLM temperature (randomness)' }
          }
        },
        name: { type: 'string', description: 'The display name of the profile' }
      },
      required: ['profile_id']
    }
  },
  {
    name: 'fullstory_delete_profile',
    description: 'Delete a session profile (FullStory v2)',
    inputSchema: {
      type: 'object',
      properties: {
        profile_id: { type: 'string', description: 'The session profile ID (required, used as a path parameter)' },
        // Optional: slice, context, events, cache, llm, name (for body)
        slice: { type: 'object', description: 'Slicing options for the session' },
        context: { type: 'object', description: 'Context configuration' },
        events: { type: 'object', description: 'Events configuration' },
        cache: { type: 'object', description: 'Cache configuration' },
        llm: { type: 'object', description: 'LLM configuration' },
        name: { type: 'string', description: 'The display name of the profile' }
      },
      required: ['profile_id']
    }
  },
  {
    name: 'fullstory_generate_session_context',
    description: 'Generate context for a session (FullStory v2)',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'The unique identifier for the session (required)' },
        options: {
          type: 'object',
          description: 'Optional configuration for context generation',
          properties: {
            config_profile: { type: 'string', description: 'Optional configuration profile to use for context generation' },
            slice: {
              type: 'object',
              description: 'Slicing options for the session',
              properties: {
                mode: { type: 'string', enum: ['UNSPECIFIED', 'FIRST', 'LAST', 'TIMESTAMP'], description: 'Slicing mode' },
                event_limit: { type: 'number', description: 'Limit number of events' },
                duration_limit_ms: { type: 'number', description: 'Limit session duration in ms' },
                start_timestamp: { type: 'string', description: 'Start timestamp for slicing (ISO8601)' }
              }
            },
            context: {
              type: 'object',
              description: 'Context configuration',
              properties: {
                include: { type: 'array', items: { type: 'string' }, description: 'Fields to include in the context' },
                exclude: { type: 'array', items: { type: 'string' }, description: 'Fields to exclude from the context' }
              }
            },
            events: {
              type: 'object',
              description: 'Events configuration',
              properties: {
                include_types: { type: 'array', items: { type: 'string' }, description: 'Event types to include' },
                exclude_types: { type: 'array', items: { type: 'string' }, description: 'Event types to exclude' }
              }
            },
            cache: { type: 'object', description: 'Cache configuration (object)' },
            llm: {
              type: 'object',
              description: 'LLM configuration',
              properties: {
                model: { type: 'string', enum: ['GEMINI_2_FLASH', 'GEMINI_2_FLASH_LITE'], description: 'LLM model to use' },
                temperature: { type: 'number', description: 'LLM temperature (randomness)' }
              }
            }
          }
        }
      },
      required: ['session_id']
    }
  },
  {
    name: 'fullstory_generate_context',
    description: 'Generate generic context for a session (FullStory v2)',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'The unique identifier for the session (required)' },
        options: {
          type: 'object',
          description: 'Optional configuration for context generation',
          properties: {
            config_profile: { type: 'string', description: 'Optional configuration profile to use for context generation' },
            slice: {
              type: 'object',
              description: 'Slicing options for the session',
              properties: {
                mode: { type: 'string', enum: ['UNSPECIFIED', 'FIRST', 'LAST', 'TIMESTAMP'], description: 'Slicing mode' },
                event_limit: { type: 'number', description: 'Limit number of events' },
                duration_limit_ms: { type: 'number', description: 'Limit session duration in ms' },
                start_timestamp: { type: 'string', description: 'Start timestamp for slicing (ISO8601)' }
              }
            },
            context: {
              type: 'object',
              description: 'Context configuration',
              properties: {
                include: { type: 'array', items: { type: 'string' }, description: 'Fields to include in the context' },
                exclude: { type: 'array', items: { type: 'string' }, description: 'Fields to exclude from the context' }
              }
            },
            events: {
              type: 'object',
              description: 'Events configuration',
              properties: {
                include_types: { type: 'array', items: { type: 'string' }, description: 'Event types to include' },
                exclude_types: { type: 'array', items: { type: 'string' }, description: 'Event types to exclude' }
              }
            },
            cache: { type: 'object', description: 'Cache configuration (object)' },
            llm: {
              type: 'object',
              description: 'LLM configuration',
              properties: {
                model: { type: 'string', enum: ['GEMINI_2_FLASH', 'GEMINI_2_FLASH_LITE'], description: 'LLM model to use' },
                temperature: { type: 'number', description: 'LLM temperature (randomness)' }
              }
            }
          }
        }
      },
      required: ['session_id']
    }
  },
  {
    name: 'fullstory_generate_session_summary',
    description: 'Generate summary for a session profile (FullStory v2)',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: 'The unique identifier for the user (required)' },
        session_id: { type: 'string', description: 'The unique identifier for the session (required)' },
        config_profile: { type: 'string', description: 'Optional configuration profile to use for the summary' }
      },
      required: ['user_id', 'session_id']
    }
  },
  {
    name: 'fullstory_get_session_events',
    description: 'Get session events for a session profile (FullStory v2)',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: 'The unique identifier for the user (required)' },
        session_id: { type: 'string', description: 'The unique identifier for the session (required)' }
      },
      required: ['user_id', 'session_id']
    }
  },
  {
    name: 'fullstory_get_session_insights',
    description: 'Get session insights, behavioral clustering, and session metadata for a session (FullStory v2). Provides comprehensive session analysis including behavioral patterns, event clustering, session metadata extracted from source properties, and configurable output modes for different use cases.',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: 'The unique identifier for the user (required)' },
        session_id: { type: 'string', description: 'The unique identifier for the session (required)' },
        outputMode: { 
          type: 'string', 
          enum: ['verbose', 'default', 'light'],
          description: 'Output mode controlling data inclusion level. "verbose": includes all data (events, timeline, dropoff points, full behavioral clustering). "default": includes summary data with behavioral categories and session flow. "light": minimal data with just session metadata, analysis summary, and session URL. Defaults to "default".'
        }
      },
      required: ['user_id', 'session_id']
    }
  },
  // V2 User APIs
  {
    name: 'fullstory_create_user',
    description: 'Create a user (FullStory v2)',
    inputSchema: {
      type: 'object',
      properties: {
        uid: { type: 'string', description: 'User ID (recommended, required for updates)' },
        display_name: { type: 'string' },
        email: { type: 'string' },
        avatar_url: { type: 'string' },
        phone: { type: 'string' },
        role: { type: 'string' },
        created_time: { type: 'string' },
        properties: { type: 'object' },
        custom: { type: 'object' }
      },
      required: []
    }
  },
  {
    name: 'fullstory_get_user',
    description: 'Get user by ID (FullStory v2)',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID (required)' }
      },
      required: ['userId']
    }
  },
  {
    name: 'fullstory_update_user',
    description: 'Update user properties (FullStory v2)',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID (required)' },
        updates: { type: 'object', description: 'Properties to update' }
      },
      required: ['userId', 'updates']
    }
  },
  {
    name: 'fullstory_delete_user',
    description: 'Delete user (FullStory v2)',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID (required)' }
      },
      required: ['userId']
    }
  },
  {
    name: 'fullstory_create_users_batch',
    description: 'Batch create or update users (FullStory v2)',
    inputSchema: {
      type: 'object',
      properties: {
        users: { type: 'array', items: { type: 'object' }, description: 'Array of user objects' }
      },
      required: ['users']
    }
  },
  // V2 Event APIs
  {
    name: 'fullstory_create_event',
    description: 'Create custom event (FullStory v2)',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Event name (required)' },
        timestamp: { type: 'string' },
        properties: { type: 'object' },
        user: { type: 'object' },
        session: { type: 'object' }
      },
      required: ['name']
    }
  },
  {
    name: 'fullstory_create_events_batch',
    description: 'Batch create events (FullStory v2)',
    inputSchema: {
      type: 'object',
      properties: {
        events: { type: 'array', items: { type: 'object' }, description: 'Array of event objects' }
      },
      required: ['events']
    }
  },
  {
    name: 'fullstory_get_batch_job_status',
    description: 'Get batch import job status (FullStory v2)',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Batch job ID (required)' }
      },
      required: ['jobId']
    }
  },
  {
    name: 'fullstory_get_batch_job_errors',
    description: 'Get batch import job errors (FullStory v2)',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Batch job ID (required)' }
      },
      required: ['jobId']
    }
  },
  // Annotation APIs
  {
    name: 'fullstory_create_annotation',
    description: 'Create Fullstory Analytics annotations',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The annotation\'s text (required, max 200 characters)' },
        start_time: { type: 'string', description: 'The annotation\'s start time in ISO 8601 format. If not provided, the current FullStory server time will be used.' },
        end_time: { type: 'string', description: 'The annotation\'s end time in ISO 8601 format. If not provided, it will be set to the annotation\'s start_time. If provided, must be after start_time.' },
        source: { type: 'string', description: 'A string representing the source or creator of this annotation (max 40 characters), which will be displayed on the annotation\'s visualization.' }
      },
      required: ['text']
    }
  },
  // V1 APIs
  {
    name: 'fullstory_list_sessions',
    description: 'List sessions for a user (FullStory v1)',
    inputSchema: {
      type: 'object',
      properties: {
        uid: { type: 'string' },
        email: { type: 'string' },
        limit: { type: 'number' }
      },
      required: []
    }
  },
  {
    name: 'fullstory_set_user_properties_v1',
    description: 'Set custom properties for a user (FullStory v1)',
    inputSchema: {
      type: 'object',
      properties: {
        uid: { type: 'string', description: 'User ID (required)' },
        properties: { type: 'object', description: 'User properties' },
        options: { type: 'object' }
      },
      required: ['uid', 'properties']
    }
  },
  {
    name: 'fullstory_set_user_events_v1',
    description: 'Set custom events for a user (FullStory v1)',
    inputSchema: {
      type: 'object',
      properties: {
        uid: { type: 'string', description: 'User ID (required)' },
        events: { type: 'array', items: { type: 'object' }, description: 'Array of event objects' }
      },
      required: ['uid', 'events']
    }
  },
  {
    name: 'fullstory_create_segment_export',
    description: 'Create segment export (FullStory v1)',
    inputSchema: {
      type: 'object',
      properties: {
        segmentId: { type: 'string', description: 'Segment ID (required)' },
        type: { type: 'string', description: 'Type of data to export (required)' },
        format: { type: 'string', description: 'Data format (required)' },
        timeRange: { type: 'object', description: 'Time range (required)' },
        segmentTimeRange: { type: 'object' },
        timezone: { type: 'string' },
        fields: { type: 'array', items: { type: 'string' } },
        eventDetails: { type: 'object' }
      },
      required: ['segmentId', 'type', 'format', 'timeRange']
    }
  },
  {
    name: 'fullstory_get_segment_export_status',
    description: 'Get segment export status (FullStory v1)',
    inputSchema: {
      type: 'object',
      properties: {
        exportId: { type: 'string', description: 'Export job ID (required)' }
      },
      required: ['exportId']
    }
  },
  {
    name: 'fullstory_get_recording_block_rules',
    description: 'Get recording block rules (FullStory v1)',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'fullstory_get_user_events',
    description: 'Get user events (FullStory v1)',
    inputSchema: {
      type: 'object',
      properties: {
        uid: { type: 'string', description: 'User ID (required)' },
        options: { type: 'object' }
      },
      required: ['uid']
    }
  },
  {
    name: 'fullstory_get_user_pages',
    description: 'Get user pages (FullStory v1)',
    inputSchema: {
      type: 'object',
      properties: {
        uid: { type: 'string', description: 'User ID (required)' },
        options: { type: 'object' }
      },
      required: ['uid']
    }
  },
  // Analytics, Insights, Health
  {
    name: 'fullstory_get_user_profile',
    description: 'Get comprehensive user profile',
    inputSchema: {
      type: 'object',
      properties: {
        userIdentifier: { type: 'string', description: 'User ID or UID (required)' }
      },
      required: ['userIdentifier']
    }
  },
  {
    name: 'fullstory_get_user_analytics',
    description: 'Get comprehensive analytics for a user',
    inputSchema: {
      type: 'object',
      properties: {
        userIdentifier: { type: 'string', description: 'User ID or UID (required)' },
        options: { type: 'object' }
      },
      required: ['userIdentifier']
    }
  },
  {
    name: 'fullstory_health_check',
    description: 'Health check for FullStory API connectivity',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  // ...add more as needed...
];

// --- SAFE_MODE logic ---
const SAFE_MODE = config.getBoolean('safe_mode', false);
const SAFE_TOOL_NAMES = [
  'fullstory_get_profile',
  'fullstory_list_session_profiles',
  'fullstory_get_session_events',
  'fullstory_generate_session_context',
  'fullstory_generate_session_summary',
  'fullstory_get_session_insights',
  'fullstory_get_user_profile',
  'fullstory_get_user_analytics',
  'fullstory_get_user_events',
  'fullstory_get_user_pages',
  'fullstory_list_sessions',
  'fullstory_get_segment_export_status',
  'fullstory_get_recording_block_rules',
  'fullstory_health_check',
  // Add any other read-only tools here
];
const exportedTools = SAFE_MODE
  ? fullstoryTools.filter(tool => SAFE_TOOL_NAMES.includes(tool.name))
  : fullstoryTools;

// --- DISPATCHER (aligned with Fullstory.js) ---
async function fullstoryDispatcher(request) {
  const { name, arguments: args } = request.params;
  if (SAFE_MODE && !SAFE_TOOL_NAMES.includes(name)) {
    return {
      content: [{ type: 'text', text: `This tool is not available in SAFE_MODE: ${name}` }],
      isError: true,
    };
  }

  // Find the tool schema for validation
  const toolSchema = fullstoryTools.find(tool => tool.name === name)?.inputSchema;
  
  // Validate and sanitize input arguments
  const validation = inputValidator.validateToolArguments(name, args, toolSchema);
  if (!validation.isValid) {
    return {
      content: [{
        type: 'text',
        text: `Input validation failed: ${validation.errors.join('; ')}`
      }],
      isError: true,
      _validationErrors: validation.errors
    };
  }
  
  // Use sanitized arguments for processing
  const sanitizedArgs = validation.sanitizedArgs;
  function asPrettyText(obj) {
    // Return human-readable, pretty-printed text for objects, else string
    if (typeof obj === 'string') return obj;
    try {
      return JSON.stringify(obj, null, 2);
    } catch (e) {
      return String(obj);
    }
  }
  switch (name) {
    case 'fullstory_get_profile': {
      const result = await fullstoryConnector.getSessionProfile(sanitizedArgs);
      return {
        content: [
          { type: 'text', text: asPrettyText(result) }
        ],
        structuredContent: result
      };
    }
    case 'fullstory_list_session_profiles': {
      const result = await fullstoryConnector.listSessionProfiles(sanitizedArgs);
      return {
        content: [
          { type: 'text', text: asPrettyText(result) }
        ],
        structuredContent: result
      };
    }
    case 'fullstory_get_session_insights': {
      // Ensure outputMode parameter is properly passed through
      const insightsArgs = {
        user_id: sanitizedArgs.user_id,
        session_id: sanitizedArgs.session_id,
        outputMode: sanitizedArgs.outputMode || 'default'
      };
      const result = await fullstoryConnector.getSessionInsights(insightsArgs);
      return {
        content: [
          { type: 'text', text: asPrettyText(result) }
        ],
        structuredContent: result
      };
    }
    case 'fullstory_update_profile': {
      const result = await fullstoryConnector.updateSessionProfile(sanitizedArgs);
      return {
        content: [
          { type: 'text', text: asPrettyText(result) }
        ],
        structuredContent: result
      };
    }
    case 'fullstory_delete_profile': {
      const result = await fullstoryConnector.deleteSessionProfile(sanitizedArgs);
      return {
        content: [
          { type: 'text', text: asPrettyText(result) }
        ],
        structuredContent: result
      };
    }
    case 'fullstory_generate_session_context': {
      const result = await fullstoryConnector.generateSessionContext(sanitizedArgs.session_id, sanitizedArgs.options || {});
      return {
        content: [
          { type: 'text', text: asPrettyText(result) }
        ],
        structuredContent: result
      };
    }
    case 'fullstory_generate_context': {
      const result = await fullstoryConnector.generateSessionContext(sanitizedArgs.session_id, sanitizedArgs.options || {});
      return {
        content: [
          { type: 'text', text: asPrettyText(result) }
        ],
        structuredContent: result
      };
    }
    case 'fullstory_generate_session_summary': {
      const result = await fullstoryConnector.getSessionSummary(sanitizedArgs.user_id, sanitizedArgs.session_id, sanitizedArgs.config_profile);
      return {
        content: [
          { type: 'text', text: asPrettyText(result) }
        ],
        structuredContent: result
      };
    }
    case 'fullstory_get_session_events': {
      const result = await fullstoryConnector.getSessionEvents(sanitizedArgs.user_id, sanitizedArgs.session_id);
      return {
        content: [
          { type: 'text', text: asPrettyText(result) }
        ],
        structuredContent: result
      };
    }
    case 'fullstory_create_user': {
      const result = await fullstoryConnector.createUser(sanitizedArgs);
      return {
        content: [
          { type: 'text', text: asPrettyText(result) }
        ],
        structuredContent: result
      };
    }
    case 'fullstory_get_user': {
      const result = await fullstoryConnector.getUser(sanitizedArgs.userId);
      return {
        content: [
          { type: 'text', text: asPrettyText(result) }
        ],
        structuredContent: result
      };
    }
    case 'fullstory_update_user': {
      const result = await fullstoryConnector.updateUser(sanitizedArgs.userId, sanitizedArgs.updates);
      return {
        content: [
          { type: 'text', text: asPrettyText(result) }
        ],
        structuredContent: result
      };
    }
    case 'fullstory_delete_user': {
      const result = await fullstoryConnector.deleteUser(sanitizedArgs.userId);
      return {
        content: [
          { type: 'text', text: asPrettyText(result) }
        ],
        structuredContent: result
      };
    }
    case 'fullstory_create_users_batch': {
      const result = await fullstoryConnector.createUsersBatch(sanitizedArgs.users);
      return {
        content: [
          { type: 'text', text: asPrettyText(result) }
        ],
        structuredContent: result
      };
    }
    case 'fullstory_create_event': {
      const result = await fullstoryConnector.createEvent(sanitizedArgs);
      return {
        content: [
          { type: 'text', text: asPrettyText(result) }
        ],
        structuredContent: result
      };
    }
    case 'fullstory_create_events_batch': {
      const result = await fullstoryConnector.createEventsBatch(sanitizedArgs.events);
      return {
        content: [
          { type: 'text', text: asPrettyText(result) }
        ],
        structuredContent: result
      };
    }
    case 'fullstory_get_batch_job_status': {
      const result = await fullstoryConnector.getBatchJobStatus(sanitizedArgs.jobId);
      return {
        content: [
          { type: 'text', text: asPrettyText(result) }
        ],
        structuredContent: result
      };
    }
    case 'fullstory_get_batch_job_errors': {
      const result = await fullstoryConnector.getBatchJobErrors(sanitizedArgs.jobId);
      return {
        content: [
          { type: 'text', text: asPrettyText(result) }
        ],
        structuredContent: result
      };
    }
    case 'fullstory_create_annotation': {
      const result = await fullstoryConnector.createAnnotation(sanitizedArgs);
      return {
        content: [
          { type: 'text', text: asPrettyText(result) }
        ],
        structuredContent: result
      };
    }
    case 'fullstory_list_sessions': {
      const result = await fullstoryConnector.listSessions(sanitizedArgs);
      return {
        content: [
          { type: 'text', text: asPrettyText(result) }
        ],
        structuredContent: result
      };
    }
    case 'fullstory_set_user_properties_v1': {
      const result = await fullstoryConnector.setUserPropertiesV1(sanitizedArgs.uid, sanitizedArgs.properties, sanitizedArgs.options);
      return {
        content: [
          { type: 'text', text: asPrettyText(result) }
        ],
        structuredContent: result
      };
    }
    case 'fullstory_set_user_events_v1': {
      const result = await fullstoryConnector.setUserEventsV1(sanitizedArgs.uid, sanitizedArgs.events);
      return {
        content: [
          { type: 'text', text: asPrettyText(result) }
        ],
        structuredContent: result
      };
    }
    case 'fullstory_create_segment_export': {
      const result = await fullstoryConnector.createSegmentExport(sanitizedArgs);
      return {
        content: [
          { type: 'text', text: asPrettyText(result) }
        ],
        structuredContent: result
      };
    }
    case 'fullstory_get_segment_export_status': {
      const result = await fullstoryConnector.getSegmentExportStatus(sanitizedArgs.exportId);
      return {
        content: [
          { type: 'text', text: asPrettyText(result) }
        ],
        structuredContent: result
      };
    }
    case 'fullstory_get_recording_block_rules': {
      const result = await fullstoryConnector.getRecordingBlockRules();
      return {
        content: [
          { type: 'text', text: asPrettyText(result) }
        ],
        structuredContent: result
      };
    }
    case 'fullstory_get_user_events': {
      const result = await fullstoryConnector.getUserEvents(sanitizedArgs.uid, sanitizedArgs.options);
      return {
        content: [
          { type: 'text', text: asPrettyText(result) }
        ],
        structuredContent: result
      };
    }
    case 'fullstory_get_user_pages': {
      const result = await fullstoryConnector.getUserPages(sanitizedArgs.uid, sanitizedArgs.options);
      return {
        content: [
          { type: 'text', text: asPrettyText(result) }
        ],
        structuredContent: result
      };
    }
    case 'fullstory_get_user_profile': {
      const result = await fullstoryConnector.getUserProfile(sanitizedArgs.userIdentifier);
      return {
        content: [
          { type: 'text', text: asPrettyText(result) }
        ],
        structuredContent: result
      };
    }
    case 'fullstory_get_user_analytics': {
      const result = await fullstoryConnector.getUserAnalytics(sanitizedArgs.userIdentifier, sanitizedArgs.options);
      return {
        content: [
          { type: 'text', text: asPrettyText(result) }
        ],
        structuredContent: result
      };
    }
    case 'fullstory_health_check': {
      const result = await fullstoryConnector.healthCheck();
      return {
        content: [
          { type: 'text', text: asPrettyText(result) }
        ],
        structuredContent: result
      };
    }

    default:
      return {
        content: [{ type: 'text', text: `Unknown fullstory tool: ${name}` }],
        isError: true,
      };
  }
}

export { exportedTools as fullstoryTools, fullstoryDispatcher };
