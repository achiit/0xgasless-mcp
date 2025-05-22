// main.ts
import * as dotenv from 'dotenv';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool
} from '@modelcontextprotocol/sdk/types.js';
import { version } from './version.js';

// Load environment variables
dotenv.config();

// Tool definitions - available immediately
const tools: Tool[] = [
  {
    name: 'get-address',
    description: 'Gets the wallet address',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    },
  },
  {
    name: 'get-balance',
    description: 'Gets the balance of a token',
    inputSchema: {
      type: 'object',
      properties: {
        address: {
          type: 'string',
          description: 'Token contract address',
        },
      },
      required: ['address'],
    },
  },
  {
    name: 'transfer-token',
    description: 'Transfer tokens to another address',
    inputSchema: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Recipient address',
        },
        address: {
          type: 'string',
          description: 'Token contract address',
        },
        amount: {
          type: 'string',
          description: 'Amount to transfer',
        },
      },
      required: ['to', 'address', 'amount'],
    },
  },
  {
    name: 'swap-tokens',
    description: 'Swap one token for another',
    inputSchema: {
      type: 'object',
      properties: {
        fromToken: {
          type: 'string',
          description: 'Source token address',
        },
        toToken: {
          type: 'string',
          description: 'Destination token address',
        },
        amount: {
          type: 'string',
          description: 'Amount to swap',
        },
      },
      required: ['fromToken', 'toToken', 'amount'],
    },
  },
];

// Agent state
let agentInitialized = false;
let agentInstance: any = null;
let agentConfig: any = null;

// Initialize agent lazily
async function getAgent() {
  if (agentInitialized) {
    return { agent: agentInstance, config: agentConfig };
  }

  // Import dynamically to avoid blocking server startup
  const { getOrCreateAgent } = await import('./lib/agent.js');
  
  const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
  const result = await getOrCreateAgent(privateKey);
  
  agentInstance = result.agent;
  agentConfig = result.config;
  agentInitialized = true;
  
  return result;
}

export async function main() {
  // Validate required environment variables
  const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
  const rpcUrl = process.env.RPC_URL;
  const apiKey = process.env.API_KEY;
  
  if (!privateKey || !rpcUrl || !apiKey) {
    console.error('Missing required environment variables');
    process.exit(1);
  }

  // Create MCP server - this should be fast
  const server = new Server(
    {
      name: '0xGasless MCP Server',
      version,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Handle tools list - respond immediately
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
  });

  // Handle tool calls - initialize agent on first use
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      // Get agent (initialize if needed)
      const { agent, config } = await getAgent();
      
      // Process the request
      const result = await processToolCall(agent, config, request.params.name, request.params.arguments);
      
      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
      };
    } catch (error) {
      console.error('Tool call error:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  });

  // Connect to transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Process tool calls
async function processToolCall(agent: any, config: any, toolName: string, args: any) {
  let prompt = '';
  
  switch (toolName) {
    case 'get-address':
      prompt = 'What is my wallet address?';
      break;
    case 'get-balance':
      prompt = `Check my balance of token at address ${args.address}`;
      break;
    case 'transfer-token':
      prompt = `Transfer ${args.amount} tokens from ${args.address} to ${args.to}`;
      break;
    case 'swap-tokens':
      prompt = `Swap ${args.amount} tokens from ${args.fromToken} to ${args.toToken}`;
      break;
    default:
      prompt = `Use the ${toolName} tool with arguments: ${JSON.stringify(args)}`;
  }
  
  // Use invoke instead of stream for simpler processing
  const result = await agent.invoke({ input: prompt }, config);
  
  // Extract the response
  if (result.messages && result.messages.length > 0) {
    const lastMessage = result.messages[result.messages.length - 1];
    return lastMessage.content || JSON.stringify(result);
  }
  
  return result.output || JSON.stringify(result);
}