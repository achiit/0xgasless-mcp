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
          description: 'Token contract address (use 0x0000000000000000000000000000000000000000 for BNB)',
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
  if (agentInitialized && agentInstance && agentConfig) {
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
      console.error(`Executing tool: ${request.params.name} with args:`, request.params.arguments);
      
      // Get agent (initialize if needed)
      const { agent, config } = await getAgent();
      
      // Process the request with more specific prompts
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

// Process tool calls with more direct instructions
async function processToolCall(agent: any, config: any, toolName: string, args: any) {
  let prompt = '';
  
  switch (toolName) {
    case 'get-address':
      prompt = 'Execute the get_wallet_address tool and return only my wallet address. Do not ask questions, just return the address.';
      break;
      
    case 'get-balance':
      const tokenAddress = args.address || '0x0000000000000000000000000000000000000000';
      prompt = `Execute the get_balance tool for token address ${tokenAddress}. Return the exact balance without asking questions. If this is address 0x0000000000000000000000000000000000000000, check BNB balance.`;
      break;
      
    case 'transfer-token':
      prompt = `Execute a token transfer: send ${args.amount} tokens from contract ${args.address} to recipient ${args.to}. Perform the actual transfer operation using the transfer tool.`;
      break;
      
    case 'swap-tokens':
      prompt = `Execute a token swap: swap ${args.amount} tokens from ${args.fromToken} to ${args.toToken}. Use the swap tool to perform the actual swap operation.`;
      break;
      
    default:
      prompt = `Execute the ${toolName} tool with these exact parameters: ${JSON.stringify(args)}. Perform the actual operation, do not ask for clarification.`;
  }
  
  try {
    console.error(`Sending prompt to agent: ${prompt}`);
    
    // Use invoke with a more direct configuration
    const result = await agent.invoke(
      { 
        input: prompt,
        // Add instruction to be direct
        system: "Execute the requested blockchain operation directly. Do not ask for confirmation or provide explanations unless there's an error. Return only the result."
      }, 
      {
        ...config,
        // Force direct execution
        recursionLimit: 10
      }
    );
    
    console.error('Agent result:', JSON.stringify(result, null, 2));
    
    // Better result extraction
    if (result.messages && result.messages.length > 0) {
      const lastMessage = result.messages[result.messages.length - 1];
      
      // Look for the actual content in the message
      if (lastMessage.content) {
        return lastMessage.content;
      }
      
      // Check if it's a tool call result
      if (lastMessage.additional_kwargs?.tool_calls) {
        const toolCall = lastMessage.additional_kwargs.tool_calls[0];
        return `Tool executed: ${toolCall.function.name}\nResult: ${toolCall.function.arguments}`;
      }
    }
    
    // Fallback to output or stringified result
    return result.output || result.content || JSON.stringify(result);
    
  } catch (error) {
    console.error('Error in processToolCall:', error);
    return `Error executing ${toolName}: ${error instanceof Error ? error.message : String(error)}`;
  }
}